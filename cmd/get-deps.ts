// get-deps.ts -- for chm: minimal, no external clones needed for basic use.
// For larger corpus, place .chm files under testfiles/chm/ (gitignored).
import { mkdirSync } from "fs";
import { join } from "path";

const ROOT = `${import.meta.dir}/..`;
const DEST = join(ROOT, "testfiles", "chm");

export async function getDeps(): Promise<string> {
  mkdirSync(DEST, { recursive: true });
  // In real use one would copy samples here.
  return DEST;
}

if (import.meta.main) {
  await getDeps();
  console.log("deps ready (chm uses local testfiles/chm)");
}
