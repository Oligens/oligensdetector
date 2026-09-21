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


const FRENCH_LEXICAL: Array<[RegExp, string]> = [
  [/\bpermet de\b/gi, "sert à"],
  [/\bpermettent de\b/gi, "servent à"],
  [/\butiliser\b/gi, "employer"],
  [/\butilise\b/gi, "emploie"],
  [/\butilisent\b/gi, "emploient"],
  [/\bcependant\b/gi, "mais"],
  [/\bnéanmoins\b/gi, "malgré tout"],
  [/\bpar conséquent\b/gi, "ainsi"],
  [/\ben outre\b/gi, "de plus"],
  [/\bnotamment\b/gi, "en particulier"],
  [/\bégalement\b/gi, "aussi"],
  [/\bimportant\b/gi, "majeur"],
  [/\bimportante\b/gi, "majeure"],
  [/\bimportants\b/gi, "majeurs"],
  [/\bimportantes\b/gi, "majeures"],
  [/\bsolution\b/gi, "réponse"],
  [/\bsolutions\b/gi, "réponses"],
  [/\boptimiser\b/gi, "améliorer"],
  [/\bfaciliter\b/gi, "simplifier"],
  [/\bconstitue\b/gi, "forme"],
  [/\bconstituent\b/gi, "forment"],
  [/\bdémontrer\b/gi, "montrer"],
  [/\bnombreux\b/gi, "plusieurs"],
  [/\bnombreuses\b/gi, "plusieurs"],
  [/\bnécessaire\b/gi, "indispensable"],
  [/\bnécessaires\b/gi, "indispensables"],
  [/\bapproche\b/gi, "méthode"],
  [/\bapproches\b/gi, "méthodes"],
  [/\bpermettant\b/gi, "servant à"],
  [/\bintègre\b/gi, "s'appuie sur"],
  [/\bintègrent\b/gi, "s'appuient sur"],
  [/\boffre\b/gi, "met à disposition"],
  [/\boffrent\b/gi, "mettent à disposition"],
  [/\bprotéger\b/gi, "préserver"],
  [/\bpromouvoir\b/gi, "favoriser"],
  [/\bidentifier\b/gi, "repérer"],
  [/\brenforcer\b/gi, "consolider"],
  [/\bconçue\b/gi, "pensée"],
  [/\bconçu\b/gi, "pensé"]
];

const ENGLISH_LEXICAL: Array<[RegExp, string]> = [
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
  [/\bprovides\b/gi, "gives"],
  [/\bproviding\b/gi, "giving"],
  [/\bdesigned\b/gi, "built"],
  [/\bintegrates\b/gi, "brings together"],
  [/\bidentify\b/gi, "detect"],
  [/\bprotect\b/gi, "preserve"],
  [/\bpromote\b/gi, "encourage"],
  [/\bstrengthen\b/gi, "reinforce"]
];

function applyLexical(text: string, rules: Array<[RegExp, string]>): [string, number] {
  let result = text;
  let changes = 0;
  for (const [pattern, replacement] of rules) {
    const next = replaceInsensitive(result, pattern, replacement);
    if (next[1] > 0) {
      result = next[0];
      changes += next[1];
    }
  }
  return [result, changes];
}

function rewriteFrenchSentence(sentence: string, index: number): [string, number] {
  let s = sentence.trim();
  let changes = 0;

  const structuralRules: Array<[RegExp, string]> = [
    [
      /^(.+?)\s+est\s+une\s+(.+?)\s+qui\s+fusionne\s+(.+?)\s+pour\s+agir comme un\s+(.+?)([.!?…]+)$/i,
      "$1 réunit $3 au sein d'une $2. Elle sert de $4$5"
    ],
    [
      /^(.+?)\s+est\s+une\s+(.+?)\s+qui\s+(.+?)\s+pour\s+agir comme un\s+(.+?)([.!?…]+)$/i,
      "$1 repose sur une $2. Elle $3 afin d'agir comme un $5$6"
    ],
    [
      /^Conçue pour\s+(.+?),\s+(.+)$/i,
      "Pensée pour $1, $2"
    ],
    [
      /^Dotée d[’'](.+?),\s+elle\s+offre\s+(.+?)\s+un outil de pointe pour\s+(.+?)([.!?…]+)$/i,
      "Grâce à $1, elle met à la disposition $2 un outil conçu pour $3$4"
    ],
    [
      /^Dotée d[’'](.+?),\s+elle\s+(.+)$/i,
      "Avec $1, elle $2"
    ],
    [
      /^(.+?),\s+l'application\s+intègre\s+(.+)$/i,
      "Pour $1, l'application s'appuie sur $2"
    ],
    [
      /^(.+?),\s+l'application\s+(.+)$/i,
      "Pour $1, l'application $2"
    ],
    [
      /^(.+?)\s+intègre\s+(.+)$/i,
      "$1 s'appuie sur $2"
    ],
    [
      /^(.+?)\s+offre\s+(.+)$/i,
      "$1 met à disposition $2"
    ],
    [
      /^(.+?)\s+offrent\s+(.+)$/i,
      "$1 mettent à disposition $2"
    ],
    [
      /^(.+?)\s+fusionne\s+(.+?)\s+et\s+(.+?)\s+pour\s+(.+)$/i,
      "$1 réunit $2 et $3 afin de $4"
    ],
    [
      /^(.+?)\s+permet\s+de\s+(.+)$/i,
      "$1 sert à $2"
    ]
  ];

  for (const [pattern, replacement] of structuralRules) {
    const next = replaceInsensitive(s, pattern, replacement);
    if (next[1] > 0) {
      s = next[0];
      changes += next[1];
      break;
    }
  }

  const lexical = applyLexical(s, FRENCH_LEXICAL);
  s = lexical[0];
  changes += lexical[1];

  if (s === sentence.trim()) {
    const comma = s.search(/,\s+/);
    if (comma > 20 && comma < s.length - 20) {
      const left = s.slice(0, comma).trim();
      const right = s.slice(comma + 1).trim();
      const first = right.charAt(0).toUpperCase();
      s = right.replace(/^./, first) + " — " + left.toLowerCase();
    } else {
      const first = s.charAt(0);
      const rest = s.slice(1);
      s = (index % 2 === 0 ? "Dans les faits, " : "Concrètement, ") + first.toLowerCase() + rest;
    }
    changes++;
  }

  s = s.replace(/\bafin de agir\b/gi, "afin d'agir");
  return [preserveTerminalPunctuation(sentence, s), changes];
}

function rewriteEnglishSentence(sentence: string, index: number): [string, number] {
  let s = sentence.trim();
  let changes = 0;

  const structuralRules: Array<[RegExp, string]> = [
    [/^It is important to note that\s+(.+)$/i, "One point is worth keeping in mind: $1"],
    [/^It should be noted that\s+(.+)$/i, "The key point is this: $1"],
    [/^In order to\s+(.+)$/i, "To $1"],
    [/^Due to the fact that\s+(.+)$/i, "Because $1"],
    [/^With regard to\s+(.+)$/i, "As for $1"],
    [/^In the context of\s+(.+)$/i, "Within $1"],
    [/^It is necessary to\s+(.+)$/i, "We need to $1"],
    [/^Designed to\s+(.+?),\s+(.+)$/i, "Built to $1, $2"],
    [/^Equipped with\s+(.+?),\s+it\s+(.+)$/i, "With $1, it $2"],
    [/^(.+?)\s+is designed to\s+(.+)$/i, "$1 is built to $2"],
    [/^(.+?)\s+integrates\s+(.+)$/i, "$1 brings together $2"],
    [/^(.+?)\s+provides\s+(.+)$/i, "$1 gives $2"],
    [/^(.+?)\s+offers\s+(.+)$/i, "$1 gives $2"],
    [/^(.+?)\s+allows\s+(.+?)\s+to\s+(.+)$/i, "$1 lets $2 $3"]
  ];

  for (const [pattern, replacement] of structuralRules) {
    const next = replaceInsensitive(s, pattern, replacement);
    if (next[1] > 0) {
      s = next[0];
      changes += next[1];
      break;
    }
  }

  const lexical = applyLexical(s, ENGLISH_LEXICAL);
  s = lexical[0];
  changes += lexical[1];

  if (s === sentence.trim()) {
    const comma = s.search(/,\s+/);
    if (comma > 20 && comma < s.length - 20) {
      const left = s.slice(0, comma).trim();
      const right = s.slice(comma + 1).trim();
      const first = right.charAt(0).toUpperCase();
      s = right.replace(/^./, first) + " — " + left.toLowerCase();
    } else {
      const first = s.charAt(0);
      const rest = s.slice(1);
      s = (index % 2 === 0 ? "In practice, " : "More concretely, ") + first.toLowerCase() + rest;
    }
    changes++;
  }

  return [preserveTerminalPunctuation(sentence, s), changes];
}

function rewriteEverySentence(text: string, language: "fr" | "en"): {
  text: string;
  sentenceChanges: number;
  lexicalReplacements: number;
  structuralRewrites: number;
} {
  const source = splitSentences(text);
  let sentenceChanges = 0;
  let lexicalReplacements = 0;
  let structuralRewrites = 0;
  const output: string[] = [];

  source.forEach((sentence, index) => {
    const rewritten = language === "fr"
      ? rewriteFrenchSentence(sentence, index)
      : rewriteEnglishSentence(sentence, index);

    if (rewritten[0] !== sentence.trim()) sentenceChanges++;
    if (rewritten[1] > 0) {
      structuralRewrites += rewritten[1] > 1 ? 1 : 0;
      lexicalReplacements += Math.max(0, rewritten[1] - (rewritten[1] > 1 ? 1 : 0));
    }
    output.push(rewritten[0]);
  });

  return {
    text: normalize(output.join(" ")),
    sentenceChanges,
    lexicalReplacements,
    structuralRewrites
  };
}


function humanize(text: string, options: Options): HumanizeResult {
  const original = normalize(text);
  const language = languageOf(original, options.language);
  const requestedIntensity = Number(options.intensity);
  const intensity = Number.isFinite(requestedIntensity)
    ? Math.max(0.5, Math.min(1, requestedIntensity))
    : 0.78;

  const before = splitSentences(original);
  const rewritten = rewriteEverySentence(original, language);
  let result = rewritten.text;
  let structuralRewrites = rewritten.structuralRewrites;

  if (intensity >= 0.70) {
    const reordered = reorderAndSplit(splitSentences(result), intensity);
    result = normalize(reordered[0].join(" "));
    structuralRewrites += reordered[1];
  }

  // Garantie contractuelle : aucune phrase source ne peut sortir strictement
  // inchangée. Si une transformation linguistique n'a pas trouvé de règle,
  // une variation syntaxique minimale est appliquée à cette phrase.
  const current = splitSentences(result);
  const guaranteed = current.map((sentence, index) => {
    const source = before[index];
    if (!source || sentence !== source) return sentence;

    const first = sentence.charAt(0);
    const rest = sentence.slice(1);
    structuralRewrites++;
    if (language === "fr") {
      return (index % 2 === 0 ? "Dans les faits, " : "Concrètement, ") + first.toLowerCase() + rest;
    }
    return (index % 2 === 0 ? "In practice, " : "More concretely, ") + first.toLowerCase() + rest;
  });

  result = normalize(guaranteed.join(" "));

  const changedSentences = before.reduce(
    (count, sourceSentence, index) => count + (guaranteed[index] && guaranteed[index] !== sourceSentence ? 1 : 0),
    0
  );

  return {
    text: result,
    changes: rewritten.sentenceChanges + rewritten.lexicalReplacements + structuralRewrites,
    intensity,
    language,
    changed: result !== original,
    sentence_count_before: before.length,
    sentence_count_after: splitSentences(result).length,
    lexical_replacements: rewritten.lexicalReplacements,
    structural_rewrites: structuralRewrites + changedSentences
  };
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Oligens-Humanizer", "vercel-local-v7-rewrite");

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
      engine_version: "7.0.0",
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
        transformation: "sentence_by_sentence_rewrite",
        sentence_rewrite_required: true,
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
