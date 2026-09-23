import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Pool, type QueryResultRow } from "pg";

const COOKIE = "oligens_session";
let pool: Pool | undefined;

function dbUrl() {
  const value = process.env.DATABASE_URL?.trim()
    || process.env.DIRECT_DATABASE_URL?.trim()
    || process.env.POSTGRES_URL?.trim()
    || process.env.POSTGRES_URL_NON_POOLING?.trim()
    || process.env.NEON_DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL non configurée.");
  return value;
}

function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: dbUrl(),
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true },
    application_name: "oligens-detector-web-index",
  });
  return pool;
}

async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  return getPool().query<T>(sql, values);
}

function token(req: VercelRequest) {
  return (req.headers.cookie ?? "")
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
}

async function userId(req: VercelRequest): Promise<string | null> {
  const secret = process.env.AUTH_SECRET?.trim();
  const raw = token(req);
  if (!secret || secret.length < 32 || !raw) return null;
  try {
    const payload = jwt.verify(raw, secret, { issuer: "oligens-detector" }) as jwt.JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function words(text: string): string[] {
  return text.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

function buildQueries(text: string, language: string): string[] {
  const sentences = text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map(s => s.trim())
    .filter(s => words(s).length >= 8);

  const candidates = sentences
    .sort((a, b) => words(b).length - words(a).length)
    .slice(0, 3)
    .map(sentence => {
      const tokens = words(sentence).filter(w => w.length > 4);
      return tokens.slice(0, 18).join(" ");
    })
    .filter(Boolean);

  const whole = words(text).filter(w => w.length > 4).slice(0, 20).join(" ");
  const queries = [...candidates, whole].filter(Boolean);
  return [...new Set(queries)].slice(0, 3).map(q => language === "fr" ? `${q} lang:fr` : q);
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\u0000/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30_000);
}

function normalizeUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

type WebSource = {
  id: string;
  title: string;
  url: string;
  text: string;
  snippet: string;
  domain: string;
  sourceType: "web";
  indexedAt: string;
};

async function searchBrave(queryText: string, language: string): Promise<WebSource[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY non configurée.");

  const url = new URL("https://api.search.brave.com/res/v1/llm/context");
  url.searchParams.set("q", queryText);
  url.searchParams.set("country", "US");
  url.searchParams.set("search_lang", language === "fr" ? "fr" : "en");
  url.searchParams.set("maximum_number_of_urls", "8");
  url.searchParams.set("maximum_number_of_snippets", "5");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Brave Search a répondu ${response.status}.`);

  const data = await response.json() as Record<string, unknown>;
  const grounding = data.grounding && typeof data.grounding === "object"
    ? data.grounding as Record<string, unknown>
    : {};
  const generic = Array.isArray(grounding.generic) ? grounding.generic : [];
  const output: WebSource[] = [];

  for (const item of generic) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = normalizeUrl(row.url);
    const title = String(row.title ?? "Source Web").trim();
    const snippets = Array.isArray(row.snippets) ? row.snippets.map(cleanText).filter(Boolean) : [];
    const text = snippets.join("\n\n").slice(0, 30_000);
    if (!url || text.length < 80) continue;

    let domain = "";
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    output.push({
      id: crypto.createHash("sha256").update(url).digest("hex").slice(0, 32),
      title: title.slice(0, 500),
      url,
      text,
      snippet: text.slice(0, 500),
      domain,
      sourceType: "web",
      indexedAt: new Date().toISOString(),
    });
  }
  return output;
}

async function persistSources(user: string, queryText: string, sources: WebSource[]) {
  for (const source of sources) {
    const contentHash = crypto.createHash("sha256").update(source.text).digest("hex");
    await query(
      `INSERT INTO web_sources
        (id,user_id,url,title,text,snippet,domain,source_type,search_query,content_hash,indexed_at,last_seen_at,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW(),$11::jsonb)
       ON CONFLICT(user_id,url) DO UPDATE SET
         title=EXCLUDED.title,
         text=EXCLUDED.text,
         snippet=EXCLUDED.snippet,
         domain=EXCLUDED.domain,
         search_query=EXCLUDED.search_query,
         content_hash=EXCLUDED.content_hash,
         last_seen_at=NOW(),
         metadata=EXCLUDED.metadata`,
      [
        crypto.randomUUID(), user, source.url, source.title, source.text, source.snippet,
        source.domain, source.sourceType, queryText, contentHash,
        JSON.stringify({ provider: "brave-llm-context", indexedBy: "oligens-detector" }),
      ],
    );
  }
}

async function indexedSources(user: string, limit = 60): Promise<WebSource[]> {
  const result = await query(
    `SELECT id,title,url,text,snippet,domain,source_type,indexed_at
     FROM web_sources WHERE user_id=$1 ORDER BY last_seen_at DESC LIMIT $2`,
    [user, Math.min(100, Math.max(1, limit))],
  );
  return result.rows.map(row => ({
    id: String(row.id),
    title: String(row.title),
    url: String(row.url),
    text: String(row.text),
    snippet: String(row.snippet ?? ""),
    domain: String(row.domain ?? ""),
    sourceType: "web",
    indexedAt: new Date(row.indexed_at).toISOString(),
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (!["GET", "POST"].includes(req.method ?? "")) {
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  try {
    const user = await userId(req);
    if (!user) return res.status(401).json({ error: "Authentification requise.", code: "AUTH_REQUIRED" });

    if (req.method === "GET") {
      return res.status(200).json({ sources: await indexedSources(user) });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 80) return res.status(400).json({ error: "Texte trop court pour une recherche Web.", code: "TEXT_TOO_SHORT" });
    if (text.length > 100_000) return res.status(413).json({ error: "Texte trop long.", code: "TEXT_TOO_LARGE" });

    const language = body.language === "fr" ? "fr" : "en";
    const queries = buildQueries(text, language);
    const all = new Map<string, WebSource>();

    for (const searchQuery of queries) {
      const found = await searchBrave(searchQuery, language);
      for (const source of found) {
        if (!all.has(source.url)) all.set(source.url, source);
        if (all.size >= 18) break;
      }
      if (all.size >= 18) break;
    }

    const sources = [...all.values()].slice(0, 18);
    await persistSources(user, queries.join(" | "), sources);

    return res.status(200).json({
      success: true,
      provider: "brave",
      indexed: sources.length,
      queries,
      sources: sources.map(({ id, title, url, text, snippet, domain, sourceType, indexedAt }) => ({
        id, title, url, text, snippet, domain, sourceType, indexedAt,
      })),
    });
  } catch (error) {
    console.error("[web-search] error", error);
    const message = error instanceof Error ? error.message : "Recherche Web indisponible.";
    if (message.includes("BRAVE_SEARCH_API_KEY")) {
      return res.status(503).json({ error: "Recherche Web non configurée. Ajoutez BRAVE_SEARCH_API_KEY dans Vercel.", code: "WEB_SEARCH_NOT_CONFIGURED" });
    }
    if (/DATABASE_URL|connection|ENOTFOUND|ETIMEDOUT|SSL/i.test(message)) {
      return res.status(503).json({ error: "Index Web temporairement indisponible.", code: "WEB_INDEX_UNAVAILABLE" });
    }
    return res.status(502).json({ error: message, code: "WEB_SEARCH_FAILED" });
  }
}
