/** Types shared with the IdleChip web API (agent subset only). */

export interface GpuSpecs {
  id: string;
  name: string;
  vendor: string;
  vramTotalMb: number;
  vramUsedMb: number | null;
  vramFreeMb: number;
  driverVersion: string;
  computeCapability: string | null;
  cudaCores: number | null;
  estimatedTflops: number | null;
  pcieGen: string | null;
  pcieWidth: string | null;
  clockGraphicsMhz: number | null;
  clockMemoryMhz: number | null;
  fanSpeedPct: number | null;
  gpuUuid: string | null;
  temperatureC: number | null;
  utilizationPct: number | null;
  powerDrawW: number | null;
  powerLimitW: number | null;
  hostId: string;
  hostName: string;
  scannedAt: string;
  lastHeartbeatAt?: string | null;
  isOnline?: boolean;
}

export function gpuHistoryKey(gpu: GpuSpecs): string {
  return gpu.gpuUuid ?? gpu.name;
}

export interface GpuHistoryPoint {
  timestamp: string;
  utilizationPct: number | null;
  temperatureC: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  powerDrawW: number | null;
  fanSpeedPct: number | null;
}

export interface LocalGpuConfig {
  hostId: string;
  ownerName: string | null;
  hostName: string;
  gpuIds: string[];
  selectedGpuKey: string | null;
  registeredByKey: Record<string, string>;
  lastScan: GpuSpecs[];
  history: Record<string, GpuHistoryPoint[]>;
  updatedAt: string;
  remoteWatch?: {
    scan: { running: boolean; startedAt: string | null };
    heartbeat: { running: boolean; startedAt: string | null };
  };
}
