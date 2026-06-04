/** Manufacturer-declared peak FP32 TFLOPS by model name — not measured at scan time. */
export const KNOWN_TFLOPS: Record<string, number> = {
  "GTX 1650": 2.9,
  "GTX 1660": 5.0,
  "RTX 4090": 82.6,
  "RTX 4080": 48.7,
  "RTX 4070 Ti": 40.1,
  "RTX 4070": 29.1,
  "RTX 4060 Ti": 22.1,
  "RTX 4060": 15.1,
  "RTX 3090": 35.6,
  "RTX 3080": 29.8,
  "RTX 3070": 20.3,
  "RTX 3060": 12.7,
  "RTX A6000": 38.7,
  "RTX A5000": 27.8,
  "A100": 19.5,
  "H100": 60.0,
  "V100": 15.7,
};

export const KNOWN_CUDA_CORES: Record<string, number> = {
  "GTX 1650": 896,
  "GTX 1660": 1408,
  "RTX 4090": 16384,
  "RTX 4080": 9728,
  "RTX 4070": 5888,
  "RTX 3090": 10496,
  "RTX 3080": 8704,
  "RTX 3070": 5888,
  "RTX 3060": 3584,
};

export function lookupByName(table: Record<string, number>, gpuName: string): number | null {
  for (const [key, value] of Object.entries(table)) {
    if (gpuName.includes(key)) return value;
  }
  return null;
}
