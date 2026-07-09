// build-lib.ts -- helpers to build the plain library and fuzz target.
import { $ } from "bun";
import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");

export const FUZZ_EXE = join(ROOT, "out", "fuzz", process.platform === "win32" ? "chm_fuzz.exe" : "chm_fuzz");

function findFuzzClang(): string {
  const env = process.env.CLANG || process.env.CC || process.env.FUZZ_CC;
  if (env && existsSync(env)) return env;
  if (process.platform === "darwin") {
    // Homebrew llvm provides a clang with libFuzzer support.
    const candidates = [
      "/opt/homebrew/opt/llvm/bin/clang",
      "/usr/local/opt/llvm/bin/clang",
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  }
  return "clang";
}

export async function buildFuzz(): Promise<string> {
  const outDir = join(ROOT, "out", "fuzz");
  mkdirSync(outDir, { recursive: true });
  const srcs = [
    join(ROOT, "src", "lzx.c"),
    join(ROOT, "src", "chm.c"),
    join(ROOT, "test", "fuzz_target.c"),
  ];
  const exe = FUZZ_EXE;
  const inc = "-I" + join(ROOT, "src");
  const cc = findFuzzClang();
  try {
    await $`${cc} -O2 -g -fsanitize=fuzzer,address ${inc} ${srcs} -o ${exe}`.cwd(ROOT);
  } catch (e) {
    if (process.platform === "darwin" && cc === "clang") {
      console.error("\nfuzz build failed: Apple's clang does not include libFuzzer.");
      console.error("Install LLVM from Homebrew which provides a clang with fuzzer support:");
      console.error("  brew install llvm");
      console.error("Then re-run. The script will auto-detect /opt/homebrew/opt/llvm/bin/clang.\n");
    }
    throw e;
  }
  return exe;
}
