// fuzz.ts -- coverage-guided fuzzing of the chm reader (libFuzzer + ASan).
//
//   bun cmd/fuzz.ts
//   bun cmd/fuzz.ts -jobs 4
//   bun cmd/fuzz.ts -repro fuzz/crashes/...
import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { buildFuzz } from "./build-lib";

const ROOT = resolve(import.meta.dir, "..");
const FUZZ = join(ROOT, "fuzz");
const CORPUS = join(FUZZ, "corpus");
const CRASHES = join(FUZZ, "crashes");
const SEED_DIR = join(ROOT, "testfiles", "chm");

function usage(): never {
  console.error(`usage: bun cmd/fuzz.ts [options]
  (no args)   build + fuzz (resumes from corpus)
  -jobs N     parallel workers
  -max-len N
  -repro FILE replay one
  -minimize
  -clean`);
  process.exit(2);
}

const args = process.argv.slice(2);
let jobs = 1;
let maxLen = 4000000;
let repro = "";
let minimize = false;
let clean = false;
const extra: string[] = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-jobs") jobs = parseInt(args[++i] || "1", 10);
  else if (a === "-max-len") maxLen = parseInt(args[++i] || "4000000", 10);
  else if (a === "-repro") repro = args[++i] || usage();
  else if (a === "-minimize") minimize = true;
  else if (a === "-clean") clean = true;
  else if (a === "-h" || a === "--help") usage();
  else extra.push(a);
}

async function main() {
  mkdirSync(CORPUS, { recursive: true });
  mkdirSync(CRASHES, { recursive: true });
  if (clean && existsSync(CORPUS)) {
    // keep crashes, nuke corpus to restart
    rmSync(CORPUS, { recursive: true, force: true });
    mkdirSync(CORPUS, { recursive: true });
  }

  const exe = await buildFuzz();
  console.log("fuzz exe:", exe);

  // seed from testfiles/chm if corpus empty
  if (readdirSync(CORPUS).length === 0 && existsSync(SEED_DIR)) {
    for (const f of readdirSync(SEED_DIR)) {
      if (f.toLowerCase().endsWith(".chm")) {
        copyFileSync(join(SEED_DIR, f), join(CORPUS, f));
      }
    }
    console.log("seeded corpus from testfiles/chm");
  }

  if (repro) {
    const reproPath = resolve(repro);
    console.log("reproducing", reproPath);
    const p = await $`${exe} ${reproPath} -artifact_prefix=${CRASHES}/ ${extra}`.cwd(ROOT).nothrow();
    if (p.exitCode !== 0) {
      console.log("repro exited with code", p.exitCode, "(crash reproduced or error)");
    }
    return;
  }
  if (minimize) {
    const minimized = join(FUZZ, "minimized");
    mkdirSync(minimized, { recursive: true });
    console.log("minimizing corpus into", minimized);
    await $`${exe} -merge=1 ${minimized} ${CORPUS} ${extra}`.cwd(ROOT);
    console.log("minimized corpus is in", minimized);
    console.log("to replace: rm -rf", CORPUS, "&& mv", minimized, CORPUS);
    return;
  }

  const flags = [`-jobs=${jobs}`, `-max_len=${maxLen}`, `-artifact_prefix=${CRASHES}/`, CORPUS, ...extra];
  console.log("starting fuzzer (Ctrl-C to stop; rerun to resume)");
  const p = await $`${exe} ${flags}`.cwd(ROOT).nothrow();
  if (p.exitCode !== 0) {
    console.log("fuzzer exited with code", p.exitCode);
    console.log("check", CRASHES, "for any new crash files, and/or the seed corpus for bad inputs.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
