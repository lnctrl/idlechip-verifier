/** Hosts the public agent may call (must match web `DEFAULT_AGENT_API_HOSTS`). */
export const ALLOWED_API_HOSTS = [
  "idlechip.com",
  "www.idlechip.com",
  "idlechip.vercel.app",
  "localhost",
  "127.0.0.1",
] as const;

export function normalizeApiUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function assertAllowedApiUrl(raw: string): string {
  const url = new URL(normalizeApiUrl(raw));
  const host = url.hostname.toLowerCase();
  const allowed: readonly string[] = ALLOWED_API_HOSTS;
  if (!allowed.includes(host)) {
    throw new Error(
      `This agent only works with IdleChip (${ALLOWED_API_HOSTS.join(", ")}). Got: ${host}. Use https://idlechip.com`,
    );
  }
  return url.origin;
}

export const DEFAULT_API_URL = "https://idlechip.com";
