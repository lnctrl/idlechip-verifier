import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface AgentCredentials {
  token: string;
  ownerName: string;
  apiUrl: string;
  pairedAt: string;
}

function credentialsPath(): string {
  const override = process.env.IDLECHIP_CREDENTIALS_PATH?.trim();
  if (override) return override;
  return join(homedir(), ".idlechip", "agent-credentials.json");
}

export function loadCredentials(): AgentCredentials | null {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as AgentCredentials;
    if (!parsed?.token || !parsed?.ownerName || !parsed?.apiUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: AgentCredentials) {
  const path = credentialsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(creds, null, 2));
}

export function clearCredentials() {
  const path = credentialsPath();
  if (existsSync(path)) writeFileSync(path, "{}");
}

export function authHeaders(creds: AgentCredentials): Record<string, string> {
  return {
    Authorization: `Bearer ${creds.token}`,
    "Content-Type": "application/json",
  };
}

export function requireCredentials(): AgentCredentials {
  const creds = loadCredentials();
  if (!creds) {
    throw new Error(
      "Not paired yet. Sign in at https://idlechip.com, open My GPUs, generate a code, then run:\n" +
        "  npx idlechip-agent pair --url https://idlechip.com --code XXXX-YYYY"
    );
  }
  return creds;
}
