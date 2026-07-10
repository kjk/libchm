// test.ts -- compare libchm extraction against upstream CHMLib.
import { buildDumpers, findChmFiles, readDump, type ChmDumpEntry } from "./chm-common";

function usage(): never {
  console.error("usage: bun cmd/test.ts <file.chm|directory>");
  process.exit(2);
}

function entryMap(entries: ChmDumpEntry[], label: string): Map<string, ChmDumpEntry> {
  const map = new Map<string, ChmDumpEntry>();
  for (const entry of entries) {
    if (map.has(entry.path)) throw new Error(`${label} has duplicate entry: ${entry.path}`);
    map.set(entry.path, entry);
  }
  return map;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function compareEntries(ours: ChmDumpEntry[], theirs: ChmDumpEntry[]): string[] {
  const errors: string[] = [];
  const ourMap = entryMap(ours, "ours");
  const chmLibMap = entryMap(theirs, "chmlib");
  const allPaths = Array.from(new Set([...ourMap.keys(), ...chmLibMap.keys()])).sort();

  for (const path of allPaths) {
    const a = ourMap.get(path);
    const b = chmLibMap.get(path);
    if (!a) {
      errors.push(`missing from ours: ${path}`);
      continue;
    }
    if (!b) {
      errors.push(`extra in ours: ${path}`);
      continue;
    }
    if (a.start !== b.start) errors.push(`${path}: start ours=${a.start} chmlib=${b.start}`);
    if (a.length !== b.length) errors.push(`${path}: length ours=${a.length} chmlib=${b.length}`);
    if (a.flags !== b.flags) errors.push(`${path}: flags ours=${a.flags} chmlib=${b.flags}`);
    if (!sameBytes(a.data, b.data)) errors.push(`${path}: content differs (${a.data.length} vs ${b.data.length} bytes)`);
  }
  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) usage();

  const files = findChmFiles(args[0]);
  if (files.length === 0) {
    console.log("no .chm files found");
    return;
  }

  const dumpers = await buildDumpers();
  console.log(`comparing ${files.length} chm file${files.length === 1 ? "" : "s"}`);

  let passed = 0;
  let failed = 0;
  for (const file of files) {
    try {
      const [ours, chmlib] = await Promise.all([
        readDump(dumpers.ours, file),
        readDump(dumpers.chmlib, file),
      ]);
      const errors = compareEntries(ours.entries, chmlib.entries);
      if (errors.length === 0) {
        console.log(`OK ${file} (${ours.entries.length} entries)`);
        passed++;
      } else {
        console.error(`FAIL ${file}`);
        for (const error of errors.slice(0, 25)) console.error(`  ${error}`);
        if (errors.length > 25) console.error(`  ... ${errors.length - 25} more`);
        failed++;
      }
    } catch (e) {
      console.error(`FAIL ${file}`);
      console.error(`  ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

await main();
