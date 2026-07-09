// build-dist.ts -- produce amalgamated dist/chm.h + dist/chm.c (sqlite style).
//
//   bun cmd/build-dist.ts
//
// dist/chm.h : copy of src/chm.h
// dist/chm.c : src/chm.h + src/chm_internal.h + src/lzx.c + src/chm.c (with local includes stripped)
import { $ } from "bun";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join } from "path";

const ROOT = `${import.meta.dir}/..`.replaceAll("\\", "/");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

export const DIST_H = join(DIST, "chm.h");
export const DIST_C = join(DIST, "chm.c");

const MODULES = ["lzx.c", "chm.c"];

function stripLocalIncludes(text: string): string {
  // remove #include "chm.h" and #include "chm_internal.h" and old "lzx.h"
  return text.replace(/^[ \t]*#[ \t]*include[ \t]+"(?:chm\.h|chm_internal\.h|lzx\.h)"[ \t]*\r?\n/gm, "");
}

function stripCComments(code: string): string {
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const next = i + 1 < n ? code[i + 1] : "";
    if (c === '"') {
      out += c; i++;
      while (i < n) {
        if (code[i] === "\\" && i + 1 < n) { out += code[i] + code[i + 1]; i += 2; }
        else if (code[i] === '"') { out += code[i]; i++; break; }
        else { out += code[i]; i++; }
      }
    } else if (c === "'" ) {
      out += c; i++;
      while (i < n) {
        if (code[i] === "\\" && i + 1 < n) { out += code[i] + code[i + 1]; i += 2; }
        else if (code[i] === "'") { out += code[i]; i++; break; }
        else { out += code[i]; i++; }
      }
    } else if (c === "/" && next === "/") {
      i += 2;
      while (i < n && code[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i + 1 < n && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
    } else {
      out += c; i++;
    }
  }
  return out;
}

function stripTrailingWS(s: string): string {
  return s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
}

export function distInputPaths(): string[] {
  return [
    join(SRC, "chm.h"),
    join(SRC, "chm_internal.h"),
    ...MODULES.map(m => join(SRC, m)),
  ];
}

export function distOutdated(): boolean {
  if (!existsSync(DIST_H) || !existsSync(DIST_C)) return true;
  const outM = Math.min(statSync(DIST_H).mtimeMs, statSync(DIST_C).mtimeMs);
  for (const p of distInputPaths()) {
    if (!existsSync(p) || statSync(p).mtimeMs > outM) return true;
  }
  return false;
}

export async function ensureDist() {
  if (!distOutdated()) return;
  await buildDist();
}

export async function buildDist() {
  mkdirSync(DIST, { recursive: true });

  const pub = readFileSync(join(SRC, "chm.h"), "utf8");

  let body = "";
  for (const m of MODULES) {
    let txt = readFileSync(join(SRC, m), "utf8");
    txt = stripLocalIncludes(txt);
    body += "\n" + txt;
  }

  // prepend internal after pub in the amalgam (internal not public)
  let intH = readFileSync(join(SRC, "chm_internal.h"), "utf8");
  intH = stripLocalIncludes(intH);

  let amalgam = pub + "\n" + intH + "\n" + body;
  amalgam = stripCComments(amalgam);
  amalgam = stripTrailingWS(amalgam);

  writeFileSync(DIST_H, pub);
  writeFileSync(DIST_C, amalgam);

  // verify compiles
  const tmp = join(DIST, "chk.c");
  writeFileSync(tmp, `#include "chm.c"\n`);
  await $`clang -fsyntax-only -I ${DIST} ${tmp}`.quiet();
  console.log("dist/ updated and verified");
}

if (import.meta.main) {
  await buildDist();
}
