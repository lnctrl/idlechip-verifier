import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { gpuHistoryKey, type GpuHistoryPoint, type GpuSpecs, type LocalGpuConfig } from "./types.js";

const MAX_HISTORY = 60;

export function configPath(): string {
  const override = process.env.IDLECHIP_CONFIG_PATH?.trim();
  if (override) return override;
  return join(homedir(), ".idlechip", "local-gpus.json");
}

export function pickDefaultGpuKey(gpus: GpuSpecs[]): string | null {
  if (gpus.length === 0) return null;
  if (gpus.length === 1) return gpuHistoryKey(gpus[0]!);
  const discrete = gpus.filter((gpu) =>
    /nvidia|amd|radeon|geforce|quadro|tesla|arc/i.test(gpu.name)
  );
  if (discrete.length === 1) return gpuHistoryKey(discrete[0]!);
  return null;
}

function snapshotFromGpu(gpu: GpuSpecs): GpuHistoryPoint {
  return {
    timestamp: gpu.scannedAt || new Date().toISOString(),
    utilizationPct: gpu.utilizationPct,
    temperatureC: gpu.temperatureC,
    vramUsedMb: gpu.vramUsedMb,
    vramTotalMb: gpu.vramTotalMb,
    powerDrawW: gpu.powerDrawW,
    fanSpeedPct: gpu.fanSpeedPct,
  };
}

function appendHistory(config: LocalGpuConfig, gpus: GpuSpecs[]) {
  if (!config.history) config.history = {};
  for (const gpu of gpus) {
    const key = gpuHistoryKey(gpu);
    const points = config.history[key] ?? [];
    points.push(snapshotFromGpu(gpu));
    config.history[key] = points.slice(-MAX_HISTORY);
  }
}

function migrateConfig(config: LocalGpuConfig): LocalGpuConfig {
  if (!config.gpuIds) config.gpuIds = [];
  if (!config.lastScan) config.lastScan = [];
  if (!config.history) config.history = {};
  if (!config.registeredByKey) config.registeredByKey = {};
  if (config.selectedGpuKey === undefined) config.selectedGpuKey = null;

  if (config.lastScan.length) {
    const keys = new Set(config.lastScan.map(gpuHistoryKey));
    if (config.selectedGpuKey && !keys.has(config.selectedGpuKey)) {
      config.selectedGpuKey = pickDefaultGpuKey(config.lastScan);
    }
    if (!config.selectedGpuKey) {
      config.selectedGpuKey = pickDefaultGpuKey(config.lastScan);
    }
  }

  config.gpuIds = [...new Set(Object.values(config.registeredByKey))];
  return config;
}

function emptyConfig(hostName: string): LocalGpuConfig {
  return {
    hostId: randomUUID(),
    ownerName: null,
    hostName,
    gpuIds: [],
    selectedGpuKey: null,
    registeredByKey: {},
    lastScan: [],
    history: {},
    updatedAt: new Date().toISOString(),
  };
}

export function loadLocalGpuConfig(): LocalGpuConfig {
  const path = configPath();
  const hostName = process.env.COMPUTERNAME || process.env.HOSTNAME || "unknown-host";
  if (!existsSync(path)) return emptyConfig(hostName);

  try {
    const config = JSON.parse(readFileSync(path, "utf-8")) as LocalGpuConfig;
    if (!config.hostId) config.hostId = randomUUID();
    config.hostName = config.hostName || hostName;
    return migrateConfig(config);
  } catch {
    return emptyConfig(hostName);
  }
}

export function saveLocalGpuConfig(config: LocalGpuConfig) {
  const path = configPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  config.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(migrateConfig(config), null, 2));
}

export function applyStableHostId(gpus: GpuSpecs[], hostId: string): GpuSpecs[] {
  return gpus.map((gpu) => ({ ...gpu, hostId }));
}

export function filterGpusByKey(gpus: GpuSpecs[], key: string | null): GpuSpecs[] {
  if (!key) return gpus;
  const matched = gpus.filter((gpu) => gpuHistoryKey(gpu) === key);
  if (matched.length === 0) {
    throw new Error(`Selected GPU not found in scan: ${key}`);
  }
  return matched;
}

export function resolveGpuKey(config: LocalGpuConfig, keyArg?: string): string | null {
  if (keyArg) return keyArg;
  if (config.selectedGpuKey) return config.selectedGpuKey;
  return pickDefaultGpuKey(config.lastScan);
}

export function updateLocalScan(gpus: GpuSpecs[], ownerName?: string) {
  const config = loadLocalGpuConfig();
  if (ownerName) config.ownerName = ownerName;
  config.lastScan = applyStableHostId(gpus, config.hostId);

  const keys = new Set(config.lastScan.map(gpuHistoryKey));
  if (config.selectedGpuKey && !keys.has(config.selectedGpuKey)) {
    config.selectedGpuKey = null;
  }
  if (!config.selectedGpuKey) {
    config.selectedGpuKey = pickDefaultGpuKey(config.lastScan);
  }

  appendHistory(config, config.lastScan);
  saveLocalGpuConfig(config);
  return config;
}

export function updateLocalRegistration(
  entries: { key: string; id: string }[],
  ownerName?: string
) {
  const config = loadLocalGpuConfig();
  if (ownerName) config.ownerName = ownerName;
  for (const { key, id } of entries) {
    config.registeredByKey[key] = id;
  }
  config.gpuIds = [...new Set(Object.values(config.registeredByKey))];
  saveLocalGpuConfig(config);
  return config;
}

export type { LocalGpuConfig };
