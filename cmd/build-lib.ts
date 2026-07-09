// build-lib.ts -- helpers to build the plain library and fuzz target.
import { $ } from "bun";
import { mkdirSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");

export const FUZZ_EXE = join(ROOT, "out", "fuzz", process.platform === "win32" ? "chm_fuzz.exe" : "chm_fuzz");

export async function buildFuzz(): Promise<string> {
  const outDir = join(ROOT, "out", "fuzz");
  mkdirSync(outDir, { recursive: true });
  const srcs = [
    join(ROOT, "src", "lzx.c"),
    join(ROOT, "src", "chm.c"),
    join(ROOT, "test", "fuzz_target.c"),
  ];
  const exe = FUZZ_EXE;
  const flags = "-O2 -g -fsanitize=fuzzer,address -I" + join(ROOT, "src");
  await $`clang ${flags} ${srcs.join(" ")} -o ${exe}`.cwd(ROOT);
  return exe;
}
