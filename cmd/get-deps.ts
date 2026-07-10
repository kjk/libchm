// get-deps.ts -- create the test corpus dir.
// For larger corpus, place .chm files under testfiles/chm/ (gitignored).
//
// The reference CHMLib (sumatrapdf's ext/CHMLib fork, in-memory chm_open) is
// vendored under test/CHMLib and committed, so no network fetch is needed.
import { mkdirSync } from "fs";
import { join } from "path";

const ROOT = `${import.meta.dir}/..`;
const DEST = join(ROOT, "testfiles", "chm");
export const CHMLIB_DIR = join(ROOT, "test", "CHMLib");

export async function getDeps(): Promise<string> {
  mkdirSync(DEST, { recursive: true });
  return DEST;
}

if (import.meta.main) {
  await getDeps();
  console.log("deps ready (vendored test/CHMLib and local testfiles/chm)");
}
