import { attestationEnrollmentFromKey, ensureAttestationKey } from "./attestation-sign.js";
import { loadLocalGpuConfig } from "./local-config.js";
import { saveCredentials, type ScannerCredentials } from "./credentials.js";
import { assertAllowedApiUrl } from "./site-allowlist.js";

export async function pairWithCode(apiUrlRaw: string, code: string): Promise<ScannerCredentials> {
  const apiUrl = assertAllowedApiUrl(apiUrlRaw);
  const config = loadLocalGpuConfig();
  const enrollment = attestationEnrollmentFromKey(ensureAttestationKey());
  const res = await fetch(`${apiUrl}/api/my-gpus/pair/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      apiUrl,
      hostId: config.hostId,
      ...enrollment,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Pairing failed (${res.status})`);
  }
  const creds: ScannerCredentials = {
    token: data.token,
    ownerName: data.ownerName,
    apiUrl: data.apiUrl ?? apiUrl,
    pairedAt: new Date().toISOString(),
  };
  saveCredentials(creds);
  return creds;
}

export async function syncHostConfigToApi(
  creds: ScannerCredentials,
  options?: { sessionId?: string },
) {
  const { loadLocalGpuConfig } = await import("./local-config.js");
  const config = loadLocalGpuConfig();
  config.ownerName = creds.ownerName;
  const url = `${creds.apiUrl.replace(/\/$/, "")}/api/my-gpus/sync`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...config,
      ...(options?.sessionId ? { sessionId: options.sessionId } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sync failed (${res.status}) against ${url}: ${text}`);
  }
}
