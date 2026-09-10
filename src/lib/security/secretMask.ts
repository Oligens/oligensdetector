/** Never expose server-side secrets to client responses/logs. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

export function isSecretLike(value: string): boolean {
  const v = value.trim();
  return v.length >= 16 && (/^(sk_|pk_|zk_|ghp_|github_pat_|xoxb-|Bearer\s+)/i.test(v) || /token|secret|api[_-]?key/i.test(v));
}
