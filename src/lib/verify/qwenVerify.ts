// ============================================================
// Vérification croisée sémantique — compatibilité historique Qwen
// ============================================================
// Qwen/DashScope n'est plus exposé côté navigateur. L'Humaniseur utilise
// désormais Gemini côté serveur, tandis que le moteur Oligens reste local.
// Cette fonction est conservée pour ne pas casser les anciens imports.

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

/**
 * Ancienne API Qwen désactivée côté client.
 * Retourne null afin que les moteurs locaux Oligens poursuivent l'analyse
 * sans exposer de clé secrète ni dépendre d'un fournisseur externe.
 */
export async function verifyViaQwenVerify(
  _payload: QwenVerifyPayload,
  _timeoutMs = QWEN_VERIFY_TIMEOUT_MS,
): Promise<QwenVerifyJudgment | null> {
  return null;
}
