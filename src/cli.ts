#!/usr/bin/env node

import { scanGpus, formatGpuSummary, formatVram } from "./scanner/index.js";
import { BRAND_DISPLAY_NAME, BRAND_PACKAGE_NAME } from "./brand.js";
import { gpuHistoryKey } from "./types.js";
import { authHeaders, loadCredentials, requireCredentials } from "./credentials.js";
import { pairWithCode, syncHostConfigToApi } from "./sync-api.js";
import { assertAllowedApiUrl, DEFAULT_API_URL } from "./site-allowlist.js";
import {
  buildSessionAttestationPayload,
  signAttestationForSubmit,
} from "./attestation-sign.js";
import {
  applyStableHostId,
  filterGpusByKey,
  loadLocalGpuConfig,
  resolveGpuKey,
  updateLocalRegistration,
  updateLocalScan,
} from "./local-config.js";

const [, , command, ...args] = process.argv;
const SCAN_SYNC_INTERVAL_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 60_000;

function usage() {
  console.log(`
${BRAND_DISPLAY_NAME} - scan GPUs and sync with idlechip.com

Usage (npm - use npx on your PC):
  npx ${BRAND_PACKAGE_NAME} pair --url URL --code XXXX-YYYY
  npx ${BRAND_PACKAGE_NAME} scan
  npx ${BRAND_PACKAGE_NAME} register [--gpu KEY]
  npx ${BRAND_PACKAGE_NAME} watch [--session ID]

Pair first (sign in on the site -> My GPUs -> Generate pairing code):
  npx ${BRAND_PACKAGE_NAME} pair --url https://idlechip.com --code ABCD-1234
  npx ${BRAND_PACKAGE_NAME} scan

Then scan / watch use your saved pairing automatically.
This scanner only connects to IdleChip (${DEFAULT_API_URL}).
`);
}

function parseGpuKeyArg(raw: string, gpus: Awaited<ReturnType<typeof scanGpus>>): string {
  const index = Number.parseInt(raw, 10);
  if (!Number.isNaN(index) && index >= 0 && index < gpus.length) {
    return gpuHistoryKey(gpus[index]);
  }
  return raw;
}

function parseArgs() {
  let code: string | undefined;
  let gpuKey: string | undefined;
  let sessionId: string | undefined;
  let apiUrl = process.env.IDLECHIP_API_URL ?? DEFAULT_API_URL;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--code" && args[i + 1]) code = args[++i];
    if (args[i] === "--gpu" && args[i + 1]) gpuKey = args[++i];
    if (args[i] === "--session" && args[i + 1]) sessionId = args[++i];
    if (args[i] === "--url" && args[i + 1]) apiUrl = args[++i];
  }

  return { code, gpuKey, sessionId, apiUrl: assertAllowedApiUrl(apiUrl) };
}

async function cmdPair() {
  const { code, apiUrl } = parseArgs();
  if (!code?.trim()) {
    throw new Error("Missing --code. Generate one on My GPUs while signed in.");
  }
  const creds = await pairWithCode(apiUrl, code);
  console.log(`Paired as ${creds.ownerName} -> ${creds.apiUrl}`);
  console.log("");
  console.log("Credentials saved. Next step - copy and run:");
  console.log(`  npx ${BRAND_PACKAGE_NAME} scan`);
}

async function cmdScan() {
  const creds = requireCredentials();
  assertAllowedApiUrl(creds.apiUrl);

  console.log("Scanning GPUs...\n");

  const config = loadLocalGpuConfig();
  const gpus = applyStableHostId(await scanGpus(), config.hostId);
  updateLocalScan(gpus, creds.ownerName);

  if (gpus.length === 0) {
    console.log("No GPUs found.");
    return;
  }

  for (const gpu of gpus) {
    console.log(`━━ ${gpu.name} ━━`);
    console.log(`  Summary:    ${formatGpuSummary(gpu)}`);
    console.log(`  VRAM:       ${formatVram(gpu.vramFreeMb)} free / ${formatVram(gpu.vramTotalMb)} total`);
    if (gpu.gpuUuid) console.log(`  UUID:       ${gpu.gpuUuid}`);
    console.log();
  }

  console.log(`Found ${gpus.length} GPU(s).`);
  await syncHostConfigToApi(creds);
  console.log(`Synced to ${creds.apiUrl}/gpus`);
}

async function cmdRegister() {
  const creds = requireCredentials();
  const { gpuKey: gpuKeyArg } = parseArgs();

  const config = loadLocalGpuConfig();
  const allGpus = applyStableHostId(await scanGpus(), config.hostId);
  updateLocalScan(allGpus, creds.ownerName);

  const resolvedKey = resolveGpuKey(
    loadLocalGpuConfig(),
    gpuKeyArg ? parseGpuKeyArg(gpuKeyArg, allGpus) : undefined
  );

  if (allGpus.length > 0 && !resolvedKey) {
    throw new Error("Select a GPU on My GPUs or pass --gpu <index|uuid>.");
  }

  const gpus = filterGpusByKey(allGpus, resolvedKey);
  console.log(`Registering ${gpus[0].name}...`);

  const res = await fetch(`${creds.apiUrl}/api/gpus`, {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify(gpus.map((g) => ({ ...g, ownerName: creds.ownerName }))),
  });

  if (!res.ok) {
    throw new Error(`Registration failed (${res.status}): ${await res.text()}`);
  }

  const registered = (await res.json()) as { id: string; name: string }[];
  updateLocalRegistration(
    registered.map((gpu, i) => ({ key: gpuHistoryKey(gpus[i]), id: gpu.id })),
    creds.ownerName
  );
  await syncHostConfigToApi(creds);
  console.log(`Registered ${registered.length} GPU(s) at ${creds.apiUrl}/gpus`);
}

async function cmdWatch() {
  const creds = requireCredentials();
  const { gpuKey: gpuKeyArg, sessionId } = parseArgs();

  console.log(
    `Watching — scan + sync every ${SCAN_SYNC_INTERVAL_MS / 1000}s (${creds.apiUrl})${
      sessionId ? ` · session ${sessionId.slice(0, 8)}…` : ""
    }\n`
  );

  let lastHeartbeatAttempt = 0;

  async function tick() {
    try {
      const config = loadLocalGpuConfig();
      const allGpus = applyStableHostId(await scanGpus(), config.hostId);
      updateLocalScan(allGpus, creds.ownerName);

      const resolvedKey = resolveGpuKey(
        loadLocalGpuConfig(),
        gpuKeyArg ? parseGpuKeyArg(gpuKeyArg, allGpus) : undefined
      );
      const gpus = filterGpusByKey(allGpus, resolvedKey);
      const latestConfig = loadLocalGpuConfig();
      const gpuIds = gpus
        .map((gpu) => latestConfig.registeredByKey[gpuHistoryKey(gpu)])
        .filter((id): id is string => !!id);

      const summary = gpus.map((gpu) => `${gpu.name} ${gpu.utilizationPct ?? "?"}%`).join(", ");
      await syncHostConfigToApi(creds);

      const heartbeatDue = Date.now() - lastHeartbeatAttempt >= HEARTBEAT_INTERVAL_MS;
      if (!heartbeatDue) {
        console.log(`[${new Date().toLocaleTimeString()}] Synced scan: ${summary}`);
        return;
      }

      lastHeartbeatAttempt = Date.now();
      if (gpuIds.length === 0) {
        console.log(
          `[${new Date().toLocaleTimeString()}] Synced scan: ${summary} — register selected GPU for heartbeats.`
        );
        return;
      }

      const headers = authHeaders(creds);
      const res = sessionId
        ? await fetch(`${creds.apiUrl}/api/sessions/${sessionId}/attest`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              gpuId: gpuIds[0],
              utilizationPct: gpus[0]?.utilizationPct ?? null,
              signed: signAttestationForSubmit(
                buildSessionAttestationPayload({
                  sessionId,
                  gpuId: gpuIds[0]!,
                  utilizationPct: gpus[0]?.utilizationPct ?? null,
                }),
              ),
            }),
          })
        : await fetch(`${creds.apiUrl}/api/gpus/heartbeat`, {
            method: "POST",
            headers,
            body: JSON.stringify({ gpuIds }),
          });

      if (!res.ok) {
        const label = sessionId ? "Session attestation" : "Heartbeat";
        throw new Error(`${label} failed (${res.status}): ${await res.text()}`);
      }

      console.log(
        `[${new Date().toLocaleTimeString()}] ${sessionId ? "Session attestation" : "Heartbeat"} + sync OK: ${summary}`,
      );
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Error:`, (err as Error).message);
    }
  }

  await tick();
  setInterval(tick, SCAN_SYNC_INTERVAL_MS);
}

async function main() {
  try {
    switch (command) {
      case "pair":
        await cmdPair();
        break;
      case "scan":
        await cmdScan();
        break;
      case "register":
        await cmdRegister();
        break;
      case "watch":
        await cmdWatch();
        break;
      default:
        usage();
        process.exit(command ? 1 : 0);
    }
  } catch (err) {
    console.error("Error:", (err as Error).message);
    process.exit(1);
  }
}

void main();
