const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_TIMEOUT_MS = 20_000;

export interface GeminiHumanizeResult {
  provider: "google-gemini";
  model: string;
  text: string;
  usage?: unknown;
}

export function geminiConfiguration() {
  return {
    configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    model: GEMINI_MODEL,
  } as const;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = GEMINI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Gemini n'a pas répondu dans le délai imparti (${timeoutMs / 1000}s).`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { return { raw: text }; }
}

function languageLabel(language?: string) {
  if (language === "en") return "anglais";
  if (language === "ht") return "créole haïtien";
  return "français";
}

function buildPrompt(text: string, language?: string, mode: "standard" | "ultra" = "standard") {
  const intensity = mode === "ultra" ? "plus marquée" : "modérée";
  return `Tu es un rédacteur professionnel francophone spécialisé dans la réécriture naturelle. Réécris le brouillon fourni pour améliorer sa fluidité, sa variété syntaxique et sa lisibilité, avec une transformation ${intensity}.

Règles impératives :
- conserve exactement le sens, les faits, les chiffres, les dates, les noms propres, les références, les citations entre guillemets, les URL et les éléments techniques ;
- ne fabrique aucune information et n'ajoute aucune source ;
- varie naturellement la longueur des phrases et les transitions sans ajouter artificiellement des tics de langage ;
- évite les formulations répétitives, mécaniques ou génériques ;
- conserve les paragraphes et la structure logique lorsque cela améliore la lisibilité ;
- réponds uniquement avec le texte réécrit, sans commentaire, titre ou explication ;
- langue cible : ${languageLabel(language)}.

Brouillon à réécrire :
${text}`;
}

export async function humanizeWithGemini(text: string, options: { language?: string; mode?: "standard" | "ultra" } = {}): Promise<GeminiHumanizeResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY n'est pas configurée.");

  const model = GEMINI_MODEL;
  const response = await fetchWithTimeout(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(text, options.language, options.mode) }] }],
      generationConfig: {
        temperature: options.mode === "ultra" ? 0.85 : 0.7,
        topP: 0.92,
        maxOutputTokens: 16_384,
      },
    }),
  });

  const data = await readJson(response);
  if (!response.ok) {
    const error = data.error as { message?: string } | undefined;
    throw new Error(`Gemini (${response.status}) : ${error?.message || "requête refusée"}`);
  }

  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const first = candidates[0] as { content?: { parts?: Array<{ text?: unknown }> }; finishReason?: string } | undefined;
  const parts = first?.content?.parts ?? [];
  const output = parts.map((part) => typeof part.text === "string" ? part.text : "").join("").trim();
  if (!output) throw new Error("Gemini n'a renvoyé aucun texte exploitable.");

  return {
    provider: "google-gemini",
    model,
    text: output,
    usage: data.usageMetadata,
  };
}
