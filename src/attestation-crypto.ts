/** Minimal attestation types — kept in sync with idlechip marketplace API. */

export const ATTESTATION_CRYPTO_VERSION = 1 as const;

export type AttestationSignatureAlgorithm =
  | "none"
  | "ed25519"
  | "ml-dsa-65"
  | "ml-dsa-87"
  | "slh-dsa-shake-128f"
  | "hybrid-secp256k1-ml-dsa-65";

export interface SessionAttestationPayload {
  v: typeof ATTESTATION_CRYPTO_VERSION;
  sessionId: string;
  gpuId: string;
  at: string;
  utilizationPct: number | null;
  nonce: string;
}

export interface SignedSessionAttestation {
  payload: SessionAttestationPayload;
  algorithm: AttestationSignatureAlgorithm;
  keyId: string;
  signature: string;
}

export function canonicalAttestationPayload(payload: SessionAttestationPayload): string {
  const ordered: SessionAttestationPayload = {
    v: payload.v,
    sessionId: payload.sessionId,
    gpuId: payload.gpuId,
    at: payload.at,
    utilizationPct: payload.utilizationPct,
    nonce: payload.nonce,
  };
  return JSON.stringify(ordered);
}
