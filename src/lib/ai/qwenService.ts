const QWEN_MODEL = process.env.QWEN_MODEL?.trim() || "qwen-plus";
const QWEN_URL = process.env.QWEN_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const TIMEOUT_MS = 30_000;

export interface QwenHumanizeResult { provider: "qwen"; model: string; text: string; usage?: unknown; }

export function qwenConfiguration() {
  return { configured: Boolean((process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY)?.trim()), model: QWEN_MODEL, baseUrl: QWEN_URL } as const;
}

export async function humanizeWithQwen(text: string, options: { language?: string; mode?: "standard" | "ultra" } = {}): Promise<QwenHumanizeResult> {
  const apiKey = (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY)?.trim();
  if (!apiKey) throw new Error("QWEN_API_KEY/DASHSCOPE_API_KEY n'est pas configurée.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const intensity = options.mode === "ultra" ? "forte" : "modérée";
    const response = await fetch(`${QWEN_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: QWEN_MODEL,
        temperature: options.mode === "ultra" ? 0.85 : 0.7,
        top_p: 0.9,
        messages: [
          { role: "system", content: `Tu es un rédacteur francophone. Réécris le texte avec une transformation stylistique ${intensity} pour améliorer sa fluidité et sa variété. Conserve exactement le sens, les faits, les chiffres, les noms propres, les références, les citations et les URL. Modifie réellement la syntaxe, la longueur des phrases et l'organisation des paragraphes quand cela reste naturel. Ne retourne jamais une simple permutation de mots et ne renvoie jamais le texte source inchangé. Réponds uniquement avec le texte réécrit. Langue cible : ${options.language === "en" ? "anglais" : options.language === "ht" ? "créole haïtien" : "français"}.` },
          { role: "user", content: text },
        ],
      }),
    });
    const raw = await response.text();
    let data: Record<string, unknown> = {};
    try { data = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { throw new Error("Réponse Qwen invalide."); }
    if (!response.ok) {
      const error = data.error as { message?: string } | undefined;
      throw new Error(`Qwen (${response.status}) : ${error?.message || "requête refusée"}`);
    }
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const first = choices[0] as { message?: { content?: unknown } } | undefined;
    const output = typeof first?.message?.content === "string" ? first.message.content.trim() : "";
    if (!output) throw new Error("Qwen n'a renvoyé aucun texte exploitable.");
    if (output === text.trim()) throw new Error("Qwen n'a produit aucune transformation.");
    return { provider: "qwen", model: QWEN_MODEL, text: output, usage: data.usage };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(`Qwen n'a pas répondu dans le délai imparti (${TIMEOUT_MS / 1000}s).`);
    throw error;
  } finally { clearTimeout(timer); }
}
