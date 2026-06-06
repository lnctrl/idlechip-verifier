import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { BRAND_CREDENTIAL_FILE, BRAND_PACKAGE_NAME } from "./brand.js";

export interface ScannerCredentials {
  token: string;
  ownerName: string;
  apiUrl: string;
  pairedAt: string;
}

function credentialsPath(): string {
  const override = process.env.IDLECHIP_CREDENTIALS_PATH?.trim();
  if (override) return override;
  return join(homedir(), ".idlechip", BRAND_CREDENTIAL_FILE);
}

export function loadCredentials(): ScannerCredentials | null {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as ScannerCredentials;
    if (!parsed?.token || !parsed?.ownerName || !parsed?.apiUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: ScannerCredentials) {
  const path = credentialsPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(creds, null, 2));
}

/** CLI --url beats stale localhost saved from an earlier dev pairing. */
export function applyApiUrlOverride(
  creds: ScannerCredentials,
  apiUrlOverride?: string,
): ScannerCredentials {
  const override = apiUrlOverride?.trim() || process.env.IDLECHIP_API_URL?.trim();
  if (!override) return creds;
  const apiUrl = override.replace(/\/$/, "");
  if (creds.apiUrl === apiUrl) return creds;
  const next = { ...creds, apiUrl };
  saveCredentials(next);
  return next;
}

export function clearCredentials() {
  const path = credentialsPath();
  if (existsSync(path)) writeFileSync(path, "{}");
}

export function authHeaders(creds: ScannerCredentials): Record<string, string> {
  return {
    Authorization: `Bearer ${creds.token}`,
    "Content-Type": "application/json",
  };
}

export function requireCredentials(): ScannerCredentials {
  const creds = loadCredentials();
  if (!creds) {
    throw new Error(
      "Not paired yet. Sign in at https://idlechip.com, open My GPUs, generate a code, then run:\n" +
        `  npx ${BRAND_PACKAGE_NAME} pair --url https://idlechip.com --code XXXX-YYYY`
    );
  }
  return creds;
}
