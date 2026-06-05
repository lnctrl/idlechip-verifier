import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const KEY_PATH = join(homedir(), ".idlechip", "attestation-key.json");

export interface AttestationKeyMaterial {
  keyId: string;
  algorithm: "ed25519";
  /** Base64 raw 32-byte public key. */
  publicKey: string;
  privateKeyPem: string;
  createdAt: string;
}

export interface AttestationKeyEnrollment {
  attestationKeyId: string;
  attestationAlgorithm: "ed25519";
  attestationPublicKey: string;
}

function rawEd25519PublicKey(publicKeyPem: string): string {
  const key = createPublicKey(publicKeyPem);
  const jwk = key.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new Error("Failed to export Ed25519 public key");
  return Buffer.from(jwk.x, "base64url").toString("base64");
}

export function loadAttestationKey(): AttestationKeyMaterial | null {
  if (!existsSync(KEY_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(KEY_PATH, "utf-8")) as AttestationKeyMaterial;
    if (
      parsed.algorithm !== "ed25519" ||
      !parsed.keyId ||
      !parsed.publicKey ||
      !parsed.privateKeyPem
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function ensureAttestationKey(): AttestationKeyMaterial {
  const existing = loadAttestationKey();
  if (existing) return existing;

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const material: AttestationKeyMaterial = {
    keyId: randomUUID(),
    algorithm: "ed25519",
    publicKey: rawEd25519PublicKey(publicKeyPem),
    privateKeyPem,
    createdAt: new Date().toISOString(),
  };

  const dir = dirname(KEY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(KEY_PATH, JSON.stringify(material, null, 2));
  return material;
}

export function attestationEnrollmentFromKey(
  key: AttestationKeyMaterial,
): AttestationKeyEnrollment {
  return {
    attestationKeyId: key.keyId,
    attestationAlgorithm: key.algorithm,
    attestationPublicKey: key.publicKey,
  };
}

export function signCanonicalAttestation(canonicalJson: string, key: AttestationKeyMaterial): string {
  const privateKey = createPrivateKey(key.privateKeyPem);
  const signature = sign(null, Buffer.from(canonicalJson, "utf8"), privateKey);
  return signature.toString("base64");
}
