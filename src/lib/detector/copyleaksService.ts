const COPYLEAKS_EMAIL = () => process.env.COPYLEAKS_EMAIL?.trim();
const ACCESS_TOKEN_URL = "https://id.copyleaks.com/v3/account/login/api";
const WRITER_DETECTOR_URL = "https://api.copyleaks.com/v2/writer-detector";

export interface CopyleaksDetectionResult {
  provider: "copyleaks";
  scanId: string;
  modelVersion?: string;
  aiProbability: number;
  humanProbability: number;
  summary: { ai: number; human: number };
  raw: unknown;
  environment: "production" | "preview" | "development";
  sandbox: boolean;
}

type CopyleaksTokenResponse = { access_token?: string; ".expires"?: string; expires?: string };
let cachedToken: { token: string; expiresAt: number } | null = null;

function environment(): "production" | "preview" | "development" {
  const vercel = process.env.VERCEL_ENV;
  if (vercel === "production") return "production";
  if (vercel === "preview") return "preview";
  return "development";
}

function getApiKey() {
  const env = environment();
  if (env === "production") return process.env.COPYLEAKS_API_KEY?.trim();
  return process.env.COPYLEAKS_API_KEY_DEV?.trim() || process.env.COPYLEAKS_API_KEY?.trim();
}

function isSandbox() {
  return environment() !== "production";
}

export function copyleaksConfiguration() {
  const env = environment();
  return {
    configured: Boolean(COPYLEAKS_EMAIL() && getApiKey()),
    environment: env,
    keySource: env === "production" ? "COPYLEAKS_API_KEY" : process.env.COPYLEAKS_API_KEY_DEV?.trim() ? "COPYLEAKS_API_KEY_DEV" : "COPYLEAKS_API_KEY",
    sandbox: isSandbox(),
  } as const;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { return { raw: text }; }
}

export async function getCopyleaksAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 5 * 60_000) return cachedToken.token;

  const email = COPYLEAKS_EMAIL();
  const key = getApiKey();
  if (!email || !key) throw new Error("Identifiants Copyleaks non configurés. Définissez COPYLEAKS_EMAIL et la clé correspondant à l'environnement.");

  const response = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, key }),
  });
  const data = await readJson(response) as CopyleaksTokenResponse;
  if (!response.ok || !data.access_token) {
    console.error("[copyleaks] authentication failed", { status: response.status, data });
    throw new Error(`Authentification Copyleaks impossible (${response.status}).`);
  }

  const expiresAt = data[".expires"] || data.expires;
  const parsed = expiresAt ? Date.parse(expiresAt) : NaN;
  cachedToken = { token: data.access_token, expiresAt: Number.isFinite(parsed) ? parsed : now + 47 * 60 * 60_000 };
  return data.access_token;
}

function normalizeScanId(scanId: string) {
  const cleaned = scanId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 36);
  return cleaned.length >= 3 ? cleaned : `oligens-${Date.now()}`;
}

export async function scanTextWithCopyleaks(text: string, scanId: string, options: { language?: string; explain?: boolean; sensitivity?: 1 | 2 | 3 } = {}): Promise<CopyleaksDetectionResult> {
  const clean = text.trim();
  if (clean.length < 255) throw new Error("Copyleaks exige au moins 255 caractères pour la détection IA.");
  if (clean.length > 100_000) throw new Error("Copyleaks accepte au maximum 100 000 caractères pour cette analyse.");

  const accessToken = await getCopyleaksAccessToken();
  const safeScanId = normalizeScanId(scanId);
  const response = await fetch(`${WRITER_DETECTOR_URL}/${encodeURIComponent(safeScanId)}/check`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      text: clean,
      sandbox: isSandbox(),
      ...(options.language ? { language: options.language } : {}),
      explain: options.explain ?? true,
      sensitivity: options.sensitivity ?? 2,
    }),
  });
  const raw = await readJson(response);
  if (!response.ok) {
    console.error("[copyleaks] detection failed", { status: response.status, scanId: safeScanId, raw });
    throw new Error(`Analyse Copyleaks impossible (${response.status}).`);
  }

  const summary = (raw.summary ?? {}) as { ai?: unknown; human?: unknown };
  const ai = Number(summary.ai ?? 0);
  const human = Number(summary.human ?? 0);
  const total = ai + human;
  return {
    provider: "copyleaks",
    scanId: safeScanId,
    modelVersion: typeof raw.modelVersion === "string" ? raw.modelVersion : undefined,
    aiProbability: total > 0 ? ai / total : 0,
    humanProbability: total > 0 ? human / total : 0,
    summary: { ai: Number.isFinite(ai) ? ai : 0, human: Number.isFinite(human) ? human : 0 },
    raw,
    environment: environment(),
    sandbox: isSandbox(),
  };
}
