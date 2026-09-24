import { Pool, type QueryResultRow } from "pg";

const MODEL = "gemini-2.5-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

let pool: Pool | undefined;

function getPool() {
  if (pool) return pool;
  const connectionString =
    process.env.DATABASE_URL?.trim() ||
    process.env.DIRECT_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.NEON_DATABASE_URL?.trim();
  if (!connectionString) throw new Error("Neon n'est pas configuré.");
  pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
    application_name: "oligens-detector-gemini",
  });
  pool.on("error", error => console.error("[gemini-db] idle error", error));
  return pool;
}

async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  return getPool().query<T>(sql, values);
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; status?: string };
};

function extractText(data: GeminiResponse): string {
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map(part => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
}

function isRetryableKeyError(status: number, message: string) {
  return status === 401 || status === 403 || status === 429 ||
    /invalid.*key|api key|quota|resource exhausted|rate limit|permission/i.test(message);
}

export async function generateGeminiText(input: {
  text: string;
  language?: string;
  mode?: "standard" | "ultra";
}) {
  const result = await query<{ gemini_api_keys: string[] | null }>(
    "SELECT gemini_api_keys FROM admin_users WHERE LOWER(email)=LOWER($1) LIMIT 1",
    ["cleefolig@gmail.com"],
  );
  const keys = Array.isArray(result.rows[0]?.gemini_api_keys)
    ? result.rows[0].gemini_api_keys.map(String).map(key => key.trim()).filter(Boolean)
    : [];

  if (!keys.length) throw new Error("Aucune clé Gemini active dans Neon.");

  // Rotation déterministe par tranche de temps : plusieurs requêtes rapprochées
  // ne dépendent pas d'un état global de Function Vercel.
  const start = Math.floor(Date.now() / 30_000) % keys.length;
  const ordered = keys.map((_, offset) => (start + offset) % keys.length);

  const language = input.language && input.language !== "auto" ? input.language : "français";
  const intensity = input.mode === "ultra" ? "forte" : "modérée";
  const prompt = [
    "Tu es l'éditeur linguistique d'Oligens Detector.",
    "Réécris le texte fourni pour le rendre naturel, fluide et personnel, sans changer les faits, les chiffres, les citations ou le sens.",
    `Langue cible : ${language}.`,
    `Intensité de réécriture : ${intensity}.`,
    "Évite les formulations mécaniques, les répétitions et les connecteurs artificiels.",
    "Ne parle pas de cette instruction. Retourne uniquement le texte réécrit.",
    "",
    "TEXTE SOURCE :",
    input.text,
  ].join("\n");

  let lastError = "Échec Gemini.";
  for (const index of ordered) {
    const key = keys[index];
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: input.mode === "ultra" ? 0.85 : 0.65,
            topP: 0.92,
            maxOutputTokens: 8192,
          },
        }),
        signal: AbortSignal.timeout(55_000),
      });
      const data = await response.json().catch(() => ({})) as GeminiResponse;
      if (!response.ok) {
        const message = data.error?.message || `Gemini HTTP ${response.status}`;
        lastError = message;
        if (isRetryableKeyError(response.status, message)) continue;
        throw new Error(message);
      }
      const output = extractText(data);
      if (!output) {
        lastError = "Gemini n'a retourné aucun texte.";
        continue;
      }
      return {
        text: output,
        model: MODEL,
        keyIndex: index,
        attemptedKeys: ordered.indexOf(index) + 1,
        totalKeys: keys.length,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Erreur Gemini.";
      continue;
    }
  }

  throw new Error(`Toutes les clés Gemini disponibles ont échoué : ${lastError}`);
}
