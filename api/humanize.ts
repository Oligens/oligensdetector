import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "oligens_session";
const MAX_TEXT_LENGTH = 100_000;

type Options = { intensity?: unknown; language?: unknown; mode?: unknown };

type HumanizeResult = {
  text: string;
  changes: number;
  intensity: number;
  language: "fr" | "en";
  changed: boolean;
  sentence_count_before: number;
  sentence_count_after: number;
  lexical_replacements: number;
  structural_rewrites: number;
};

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
  const lower = text.toLowerCase();
  const fr = (lower.match(/\b(le|la|les|des|une|est|sont|que|qui|dans|pour|avec|sur|ce|cette|et|du|au|mais|nous|par|en)\b/g) ?? []).length;
  const en = (lower.match(/\b(the|and|of|to|is|in|that|for|with|are|was|on|as|at|by|this|it|from|or)\b/g) ?? []).length;
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

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);
}

function preserveTerminalPunctuation(source: string, value: string): string {
  const punctuation = source.match(/[.!?…]+$/)?.[0] ?? "";
  return value.replace(/[.!?…]+$/, "") + punctuation;
}

function transformFrenchSentence(sentence: string): [string, number] {
  let s = sentence;
  let changes = 0;

  const structuralRules: Array<[RegExp, string]> = [
    [/^Il est important de noter que\s+/i, "À retenir : "],
    [/^Il convient de souligner que\s+/i, "Un point mérite d'être souligné : "],
    [/^Il est intéressant de constater que\s+/i, "On constate surtout que "],
    [/^Dans le cadre de\s+(.+?)(,\s*)/i, "Pour $1$2"],
    [/^Afin de\s+(.+?)(,\s*)/i, "Pour $1$2"],
    [/^En raison de\s+(.+?)(,\s*)/i, "Comme $1$2"],
    [/^De manière générale,\s*/i, "En général, "],
    [/^En ce qui concerne\s+(.+?)(,\s*)/i, "Pour ce qui est de $1$2"],
    [/^Il est nécessaire de\s+/i, "Il faut "],
  ];

  for (const [pattern, replacement] of structuralRules) {
    const next = replaceInsensitive(s, pattern, replacement);
    if (next[1]) {
      s = next[0];
      changes += next[1];
    }
  }

  const lexicalRules: Array<[RegExp, string]> = [
    [/\bpermet de\b/gi, "sert à"],
    [/\bpermettent de\b/gi, "servent à"],
    [/\butiliser\b/gi, "employer"],
    [/\butilise\b/gi, "emploie"],
    [/\bcependant\b/gi, "mais"],
    [/\bnéanmoins\b/gi, "malgré tout"],
    [/\bpar conséquent\b/gi, "ainsi"],
    [/\ben outre\b/gi, "de plus"],
    [/\bnotamment\b/gi, "en particulier"],
    [/\bégalement\b/gi, "aussi"],
    [/\bimportant\b/gi, "essentiel"],
    [/\bsolution\b/gi, "réponse"],
    [/\boptimiser\b/gi, "améliorer"],
    [/\bfaciliter\b/gi, "simplifier"],
    [/\bafin de\b/gi, "pour"],
  ];

  for (const [pattern, replacement] of lexicalRules) {
    const next = replaceInsensitive(s, pattern, replacement);
    if (next[1]) {
      s = next[0];
      changes += next[1];
    }
  }

  const passive = s.match(/^(.+?)\s+est\s+conçu pour\s+(.+?)([.!?…]+)?$/i);
  if (passive) {
    s = preserveTerminalPunctuation(s, passive[1].trim() + " sert à " + passive[2].trim());
    changes++;
  }

  return [s, changes];
}

function transformEnglishSentence(sentence: string): [string, number] {
  let s = sentence;
  let changes = 0;

  const structuralRules: Array<[RegExp, string]> = [
    [/^It is important to note that\s+/i, "One point is worth keeping in mind: "],
    [/^It should be noted that\s+/i, "The key point is that "],
    [/^In order to\s+/i, "To "],
    [/^Due to the fact that\s+/i, "Because "],
    [/^With regard to\s+/i, "For "],
    [/^In the context of\s+/i, "Within "],
    [/^It is necessary to\s+/i, "We need to "],
  ];

  for (const [pattern, replacement] of structuralRules) {
    const next = replaceInsensitive(s, pattern, replacement);
    if (next[1]) {
      s = next[0];
      changes += next[1];
    }
  }

  const lexicalRules: Array<[RegExp, string]> = [
    [/\butilize\b/gi, "use"],
    [/\bdemonstrate\b/gi, "show"],
    [/\bnumerous\b/gi, "many"],
    [/\bsignificant\b/gi, "important"],
    [/\btherefore\b/gi, "so"],
    [/\bmoreover\b/gi, "also"],
    [/\bin addition\b/gi, "also"],
    [/\bhowever\b/gi, "but"],
    [/\bfacilitate\b/gi, "help"],
    [/\boptimize\b/gi, "improve"],
    [/\bimplement\b/gi, "build"],
  ];

  for (const [pattern, replacement] of lexicalRules) {
    const next = replaceInsensitive(s, pattern, replacement);
    if (next[1]) {
      s = next[0];
      changes += next[1];
    }
  }

  const passive = s.match(/^(.+?)\s+is\s+designed to\s+(.+?)([.!?…]+)?$/i);
  if (passive) {
    s = preserveTerminalPunctuation(s, passive[1].trim() + " is built to " + passive[2].trim());
    changes++;
  }

  return [s, changes];
}

function reorderAndSplit(sentences: string[], intensity: number): [string[], number] {
  if (sentences.length < 2 || intensity < 0.55) return [sentences, 0];

  const output = [...sentences];
  let changes = 0;

  for (let i = 0; i < output.length; i++) {
    const s = output[i];
    if (s.length < 150 || changes >= 3) continue;

    const comma = s.indexOf(", ");
    if (comma > 45 && comma < s.length - 45) {
      const first = s.slice(0, comma);
      const second = s.slice(comma + 2);
      output.splice(i, 1, first + ".", second.charAt(0).toUpperCase() + second.slice(1));
      changes++;
    }
  }

  return [output, changes];
}

function humanize(text: string, options: Options): HumanizeResult {
  const original = normalize(text);
  const language = languageOf(original, options.language);
  const requestedIntensity = Number(options.intensity);
  const intensity = Number.isFinite(requestedIntensity)
    ? Math.max(0.5, Math.min(1, requestedIntensity))
    : 0.78;

  const before = splitSentences(original);
  let lexicalReplacements = 0;
  let structuralRewrites = 0;

  let sentences = before.map(sentence => {
    const [transformed, changes] = language === "fr"
      ? transformFrenchSentence(sentence)
      : transformEnglishSentence(sentence);

    if (changes > 0) {
      const structural = /^((À retenir|Un point mérite|On constate|Pour |Comme |En général|Il faut|One point|The key point|To |Because |For |Within |We need to ))/i.test(transformed);
      if (structural) structuralRewrites++;
      lexicalReplacements += Math.max(0, changes - (structural ? 1 : 0));
    }

    return transformed;
  });

  const reordered = reorderAndSplit(sentences, intensity);
  sentences = reordered[0];
  structuralRewrites += reordered[1];

  let result = normalize(sentences.join(" "));

  if (result === original && before.length >= 3 && intensity >= 0.75) {
    const midpoint = Math.ceil(before.length / 2);
    result = normalize(before.slice(0, midpoint).join(" ") + "\n\n" + before.slice(midpoint).join(" "));
    structuralRewrites++;
  }

  const changes = lexicalReplacements + structuralRewrites;

  return {
    text: result,
    changes,
    intensity,
    language,
    changed: result !== original,
    sentence_count_before: before.length,
    sentence_count_after: splitSentences(result).length,
    lexical_replacements: lexicalReplacements,
    structural_rewrites: structuralRewrites,
  };
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Oligens-Humanizer", "vercel-local-v6");

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
    const output = humanize(text, {
      intensity: body.intensity,
      language: body.language,
      mode: body.mode,
    });

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
      engine_version: "6.0.0",
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
        sentence_count_before: output.sentence_count_before,
        sentence_count_after: output.sentence_count_after,
        lexical_replacements: output.lexical_replacements,
        structural_rewrites: output.structural_rewrites,
        transformation: "lexical_and_structural",
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
        engine_version: "6.0.0",
        analysis_mode: "safe_recovery",
        fallback_engine: true,
        error_recovered: true,
      });
    }

    return json(res, 500, { success: false, error: "Le service d'humanisation a rencontré une erreur interne.", code: "HUMANIZE_INTERNAL_ERROR" });
  }
}
