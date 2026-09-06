// Compatibility entry point: the active humanizer is the calibrated V2 implementation.
// Keeping this filename preserves all existing imports and avoids a migration gap.
export { enhancedHumanizerV2 as enhancedHumanizer } from "./humanizerEnhancedV2";
