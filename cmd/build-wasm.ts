// build-wasm.ts -- build wasm module from dist (requires emsdk in PATH or emcc).
import { $ } from "bun";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { ensureDist, DIST_C, DIST_H } from "./build-dist";

const ROOT = `${import.meta.dir}/..`.replaceAll("\\", "/");
const WASM = join(ROOT, "wasm");

export async function buildWasm() {
  await ensureDist();

  const emcc = "emcc";
  const haveEmcc = (await $`command -v ${emcc}`.nothrow().quiet()).exitCode === 0;
  if (!haveEmcc) {
    console.log("wasm build skipped: emcc not found in PATH (install emsdk)");
    return;
  }

  mkdirSync(WASM, { recursive: true });
  // single file wasm+js
  const flags = [
    "-O2",
    "-s", "WASM=1",
    "-s", "SINGLE_FILE=1",
    "-s", "ALLOW_MEMORY_GROWTH=1",
    "-s", "EXPORTED_FUNCTIONS=_chm_ctx_new,_chm_ctx_free,_chm_open,_chm_close,_chm_read_entry,_chm_get_entries,_malloc,_free",
    "-I" + join(ROOT, "dist"),
  ];
  const preJs = join(WASM, "pre.js");
  const preArgs = existsSync(preJs) ? ["--pre-js", preJs] : [];
  const out = join(WASM, "chm.js");
  const res = await $`${emcc} ${DIST_C} ${preArgs} -o ${out} ${flags}`.nothrow();
  if (res.exitCode === 0) console.log(`wasm build ok: ${out}`);
  else console.log(`wasm build failed (exit ${res.exitCode})`);
}

if (import.meta.main) await buildWasm();
