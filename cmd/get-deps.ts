// get-deps.ts -- fetch local dependencies and create the test corpus dir.
// For larger corpus, place .chm files under testfiles/chm/ (gitignored).
import { $ } from "bun";
import { mkdirSync } from "fs";
import { existsSync } from "fs";
import { join } from "path";

const ROOT = `${import.meta.dir}/..`;
const DEST = join(ROOT, "testfiles", "chm");
export const CHMLIB_DIR = join(ROOT, "deps", "CHMLib");

export async function getDeps(): Promise<string> {
  mkdirSync(DEST, { recursive: true });
  mkdirSync(join(ROOT, "deps"), { recursive: true });
  if (!existsSync(join(CHMLIB_DIR, "src", "chm_lib.h"))) {
    await $`git clone --depth 1 https://github.com/jedwing/CHMLib ${CHMLIB_DIR}`.cwd(ROOT);
  }
  return DEST;
}

if (import.meta.main) {
  await getDeps();
  console.log("deps ready (CHMLib and local testfiles/chm)");
}
