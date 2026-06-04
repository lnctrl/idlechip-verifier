import { build } from "esbuild";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wantExe = process.argv.includes("--exe");

if (!existsSync(join(root, "dist"))) {
  mkdirSync(join(root, "dist"), { recursive: true });
}

await build({
  entryPoints: [join(root, "src/cli.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: join(root, "dist/cli.js"),
  format: "cjs",
  external: wantExe ? [] : ["koffi"],
  define: wantExe ? { "process.env.IDLECHIP_SKIP_NVML": '"1"' } : {},
  logLevel: "info",
});

console.log("Built dist/cli.js");

if (wantExe) {
  const out = join(root, "dist/idlechip-agent-win-x64.exe");
  execSync(
    `npx --yes @yao-pkg/pkg@6.6.0 cli.js -t node20-win-x64 -o idlechip-agent-win-x64.exe`,
    { stdio: "inherit", cwd: join(root, "dist") }
  );
  console.log(`Built ${out}`);
}
