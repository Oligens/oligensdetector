const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
const DEEPSEEK_URL = (process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com/v1").replace(/\/$/, "");
const TIMEOUT_MS = 30_000;

export interface DeepSeekDetectionResult {
  provider: "deepseek";
  model: string;
  aiProbability: number;
  confidence: number;
  originalityScore: number;
  vocabularyDiversity: number;
  syntheticPatternScore: number;
  hallucinationRisk: number;
  explanation: string;
}

export interface DeepSeekHumanizeResult {
  provider: "deepseek";
  model: string;
  text: string;
  usage?: unknown;
}

export function deepSeekConfiguration() {
  return { configured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()), model: DEEPSEEK_MODEL, baseUrl: DEEPSEEK_URL } as const;
}

async function request(messages: Array<{ role: "system" | "user"; content: string }>, temperature = 0) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new Error("DEEPSEEK_API_KEY n'est pas configurée.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${DEEPSEEK_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model: DEEPSEEK_MODEL, temperature, messages, response_format: { type: "json_object" } }),
    });
    const raw = await response.text();
    let data: Record<string, unknown> = {};
    try { data = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { throw new Error("Réponse DeepSeek invalide."); }
    if (!response.ok) {
      const error = data.error as { message?: string } | undefined;
      throw new Error(`DeepSeek (${response.status}) : ${error?.message || "requête refusée"}`);
    }
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const first = choices[0] as { message?: { content?: unknown } } | undefined;
    const content = typeof first?.message?.content === "string" ? first.message.content.trim() : "";
    if (!content) throw new Error("DeepSeek n'a renvoyé aucun contenu exploitable.");
    return { content, usage: data.usage };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(`DeepSeek n'a pas répondu dans le délai imparti (${TIMEOUT_MS / 1000}s).`);
    throw error;
  } finally { clearTimeout(timer); }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export async function detectWithDeepSeek(text: string): Promise<DeepSeekDetectionResult> {
  const result = await request([
    { role: "system", content: "Tu es un moteur d'analyse stylométrique. Analyse uniquement les propriétés observables du texte. Ne déduis jamais qu'un texte est IA à partir du sujet, de la qualité ou d'une opinion. Retourne exclusivement un JSON valide." },
    { role: "user", content: `Évalue ce texte et retourne exactement les champs suivants : aiProbability (0..1), confidence (0..1), originalityScore (-1..1), vocabularyDiversity (-1..1), syntheticPatternScore (0..1), hallucinationRisk (0..1), explanation (string). Évalue la régularité syntaxique, la prédictibilité, les motifs synthétiques, la diversité lexicale et les incohérences factuelles potentielles. Ne considère pas les références, notes, bibliographie ou citations formelles comme des indices IA.\n\nTEXTE:\n${text}` },
  ]);
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(result.content) as Record<string, unknown>; } catch { throw new Error("DeepSeek a renvoyé un JSON illisible."); }
  const number = (key: string, fallback: number) => { const value = Number(parsed[key]); return Number.isFinite(value) ? value : fallback; };
  return {
    provider: "deepseek", model: DEEPSEEK_MODEL,
    aiProbability: clamp(number("aiProbability", 0), 0, 1),
    confidence: clamp(number("confidence", 0.5), 0, 1),
    originalityScore: clamp(number("originalityScore", 0), -1, 1),
    vocabularyDiversity: clamp(number("vocabularyDiversity", 0), -1, 1),
    syntheticPatternScore: clamp(number("syntheticPatternScore", 0), 0, 1),
    hallucinationRisk: clamp(number("hallucinationRisk", 0), 0, 1),
    explanation: typeof parsed.explanation === "string" ? parsed.explanation : "Signal stylométrique DeepSeek.",
  };
}

export async function humanizeWithDeepSeek(text: string, options: { language?: string; mode?: "standard" | "ultra" } = {}): Promise<DeepSeekHumanizeResult> {
  const language = options.language === "en" ? "anglais" : options.language === "ht" ? "créole haïtien" : "français";
  const intensity = options.mode === "ultra" ? "forte" : "modérée";
  const result = await request([
    { role: "system", content: `Tu es un rédacteur professionnel. Réécris naturellement le texte avec une transformation stylistique ${intensity}. Conserve exactement les faits, chiffres, dates, noms propres, citations, références et URL. N'invente aucune information et n'ajoute aucune source. Varie réellement syntaxe, rythme, transitions et structure lorsque cela reste fidèle. Ne cherche pas à contourner un détecteur : améliore uniquement la qualité rédactionnelle. Réponds en ${language}, uniquement avec le texte réécrit.` },
    { role: "user", content: text },
  ], options.mode === "ultra" ? 0.85 : 0.7);
  if (result.content === text.trim()) throw new Error("DeepSeek n'a produit aucune transformation.");
  return { provider: "deepseek", model: DEEPSEEK_MODEL, text: result.content, usage: result.usage };
}
