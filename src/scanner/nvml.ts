import { randomUUID } from "node:crypto";
import koffi from "koffi";
import type { GpuSpecs } from "../types.js";
import { KNOWN_CUDA_CORES, KNOWN_TFLOPS, lookupByName } from "./lookups";

const NVML_SUCCESS = 0;
const NVML_TEMPERATURE_GPU = 0;
const NVML_CLOCK_GRAPHICS = 0;
const NVML_CLOCK_MEM = 2;
const NVML_FAN_DEFAULT = 0;

type NvmlLib = ReturnType<typeof koffi.load>;

interface NvmlStructs {
  memory: ReturnType<typeof koffi.struct>;
  utilization: ReturnType<typeof koffi.struct>;
}

interface NvmlFns {
  nvmlInit_v2: () => number;
  nvmlShutdown: () => number;
  nvmlDeviceGetCount_v2: (count: [number]) => number;
  nvmlDeviceGetHandleByIndex_v2: (index: number, handle: [unknown]) => number;
  nvmlDeviceGetName: (handle: unknown, name: Buffer, length: number) => number;
  nvmlDeviceGetUUID: (handle: unknown, uuid: Buffer, length: number) => number;
  nvmlDeviceGetMemoryInfo: (handle: unknown, memory: unknown) => number;
  nvmlDeviceGetUtilizationRates: (handle: unknown, util: unknown) => number;
  nvmlDeviceGetTemperature: (handle: unknown, type: number, temp: [number]) => number;
  nvmlDeviceGetPowerUsage: (handle: unknown, power: [number]) => number;
  nvmlDeviceGetEnforcedPowerLimit: (handle: unknown, limit: [number]) => number;
  nvmlDeviceGetClockInfo: (handle: unknown, type: number, clock: [number]) => number;
  nvmlDeviceGetFanSpeed_v2: (handle: unknown, type: number, speed: [number]) => number;
  nvmlDeviceGetCudaComputeCapability: (
    handle: unknown,
    major: [number],
    minor: [number]
  ) => number;
  nvmlDeviceGetCurrPcieLinkGeneration: (handle: unknown, gen: [number]) => number;
  nvmlDeviceGetCurrPcieLinkWidth: (handle: unknown, width: [number]) => number;
  nvmlSystemGetDriverVersion: (version: Buffer, length: number) => number;
}

interface NvmlRuntime {
  initState: "idle" | "ready" | "failed";
  fns: NvmlFns | null;
  structs: NvmlStructs | null;
  driverVersionCache: string | null;
}

const globalNvml = globalThis as typeof globalThis & {
  idlechipNvmlRuntime?: NvmlRuntime;
};

function runtime(): NvmlRuntime {
  if (!globalNvml.idlechipNvmlRuntime) {
    globalNvml.idlechipNvmlRuntime = {
      initState: "idle",
      fns: null,
      structs: null,
      driverVersionCache: null,
    };
  }
  return globalNvml.idlechipNvmlRuntime;
}

function getStructs(): NvmlStructs {
  const state = runtime();
  if (state.structs) return state.structs;

  // Named once per process — survives Next.js hot reload without duplicate-type errors.
  state.structs = {
    memory: koffi.struct("IdlechipNvmlMemory", {
      total: "uint64",
      free: "uint64",
      used: "uint64",
    }),
    utilization: koffi.struct("IdlechipNvmlUtilization", {
      gpu: "uint32",
      memory: "uint32",
    }),
  };
  return state.structs;
}

function loadNvmlLibrary(): NvmlLib {
  if (process.platform === "win32") {
    const candidates = [
      process.env.NVML_DLL,
      "C:\\Windows\\System32\\nvml.dll",
      "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvml.dll",
      "nvml.dll",
    ].filter((p): p is string => !!p);

    let lastErr: unknown;
    for (const path of candidates) {
      try {
        return koffi.load(path);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  return koffi.load("libnvidia-ml.so.1");
}

function bindNvml(lib: NvmlLib, structs: NvmlStructs): NvmlFns {
  return {
    nvmlInit_v2: lib.func("nvmlInit_v2", "uint32", []),
    nvmlShutdown: lib.func("nvmlShutdown", "uint32", []),
    nvmlDeviceGetCount_v2: lib.func("nvmlDeviceGetCount_v2", "uint32", ["uint32 *"]),
    nvmlDeviceGetHandleByIndex_v2: lib.func("nvmlDeviceGetHandleByIndex_v2", "uint32", [
      "uint32",
      "void **",
    ]),
    nvmlDeviceGetName: lib.func("nvmlDeviceGetName", "uint32", ["void *", "char *", "uint32"]),
    nvmlDeviceGetUUID: lib.func("nvmlDeviceGetUUID", "uint32", ["void *", "char *", "uint32"]),
    nvmlDeviceGetMemoryInfo: lib.func("nvmlDeviceGetMemoryInfo", "uint32", [
      "void *",
      koffi.pointer(structs.memory),
    ]),
    nvmlDeviceGetUtilizationRates: lib.func("nvmlDeviceGetUtilizationRates", "uint32", [
      "void *",
      koffi.pointer(structs.utilization),
    ]),
    nvmlDeviceGetTemperature: lib.func("nvmlDeviceGetTemperature", "uint32", [
      "void *",
      "uint32",
      "uint32 *",
    ]),
    nvmlDeviceGetPowerUsage: lib.func("nvmlDeviceGetPowerUsage", "uint32", ["void *", "uint32 *"]),
    nvmlDeviceGetEnforcedPowerLimit: lib.func("nvmlDeviceGetEnforcedPowerLimit", "uint32", [
      "void *",
      "uint32 *",
    ]),
    nvmlDeviceGetClockInfo: lib.func("nvmlDeviceGetClockInfo", "uint32", [
      "void *",
      "uint32",
      "uint32 *",
    ]),
    nvmlDeviceGetFanSpeed_v2: lib.func("nvmlDeviceGetFanSpeed_v2", "uint32", [
      "void *",
      "uint32",
      "uint32 *",
    ]),
    nvmlDeviceGetCudaComputeCapability: lib.func("nvmlDeviceGetCudaComputeCapability", "uint32", [
      "void *",
      "int *",
      "int *",
    ]),
    nvmlDeviceGetCurrPcieLinkGeneration: lib.func("nvmlDeviceGetCurrPcieLinkGeneration", "uint32", [
      "void *",
      "uint32 *",
    ]),
    nvmlDeviceGetCurrPcieLinkWidth: lib.func("nvmlDeviceGetCurrPcieLinkWidth", "uint32", [
      "void *",
      "uint32 *",
    ]),
    nvmlSystemGetDriverVersion: lib.func("nvmlSystemGetDriverVersion", "uint32", [
      "char *",
      "uint32",
    ]),
  };
}

function ensureNvml(): NvmlFns | null {
  const state = runtime();
  if (state.initState === "failed") return null;
  if (state.initState === "ready" && state.fns) return state.fns;

  try {
    const structs = getStructs();
    const lib = loadNvmlLibrary();
    const bound = bindNvml(lib, structs);
    const rc = bound.nvmlInit_v2();
    if (rc !== NVML_SUCCESS) {
      state.initState = "failed";
      return null;
    }
    state.fns = bound;
    state.initState = "ready";
    return state.fns;
  } catch {
    state.initState = "failed";
    return null;
  }
}

function readStringBuffer(buf: Buffer): string {
  return buf.toString("utf8").split("\0")[0]?.trim() ?? "";
}

function getDriverVersion(api: NvmlFns): string {
  const state = runtime();
  if (state.driverVersionCache) return state.driverVersionCache;
  const buf = Buffer.alloc(81);
  const rc = api.nvmlSystemGetDriverVersion(buf, buf.length);
  state.driverVersionCache =
    rc === NVML_SUCCESS ? readStringBuffer(buf) || "unknown" : "unknown";
  return state.driverVersionCache;
}

function mbFromBytes(bytes: bigint | number): number {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  return Math.round(n / (1024 * 1024));
}

function readUint(call: () => number, out: [number]): number | null {
  out[0] = 0;
  const rc = call();
  return rc === NVML_SUCCESS ? out[0] : null;
}

export function nvmlAvailable(): boolean {
  const api = ensureNvml();
  if (!api) return false;
  const count: [number] = [0];
  return api.nvmlDeviceGetCount_v2(count) === NVML_SUCCESS && count[0] > 0;
}

export function scanGpusViaNvml(): GpuSpecs[] | null {
  const api = ensureNvml();
  if (!api) return null;

  const structs = getStructs();
  const count: [number] = [0];
  if (api.nvmlDeviceGetCount_v2(count) !== NVML_SUCCESS || count[0] === 0) {
    return null;
  }

  const hostId = randomUUID();
  const hostName = process.env.COMPUTERNAME || process.env.HOSTNAME || "unknown-host";
  const scannedAt = new Date().toISOString();
  const driverVersion = getDriverVersion(api);
  const gpus: GpuSpecs[] = [];

  for (let index = 0; index < count[0]; index++) {
    const handle: [unknown] = [null];
    if (api.nvmlDeviceGetHandleByIndex_v2(index, handle) !== NVML_SUCCESS || !handle[0]) {
      continue;
    }

    const nameBuf = Buffer.alloc(64);
    if (api.nvmlDeviceGetName(handle[0], nameBuf, nameBuf.length) !== NVML_SUCCESS) {
      continue;
    }
    const name = readStringBuffer(nameBuf) || "Unknown GPU";

    const uuidBuf = Buffer.alloc(80);
    api.nvmlDeviceGetUUID(handle[0], uuidBuf, uuidBuf.length);
    const gpuUuid = readStringBuffer(uuidBuf) || null;

    const memPtr = koffi.alloc(structs.memory, 1);
    if (api.nvmlDeviceGetMemoryInfo(handle[0], memPtr) !== NVML_SUCCESS) {
      koffi.free(memPtr);
      continue;
    }
    const memory = koffi.decode(memPtr, structs.memory) as {
      total: bigint | number;
      free: bigint | number;
      used: bigint | number;
    };
    koffi.free(memPtr);

    const utilPtr = koffi.alloc(structs.utilization, 1);
    api.nvmlDeviceGetUtilizationRates(handle[0], utilPtr);
    const util = koffi.decode(utilPtr, structs.utilization) as { gpu: number; memory: number };
    koffi.free(utilPtr);

    const temp: [number] = [0];
    const temperatureC = readUint(
      () => api.nvmlDeviceGetTemperature(handle[0], NVML_TEMPERATURE_GPU, temp),
      temp
    );

    const powerMw: [number] = [0];
    const powerLimitMw: [number] = [0];
    const powerMwVal = readUint(() => api.nvmlDeviceGetPowerUsage(handle[0], powerMw), powerMw);
    const powerLimitMwVal = readUint(
      () => api.nvmlDeviceGetEnforcedPowerLimit(handle[0], powerLimitMw),
      powerLimitMw
    );

    const graphicsClock: [number] = [0];
    const memoryClock: [number] = [0];
    const clockGraphicsMhz = readUint(
      () => api.nvmlDeviceGetClockInfo(handle[0], NVML_CLOCK_GRAPHICS, graphicsClock),
      graphicsClock
    );
    const clockMemoryMhz = readUint(
      () => api.nvmlDeviceGetClockInfo(handle[0], NVML_CLOCK_MEM, memoryClock),
      memoryClock
    );

    const fan: [number] = [0];
    const fanSpeedPct = readUint(
      () => api.nvmlDeviceGetFanSpeed_v2(handle[0], NVML_FAN_DEFAULT, fan),
      fan
    );

    const major: [number] = [0];
    const minor: [number] = [0];
    let computeCapability: string | null = null;
    if (api.nvmlDeviceGetCudaComputeCapability(handle[0], major, minor) === NVML_SUCCESS) {
      computeCapability = `${major[0]}.${minor[0]}`;
    }

    const pcieGen: [number] = [0];
    const pcieWidth: [number] = [0];
    const gen = readUint(
      () => api.nvmlDeviceGetCurrPcieLinkGeneration(handle[0], pcieGen),
      pcieGen
    );
    const width = readUint(
      () => api.nvmlDeviceGetCurrPcieLinkWidth(handle[0], pcieWidth),
      pcieWidth
    );

    gpus.push({
      id: randomUUID(),
      name,
      vendor: "NVIDIA",
      vramTotalMb: mbFromBytes(memory.total),
      vramUsedMb: mbFromBytes(memory.used),
      vramFreeMb: mbFromBytes(memory.free),
      driverVersion,
      computeCapability,
      cudaCores: lookupByName(KNOWN_CUDA_CORES, name),
      estimatedTflops: lookupByName(KNOWN_TFLOPS, name),
      pcieGen: gen != null ? `Gen ${gen}` : null,
      pcieWidth: width != null ? `x${width}` : null,
      clockGraphicsMhz: clockGraphicsMhz,
      clockMemoryMhz: clockMemoryMhz,
      fanSpeedPct: fanSpeedPct,
      gpuUuid,
      temperatureC,
      utilizationPct: util.gpu ?? null,
      powerDrawW: powerMwVal != null ? Math.round(powerMwVal / 1000) : null,
      powerLimitW: powerLimitMwVal != null ? Math.round(powerLimitMwVal / 1000) : null,
      hostId,
      hostName,
      scannedAt,
    });
  }

  return gpus.length > 0 ? gpus : null;
}

export function shutdownNvml() {
  const state = runtime();
  if (state.initState !== "ready" || !state.fns) return;
  try {
    state.fns.nvmlShutdown();
  } catch {
    // ignore shutdown errors
  }
  state.fns = null;
  state.initState = "idle";
  state.driverVersionCache = null;
}
