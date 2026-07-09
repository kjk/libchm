// build-wasm.ts -- build wasm module from dist (requires emsdk in PATH or emcc).
import { $ } from "bun";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { ensureDist, DIST_C, DIST_H } from "./build-dist";

const ROOT = `${import.meta.dir}/..`.replaceAll("\\", "/");
const WASM = join(ROOT, "wasm");

export async function buildWasm() {
  await ensureDist();
  mkdirSync(WASM, { recursive: true });
  const emcc = "emcc";
  // single file wasm+js
  const flags = "-O2 -s WASM=1 -s SINGLE_FILE=1 -s ALLOW_MEMORY_GROWTH=1 -s EXPORTED_FUNCTIONS=_chm_open,_chm_close,_chm_enumerate,_malloc,_free -I" + join(ROOT, "dist");
  await $`${emcc} ${DIST_C} --pre-js ${join(WASM, "pre.js") || ""} -o ${join(WASM, "chm.js")} ${flags}`.nothrow();
  console.log("wasm build attempted (needs emcc). See wasm/");
}

if (import.meta.main) await buildWasm();
