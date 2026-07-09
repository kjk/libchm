// tests.ts -- smoke tests for chm.
import { $ } from "bun";
import { build } from "./build";
import { readdirSync } from "fs";
import { join } from "path";

const ROOT = `${import.meta.dir}/..`;

async function main() {
  const exe = await build(true);
  const corpusDir = join(ROOT, "testfiles", "chm");
  const files = readdirSync(corpusDir).filter(f => f.toLowerCase().endsWith(".chm"));
  console.log(`testing ${files.length} chm files`);
  let passed = 0, failed = 0;
  for (const f of files) {
    const p = join(corpusDir, f);
    const out = await $`${exe} -list ${p}`.quiet().cwd(ROOT).nothrow();
    if (out.exitCode !== 0) {
      console.error("FAIL", f);
      failed++;
    } else {
      console.log("OK", f);
      passed++;
    }
  }
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("all tests passed");
}

main();
