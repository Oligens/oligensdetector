import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "oligens_session";
const MAX_TEXT_LENGTH = 100_000;

type Options = { intensity?: unknown; language?: unknown; mode?: unknown };

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.status(status).json(body);
}

function getBody(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body as Record<string, unknown>;
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function getCookie(header: string | undefined, name: string): string | null {
  return header?.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="))?.slice(name.length + 1) ?? null;
}

function b64decode(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function verifySessionCookie(cookieHeader: string | undefined): boolean {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  const token = getCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const [h, p, s] = parts;
    const header = JSON.parse(b64decode(h) ?? "");
    const payload = JSON.parse(b64decode(p) ?? "");
    if (header?.alg !== "HS256") return false;
    if (payload?.iss && payload.iss !== "oligens-detector") return false;
    if (typeof payload?.exp === "number" && payload.exp <= Math.floor(Date.now() / 1000)) return false;

    const expected = createHmac("sha256", secret).update(h + "." + p).digest("base64url");
    const received = Buffer.from(s);
    const calculated = Buffer.from(expected);
    return received.length === calculated.length && timingSafeEqual(received, calculated);
  } catch {
    return false;
  }
}

function normalize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;!?…])/g, "$1")
    .trim();
}

function languageOf(text: string, requested: unknown): "fr" | "en" {
  if (requested === "fr" || requested === "en") return requested;
  const fr = (text.toLowerCase().match(/\b(le|la|les|des|une|est|sont|que|qui|dans|pour|avec|sur|ce|cette|et|du|au|mais|nous|par|en)\b/g) ?? []).length;
  const en = (text.toLowerCase().match(/\b(the|and|of|to|is|in|that|for|with|are|was|on|as|at|by|this|it|from|or)\b/g) ?? []).length;
  return fr >= en ? "fr" : "en";
}

function replaceInsensitive(text: string, pattern: RegExp, replacement: string): [string, number] {
  let count = 0;
  const result = text.replace(pattern, match => {
    count++;
    if (match === match.toUpperCase()) return replacement.toUpperCase();
    if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
  });
  return [result, count];
}

function humanize(text: string, options: Options) {
  const original = normalize(text);
  const language = languageOf(original, options.language);
  const parsedIntensity = Number(options.intensity);
  const intensity = Number.isFinite(parsedIntensity) ? Math.max(0.5, Math.min(1, parsedIntensity)) : 0.78;
  let result = original;
  let changes = 0;

  const replacements: Array<[RegExp, string]> = language === "fr"
    ? [
        [/\bil est important de noter que\b/gi, "on peut retenir que"],
        [/\bil convient de souligner que\b/gi, "on peut souligner que"],
        [/\ben outre\b/gi, "de plus"],
        [/\bpar conséquent\b/gi, "ainsi"],
        [/\bcependant\b/gi, "mais"],
        [/\bnéanmoins\b/gi, "malgré tout"],
        [/\bpar ailleurs\b/gi, "d'un autre côté"],
        [/\bnotamment\b/gi, "en particulier"],
        [/\bégalement\b/gi, "aussi"],
        [/\bpermet de\b/gi, "sert à"],
        [/\bpermettent de\b/gi, "servent à"],
        [/\butiliser\b/gi, "employer"],
        [/\butilise\b/gi, "emploie"],
        [/\bimportant\b/gi, "majeur"],
      ]
    : [
        [/\bit is important to note that\b/gi, "it is worth noting that"],
        [/\bin addition\b/gi, "also"],
        [/\bmoreover\b/gi, "besides"],
        [/\btherefore\b/gi, "so"],
        [/\bhowever\b/gi, "but"],
        [/\butilize\b/gi, "use"],
        [/\bdemonstrate\b/gi, "show"],
        [/\bnumerous\b/gi, "many"],
        [/\bsignificant\b/gi, "notable"],
      ];

  for (const [pattern, replacement] of replacements) {
    const next = replaceInsensitive(result, pattern, replacement);
    result = next[0];
    if (next[1]) changes++;
  }

  const sentences = result.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length >= 3 && intensity >= 0.68) {
    const connectors = language === "fr"
      ? ["De fait,", "Dans les faits,", "Concrètement,", "Sur ce point,"]
      : ["In fact,", "In practice,", "More concretely,", "On this point,"];
    for (let i = 1; i < sentences.length && changes < 6; i++) {
      if ((i + 1) % 4 !== 0 || /^(De fait|Dans les faits|Concrètement|Sur ce point|In fact|In practice|More concretely|On this point),/i.test(sentences[i])) continue;
      const first = sentences[i][0];
      if (!first) continue;
      sentences[i] = connectors[changes % connectors.length] + " " + first.toLowerCase() + sentences[i].slice(1);
      changes++;
    }
    result = sentences.join(" ");
  }

  result = normalize(result);
  if (result === original && sentences.length >= 3) {
    const cut = Math.max(1, Math.floor(sentences.length / 2));
    result = sentences.slice(0, cut).join(" ") + "\n\n" + sentences.slice(cut).join(" ");
    changes = 1;
  }

  return { text: result, changes, intensity, language, changed: result !== original };
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Oligens-Humanizer", "vercel-local-v5");

  try {
    if (req.method !== "POST") {
      return json(res, 405, { success: false, error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });
    }

    if (!verifySessionCookie(req.headers.cookie)) {
      return json(res, 401, { success: false, error: "Connexion requise.", code: "AUTH_REQUIRED" });
    }

    const body = getBody(req);
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (text.length < 20) {
      return json(res, 400, { success: false, error: "Le texte à humaniser est trop court.", code: "TEXT_TOO_SHORT" });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return json(res, 413, { success: false, error: "Le texte dépasse 100 000 caractères.", code: "TEXT_TOO_LARGE" });
    }

    const started = Date.now();
    const output = humanize(text, { intensity: body.intensity, language: body.language, mode: body.mode });

    return json(res, 200, {
      success: true,
      status: "success",
      text: output.text,
      texteFinal: output.text,
      originalText: text,
      original_text: text,
      humanizedText: output.text,
      humanized_text: output.text,
      provider: "local",
      engine_used: "COJ_Local_TS_Humanizer",
      engine_name: "COJ Local TypeScript Humanizer",
      engine_version: "5.0.0",
      analysis_mode: "local_zero_dependency",
      offline_engine: true,
      python_subprocess: false,
      external_dependency: false,
      fallback_engine: false,
      processing_time_ms: Date.now() - started,
      metrics: {
        original_length: text.length,
        humanized_length: output.text.length,
        changed: output.changed,
        changes: output.changes,
        intensity: output.intensity,
        language: output.language,
        mode: "humanize",
      },
    });
  } catch (error) {
    console.error("[humanize] fatal handler error", error);
    const body = getBody(req);
    const text = typeof body.text === "string" ? normalize(body.text).slice(0, MAX_TEXT_LENGTH) : "";

    if (text.length >= 20) {
      return json(res, 200, {
        success: true,
        status: "degraded",
        text,
        texteFinal: text,
        originalText: text,
        original_text: text,
        humanizedText: text,
        humanized_text: text,
        provider: "local-safe-recovery",
        engine_used: "COJ_Safe_Recovery",
        engine_version: "5.0.0",
        analysis_mode: "safe_recovery",
        fallback_engine: true,
        error_recovered: true,
      });
    }

    return json(res, 500, { success: false, error: "Le service d'humanisation a rencontré une erreur interne.", code: "HUMANIZE_INTERNAL_ERROR" });
  }
}
