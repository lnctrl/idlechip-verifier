import { randomUUID } from "node:crypto";
import {
  ATTESTATION_CRYPTO_VERSION,
  canonicalAttestationPayload,
  type SessionAttestationPayload,
  type SignedSessionAttestation,
} from "./attestation-crypto.js";
import {
  attestationEnrollmentFromKey,
  ensureAttestationKey,
  loadAttestationKey,
  signCanonicalAttestation,
  type AttestationKeyMaterial,
} from "./attestation-keys.js";

export { attestationEnrollmentFromKey, ensureAttestationKey, loadAttestationKey };

export function buildSessionAttestationPayload(input: {
  sessionId: string;
  gpuId: string;
  utilizationPct: number | null;
  at?: string;
  nonce?: string;
}): SessionAttestationPayload {
  return {
    v: ATTESTATION_CRYPTO_VERSION,
    sessionId: input.sessionId,
    gpuId: input.gpuId,
    at: input.at ?? new Date().toISOString(),
    utilizationPct: input.utilizationPct,
    nonce: input.nonce ?? randomUUID(),
  };
}

export function signAttestationPayload(
  payload: SessionAttestationPayload,
  key: AttestationKeyMaterial = ensureAttestationKey(),
): SignedSessionAttestation {
  const canonical = canonicalAttestationPayload(payload);
  const signature = signCanonicalAttestation(canonical, key);
  return {
    payload,
    algorithm: "ed25519",
    keyId: key.keyId,
    signature,
  };
}

/** Signed attestations for production sessions; key is created at pair time if missing. */
export function signAttestationForSubmit(
  payload: SessionAttestationPayload,
): SignedSessionAttestation {
  return signAttestationPayload(payload, ensureAttestationKey());
}
