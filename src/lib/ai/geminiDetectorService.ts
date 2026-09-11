const GEMINI_MODEL = process.env.GEMINI_DETECTOR_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 15_000;

export interface GeminiDetectionResult {
  provider: "gemini";
  model: string;
  aiProbability: number;
  confidence: number;
  originalityScore: number;
  vocabularyDiversity: number;
  ngramPredictability: number;
  sentenceRegularity: number;
  syntheticCueFrequency: number;
  explanation: string;
}

export function geminiDetectorConfiguration() {
  return { configured: Boolean(process.env.GEMINI_API_KEY?.trim()), model: GEMINI_MODEL } as const;
}

async function request(text: string) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY n'est pas configurée.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${GEMINI_URL}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Tu es un évaluateur de stylométrie. Tu ne dois pas décider à partir du sujet, de la qualité, des opinions ou des faits. Évalue uniquement les propriétés statistiques et stylistiques observables. Retourne exclusivement le JSON demandé." }] },
        contents: [{ role: "user", parts: [{ text: `Analyse ce texte et estime la probabilité qu'il soit généré par un modèle de langage. Évalue séparément : prédictibilité des n-grammes, régularité de la longueur des phrases et fréquence des termes/formules d'accroche synthétiques. Donne aussi un signal d'originalité et de diversité lexicale, chacun dans [-1,1], où une valeur négative indique une convergence vers un profil synthétique.\n\nTexte :\n${text}` }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              aiProbability: { type: "number", minimum: 0, maximum: 1 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              originalityScore: { type: "number", minimum: -1, maximum: 1 },
              vocabularyDiversity: { type: "number", minimum: -1, maximum: 1 },
              ngramPredictability: { type: "number", minimum: 0, maximum: 1 },
              sentenceRegularity: { type: "number", minimum: 0, maximum: 1 },
              syntheticCueFrequency: { type: "number", minimum: 0, maximum: 1 },
              explanation: { type: "string" },
            },
            required: ["aiProbability", "confidence", "originalityScore", "vocabularyDiversity", "ngramPredictability", "sentenceRegularity", "syntheticCueFrequency", "explanation"],
          },
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Gemini stylometry timeout.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function detectWithGemini(text: string): Promise<GeminiDetectionResult> {
  const response = await request(text);
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try { data = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { throw new Error("Réponse Gemini invalide."); }
  if (!response.ok) {
    const error = data.error as { message?: string } | undefined;
    throw new Error(`Gemini (${response.status}) : ${error?.message || "requête refusée"}`);
  }
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const first = candidates[0] as { content?: { parts?: Array<{ text?: unknown }> } } | undefined;
  const jsonText = (first?.content?.parts ?? []).map(part => typeof part.text === "string" ? part.text : "").join("").trim();
  if (!jsonText) throw new Error("Gemini n'a renvoyé aucun signal de détection.");
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(jsonText) as Record<string, unknown>; } catch { throw new Error("Gemini a renvoyé un signal JSON illisible."); }
  const number = (key: string, fallback: number) => { const value = Number(parsed[key]); return Number.isFinite(value) ? value : fallback; };
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  return {
    provider: "gemini",
    model: GEMINI_MODEL,
    aiProbability: clamp(number("aiProbability", 0), 0, 1),
    confidence: clamp(number("confidence", 0.5), 0, 1),
    originalityScore: clamp(number("originalityScore", 0), -1, 1),
    vocabularyDiversity: clamp(number("vocabularyDiversity", 0), -1, 1),
    ngramPredictability: clamp(number("ngramPredictability", 0), 0, 1),
    sentenceRegularity: clamp(number("sentenceRegularity", 0), 0, 1),
    syntheticCueFrequency: clamp(number("syntheticCueFrequency", 0), 0, 1),
    explanation: typeof parsed.explanation === "string" ? parsed.explanation : "Signal stylométrique Gemini.",
  };
}
