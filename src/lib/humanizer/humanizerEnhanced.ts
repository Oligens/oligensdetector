import { enhancedHumanizerV2 } from "./humanizerEnhancedV2";
import { buildHumanizerAgentPlan, safeNaturalFallback } from "../ai/agenticEngines";
import type { HumanizeOutcome, HumanizerConfig, HumanizerProgress } from "./humanizerUltimate";

/**
 * Active compatibility entry point.
 * The specialist HUMANIZER agents plan the rewrite while V2 performs the
 * actual controlled transformation. This keeps every existing import stable.
 */
export const enhancedHumanizer = {
  async humanize(
    text: string,
    config: Partial<HumanizerConfig> = {},
    onProgress?: (p: HumanizerProgress) => void,
  ): Promise<HumanizeOutcome> {
    const plan = buildHumanizerAgentPlan(text, config);
    const effectiveConfig: Partial<HumanizerConfig> = {
      ...config,
      intensite: Math.max(config.intensite ?? 0, plan.intensity),
      iterationsMax: Math.max(config.iterationsMax ?? 0, plan.iterations),
      modeAggressif: Boolean(config.modeAggressif || plan.modeAggressif),
    };

    onProgress?.({
      iteration: 0,
      total: effectiveConfig.iterationsMax ?? plan.iterations,
      proba: 0,
      phase: "Agents HUMANISEUR — préparation du style",
      anomalies: [],
    });

    const result = await enhancedHumanizerV2.humanize(text, effectiveConfig, onProgress);
    let finalText = result.texteFinal;

    // Important product behaviour: pressing Humaniser must not silently return
    // an identical copy merely because the detector already reports a low
    // probability. If V2 found no safe mutation, apply a minimal natural
    // rewrite and keep the original factual anchors untouched.
    if (finalText.trim() === text.trim() && text.trim().length > 0) {
      const fallback = safeNaturalFallback(text);
      if (fallback.trim() !== text.trim()) {
        finalText = fallback;
        result.rapport = {
          ...result.rapport,
          decision: "Réécriture terminée : les agents ont appliqué une modification stylistique minimale et sûre.",
          warning: "La transformation privilégie la conservation du sens et des données du texte source.",
        };
      } else {
        result.rapport = {
          ...result.rapport,
          decision: "Le texte est déjà naturel ; aucune transformation sûre supplémentaire n'a été trouvée.",
        };
      }
    }

    return { ...result, texteFinal: finalText };
  },
};

export type { HumanizeOutcome, HumanizerConfig, HumanizerProgress };
