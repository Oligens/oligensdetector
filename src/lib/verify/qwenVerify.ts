// ============================================================
// Qwen (AgweStream) — vérification croisée sémantique
// Le contexte de référence (extraits web + base institutionnelle)
// est injecté dans le prompt ; réponse JSON stricte attendue.
// ============================================================
import { QWEN_CONFIG } from "../humanizer/qwenClient";

export const QWEN_VERIFY_TIMEOUT_MS = 8000;

export interface QwenVerifyPayload {
  segments: string[];
  referenceContext: string;
}

export interface QwenSegmentJudgment {
  index: number;
  paraphrase_probable: boolean;
  justification: string;
}

export interface QwenMethodJudgment {
  incoherent_mix: boolean;
  detail: string;
}

export interface QwenVerifyJudgment {
  segments: QwenSegmentJudgment[];
  methodology: QwenMethodJudgment;
}

const VERIFY_SYSTEM = `Tu es un expert en intégrité académique. Analyse les segments du document à la lumière du contexte de référence fourni.
Réponds EXCLUSIVEMENT avec un objet JSON valide, sans texte autour, au format exact :
{"segments":[{"index":0,"paraphrase_probable":false,"justification":"..."}],"methodology":{"incoherent_mix":false,"detail":"..."}}
- "paraphrase_probable" : true si le segment semble paraphraser ou recopier une source du contexte sans apport original.
- "methodology.incoherent_mix" : true si le document mélange des approches méthodologiques contradictoires (ex. positivisme quantitatif et phénoménologie qualitative) sans triangulation assumée.`;

function buildUserPrompt(payload: QwenVerifyPayload): string {
  const segments = payload.segments.map((s, i) => `[${i}] ${s.slice(0, 320)}`).join("\n");
  return `CONTEXTE DE RÉFÉRENCE (sources web et institutionnelles) :
${payload.referenceContext.slice(0, 3200)}

SEGMENTS DU DOCUMENT À VÉRIFIER :
${segments}`;
}

function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? raw;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(candidate.slice(first, last + 1));
  } catch {
    return null;
  }
}

function coerce(raw: unknown): QwenVerifyJudgment | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const segsRaw = Array.isArray(obj.segments) ? obj.segments : [];
  const segments: QwenSegmentJudgment[] = [];
  for (const s of segsRaw) {
    const rec = s as Record<string, unknown>;
    const index = typeof rec.index === "number" ? rec.index : NaN;
    if (Number.isNaN(index)) continue;
    segments.push({
      index,
      paraphrase_probable: Boolean(rec.paraphrase_probable),
      justification: typeof rec.justification === "string" ? rec.justification : "",
    });
  }
  const meth = obj.methodology as Record<string, unknown> | undefined;
  return {
    segments,
    methodology: {
      incoherent_mix: Boolean(meth?.incoherent_mix),
      detail: typeof meth?.detail === "string" ? meth.detail : "",
    },
  };
}

/** Vérification croisée sémantique via AgweStream (non-streamée). */
export async function verifyViaQwenVerify(
  payload: QwenVerifyPayload,
  timeoutMs = QWEN_VERIFY_TIMEOUT_MS
): Promise<QwenVerifyJudgment | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${QWEN_CONFIG.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${QWEN_CONFIG.apiKey}` },
      body: JSON.stringify({
        model: QWEN_CONFIG.model,
        stream: false,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: VERIFY_SYSTEM },
          { role: "user", content: buildUserPrompt(payload) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    return coerce(extractJsonObject(content));
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
