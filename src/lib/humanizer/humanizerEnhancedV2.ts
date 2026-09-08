import { naturalHumanizer } from "./humanizerNaturalEngine";
import type { HumanizeOutcome, HumanizerConfig, HumanizerProgress } from "./humanizerUltimate";

/**
 * Active V2 entry point.
 * The implementation lives in the specialist natural humanizer so all
 * existing imports and the Web Worker contract remain stable.
 */
export const enhancedHumanizerV2 = naturalHumanizer;

export type { HumanizeOutcome, HumanizerConfig, HumanizerProgress };
