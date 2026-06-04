import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { GpuSpecs } from "../types.js";
import { KNOWN_CUDA_CORES, KNOWN_TFLOPS, lookupByName } from "./lookups.js";

const execFileAsync = promisify(execFile);

export type GpuScanBackend = "nvml" | "nvidia-smi" | "wmic";

let lastBackend: GpuScanBackend | null = null;

export function getLastScanBackend(): GpuScanBackend | null {
  return lastBackend;
}

function parseIntSafe(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatSafe(value: string | undefined): number | null {
  if (!value || /n\/a|\[N\/A\]|not supported/i.test(value)) return null;
  const n = parseFloat(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseFanSpeed(value: string | undefined): number | null {
  if (!value || /n\/a|\[N\/A\]|not supported/i.test(value)) return null;
  const n = parseFloat(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function runNvidiaSmi(): Promise<GpuSpecs[]> {
  const query = [
    "index",
    "uuid",
    "name",
    "memory.total",
    "memory.used",
    "memory.free",
    "driver_version",
    "compute_cap",
    "temperature.gpu",
    "utilization.gpu",
    "power.draw",
    "power.limit",
    "clocks.current.graphics",
    "clocks.current.memory",
    "fan.speed",
    "pcie.link.gen.current",
    "pcie.link.width.current",
  ].join(",");

  const { stdout } = await execFileAsync("nvidia-smi", [
    `--query-gpu=${query}`,
    "--format=csv,noheader,nounits",
  ]);

  const lines = stdout.trim().split("\n").filter(Boolean);
  const hostId = randomUUID();
  const hostName = process.env.COMPUTERNAME || process.env.HOSTNAME || "unknown-host";
  const scannedAt = new Date().toISOString();

  return lines.map((line) => {
    const parts = line.split(",").map((p) => p.trim());
    const [
      ,
      gpuUuid,
      name,
      vramTotal,
      vramUsed,
      vramFree,
      driverVersion,
      computeCap,
      temperature,
      utilization,
      powerDraw,
      powerLimit,
      clockGraphics,
      clockMemory,
      fanSpeed,
      pcieGen,
      pcieWidth,
    ] = parts;

    return {
      id: randomUUID(),
      name: name || "Unknown GPU",
      vendor: "NVIDIA",
      vramTotalMb: parseIntSafe(vramTotal) ?? 0,
      vramUsedMb: parseIntSafe(vramUsed),
      vramFreeMb: parseIntSafe(vramFree) ?? 0,
      driverVersion: driverVersion || "unknown",
      computeCapability: computeCap || null,
      cudaCores: lookupByName(KNOWN_CUDA_CORES, name || ""),
      estimatedTflops: lookupByName(KNOWN_TFLOPS, name || ""),
      pcieGen: pcieGen ? `Gen ${pcieGen}` : null,
      pcieWidth: pcieWidth ? `x${pcieWidth}` : null,
      clockGraphicsMhz: parseFloatSafe(clockGraphics),
      clockMemoryMhz: parseFloatSafe(clockMemory),
      fanSpeedPct: parseFanSpeed(fanSpeed),
      gpuUuid: gpuUuid || null,
      temperatureC: parseFloatSafe(temperature),
      utilizationPct: parseFloatSafe(utilization),
      powerDrawW: parseFloatSafe(powerDraw),
      powerLimitW: parseFloatSafe(powerLimit),
      hostId,
      hostName,
      scannedAt,
    } satisfies GpuSpecs;
  });
}

async function runWmicFallback(): Promise<GpuSpecs[]> {
  try {
    const { stdout } = await execFileAsync("wmic", [
      "path",
      "win32_VideoController",
      "get",
      "Name,AdapterRAM,DriverVersion",
      "/format:csv",
    ]);

    const lines = stdout.trim().split("\n").filter((l) => l.includes(","));
    const hostId = randomUUID();
    const hostName = process.env.COMPUTERNAME || "unknown-host";
    const scannedAt = new Date().toISOString();

    return lines.slice(1).map((line) => {
      const parts = line.split(",");
      const name = parts[2]?.trim() || "Unknown GPU";
      const vramBytes = parseIntSafe(parts[1]);
      const vramMb = vramBytes ? Math.round(vramBytes / (1024 * 1024)) : 0;

      return {
        id: randomUUID(),
        name,
        vendor: name.includes("NVIDIA") ? "NVIDIA" : name.includes("AMD") ? "AMD" : "Unknown",
        vramTotalMb: vramMb,
        vramUsedMb: null,
        vramFreeMb: vramMb,
        driverVersion: parts[3]?.trim() || "unknown",
        computeCapability: null,
        cudaCores: lookupByName(KNOWN_CUDA_CORES, name),
        estimatedTflops: lookupByName(KNOWN_TFLOPS, name),
        pcieGen: null,
        pcieWidth: null,
        clockGraphicsMhz: null,
        clockMemoryMhz: null,
        fanSpeedPct: null,
        gpuUuid: null,
        temperatureC: null,
        utilizationPct: null,
        powerDrawW: null,
        powerLimitW: null,
        hostId,
        hostName,
        scannedAt,
      } satisfies GpuSpecs;
    });
  } catch {
    return [];
  }
}

export async function scanGpus(): Promise<GpuSpecs[]> {
  if (!process.env.IDLECHIP_SKIP_NVML) {
    try {
      const { scanGpusViaNvml } = await import("./nvml.js");
      const nvmlGpus = scanGpusViaNvml();
      if (nvmlGpus?.length) {
        lastBackend = "nvml";
        return nvmlGpus;
      }
    } catch {
      // NVML unavailable — fall through
    }
  }

  try {
    const gpus = await runNvidiaSmi();
    if (gpus.length > 0) {
      lastBackend = "nvidia-smi";
      return gpus;
    }
  } catch {
    // nvidia-smi not available
  }

  const fallback = await runWmicFallback();
  if (fallback.length > 0) {
    lastBackend = "wmic";
    return fallback;
  }

  throw new Error(
    "No GPUs detected. Install NVIDIA drivers (nvidia-smi) or ensure a GPU is present."
  );
}

export function formatVram(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function formatGpuSummary(gpu: GpuSpecs): string {
  const parts = [gpu.name, formatVram(gpu.vramTotalMb)];
  if (gpu.estimatedTflops) parts.push(`~${gpu.estimatedTflops} TFLOPS peak (declared)`);
  if (gpu.computeCapability) parts.push(`CC ${gpu.computeCapability}`);
  return parts.join(" · ");
}
