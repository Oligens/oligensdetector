// Compatibility shim for older imports. The former provider implementation was removed.
export { deepSeekConfiguration as providerConfiguration, humanizeWithDeepSeek as humanizeWithProvider } from "./deepseekService";
export type { DeepSeekHumanizeResult as ProviderHumanizeResult } from "./deepseekService";
