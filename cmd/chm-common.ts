// chm-common.ts -- shared helpers for CHM command scripts.
import { $ } from "bun";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
} from "fs";
import { basename, join, resolve } from "path";
import { CHMLIB_DIR, getDeps } from "./get-deps";

export const ROOT = resolve(import.meta.dir, "..");

const OUT = join(ROOT, "out", "chm-tools");
const OUR_DUMP_C = join(OUT, "our-dump.c");
const CHMLIB_DUMP_C = join(OUT, "chmlib-dump.c");

const isWindows = process.platform === "win32";

function binName(base: string): string {
  return isWindows ? `${base}.exe` : base;
}

function needsRebuild(output: string, inputs: string[]): boolean {
  if (!existsSync(output)) return true;
  const outMtime = statSync(output).mtimeMs;
  for (const input of inputs) {
    if (!existsSync(input) || statSync(input).mtimeMs > outMtime) return true;
  }
  return false;
}

function writeFileIfChanged(path: string, data: string) {
  if (existsSync(path) && readFileSync(path, "utf8") === data) return;
  writeFileSync(path, data);
}

const OUR_DUMP_SOURCE = String.raw`
#include "chm.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int write_all(const void *p, size_t n)
{
    return fwrite(p, 1, n, stdout) == n;
}

static int write_u32(uint32_t v)
{
    unsigned char b[4];
    b[0] = (unsigned char)(v);
    b[1] = (unsigned char)(v >> 8);
    b[2] = (unsigned char)(v >> 16);
    b[3] = (unsigned char)(v >> 24);
    return write_all(b, sizeof(b));
}

static int write_u64(uint64_t v)
{
    unsigned char b[8];
    for (int i = 0; i < 8; i++) b[i] = (unsigned char)(v >> (i * 8));
    return write_all(b, sizeof(b));
}

static uint32_t entry_flags(const struct chm_entry *e)
{
    uint32_t flags = 0;
    if (e->is_compressed) flags |= 1u;
    if (e->is_dir) flags |= 2u;
    if (e->is_file) flags |= 4u;
    if (e->is_normal) flags |= 8u;
    if (e->is_meta) flags |= 16u;
    if (e->is_special) flags |= 32u;
    return flags;
}

static int g_emit_data = 1;

static int emit_entry(chm_ctx *ctx, struct chm_entry *e)
{
    const char *path = e->path ? e->path : "";
    size_t path_len = strlen(path);
    uint8_t *data = NULL;
    uint64_t data_len = g_emit_data ? e->length : 0;

    if (path_len > UINT32_MAX) return 0;
    if (data_len > SIZE_MAX) return 0;
    if (data_len > 0) {
        data = (uint8_t *)malloc((size_t)data_len);
        if (!data) return 0;
        int64_t n = chm_read_entry(ctx, e, data);
        if (n != (int64_t)data_len) {
            free(data);
            return 0;
        }
    }

    int ok = write_u32((uint32_t)path_len) &&
             write_u64(e->start) &&
             write_u64(e->length) &&
             write_u32(entry_flags(e)) &&
             write_u64(data_len) &&
             write_all(path, path_len) &&
             (data_len == 0 || write_all(data, (size_t)data_len));
    free(data);
    return ok;
}

int main(int argc, char **argv)
{
    const char *file_path = NULL;
    if (argc == 2) {
        file_path = argv[1];
    } else if (argc == 3 && strcmp(argv[1], "-list") == 0) {
        g_emit_data = 0;
        file_path = argv[2];
    } else {
        fprintf(stderr, "usage: our-dump [-list] file.chm\n");
        return 2;
    }

    FILE *f = fopen(file_path, "rb");
    if (!f) {
        perror("fopen");
        return 1;
    }
    if (fseek(f, 0, SEEK_END) != 0) {
        fclose(f);
        return 1;
    }
    long sz = ftell(f);
    if (sz <= 0) {
        fclose(f);
        fprintf(stderr, "empty file\n");
        return 1;
    }
    if (fseek(f, 0, SEEK_SET) != 0) {
        fclose(f);
        return 1;
    }

    uint8_t *file_data = (uint8_t *)malloc((size_t)sz);
    if (!file_data) {
        fclose(f);
        return 1;
    }
    if (fread(file_data, 1, (size_t)sz, f) != (size_t)sz) {
        perror("fread");
        free(file_data);
        fclose(f);
        return 1;
    }
    fclose(f);

    chm_ctx *ctx = chm_ctx_new(NULL, NULL, NULL, NULL);
    if (!ctx) {
        free(file_data);
        return 1;
    }
    if (!chm_open(ctx, file_data, (size_t)sz)) {
        fprintf(stderr, "chm_open failed\n");
        chm_ctx_free(ctx);
        free(file_data);
        return 1;
    }

    if (!write_all("CHMDUMP1\n", 9)) {
        chm_close(ctx);
        chm_ctx_free(ctx);
        free(file_data);
        return 1;
    }

    struct chm_entry **entries = NULL;
    int n = chm_get_entries(ctx, &entries);
    for (int i = 0; i < n; i++) {
        if (!emit_entry(ctx, entries[i])) {
            fprintf(stderr, "failed to emit %s\n", entries[i]->path ? entries[i]->path : "");
            chm_close(ctx);
            chm_ctx_free(ctx);
            free(file_data);
            return 1;
        }
    }

    chm_close(ctx);
    chm_ctx_free(ctx);
    free(file_data);
    return 0;
}
`;

const CHMLIB_DUMP_SOURCE = String.raw`
#include "chm_lib.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct emit_ctx {
    int failed;
};

static int write_all(const void *p, size_t n)
{
    return fwrite(p, 1, n, stdout) == n;
}

static int write_u32(uint32_t v)
{
    unsigned char b[4];
    b[0] = (unsigned char)(v);
    b[1] = (unsigned char)(v >> 8);
    b[2] = (unsigned char)(v >> 16);
    b[3] = (unsigned char)(v >> 24);
    return write_all(b, sizeof(b));
}

static int write_u64(uint64_t v)
{
    unsigned char b[8];
    for (int i = 0; i < 8; i++) b[i] = (unsigned char)(v >> (i * 8));
    return write_all(b, sizeof(b));
}

static uint32_t unit_flags(const struct chmUnitInfo *ui)
{
    uint32_t flags = 0;
    if (ui->space == CHM_COMPRESSED) flags |= 1u;
    if (ui->flags & CHM_ENUMERATE_DIRS) flags |= 2u;
    if (ui->flags & CHM_ENUMERATE_FILES) flags |= 4u;
    if (ui->flags & CHM_ENUMERATE_NORMAL) flags |= 8u;
    if (ui->flags & CHM_ENUMERATE_META) flags |= 16u;
    if (ui->flags & CHM_ENUMERATE_SPECIAL) flags |= 32u;
    return flags;
}

static int g_emit_data = 1;

static int emit_unit(struct chmFile *h, struct chmUnitInfo *ui)
{
    size_t path_len = strlen(ui->path);
    unsigned char *data = NULL;
    uint64_t data_len = g_emit_data ? (uint64_t)ui->length : 0;

    if (path_len > UINT32_MAX) return 0;
    if (data_len > SIZE_MAX) return 0;
    if (data_len > 0) {
        data = (unsigned char *)malloc((size_t)data_len);
        if (!data) return 0;
        LONGINT64 n = chm_retrieve_object(h, ui, data, 0, (LONGINT64)data_len);
        if (n != (LONGINT64)data_len) {
            free(data);
            return 0;
        }
    }

    int ok = write_u32((uint32_t)path_len) &&
             write_u64((uint64_t)ui->start) &&
             write_u64((uint64_t)ui->length) &&
             write_u32(unit_flags(ui)) &&
             write_u64(data_len) &&
             write_all(ui->path, path_len) &&
             (data_len == 0 || write_all(data, (size_t)data_len));
    free(data);
    return ok;
}

static int enum_cb(struct chmFile *h, struct chmUnitInfo *ui, void *context)
{
    struct emit_ctx *ctx = (struct emit_ctx *)context;
    if (!emit_unit(h, ui)) {
        ctx->failed = 1;
        fprintf(stderr, "failed to emit %s\n", ui->path);
        return CHM_ENUMERATOR_FAILURE;
    }
    return CHM_ENUMERATOR_CONTINUE;
}

int main(int argc, char **argv)
{
    const char *file_path = NULL;
    if (argc == 2) {
        file_path = argv[1];
    } else if (argc == 3 && strcmp(argv[1], "-list") == 0) {
        g_emit_data = 0;
        file_path = argv[2];
    } else {
        fprintf(stderr, "usage: chmlib-dump [-list] file.chm\n");
        return 2;
    }

    struct chmFile *h = chm_open(file_path);
    if (!h) {
        fprintf(stderr, "chm_open failed\n");
        return 1;
    }

    if (!write_all("CHMDUMP1\n", 9)) {
        chm_close(h);
        return 1;
    }

    struct emit_ctx ctx;
    ctx.failed = 0;
    int ok = chm_enumerate(h, CHM_ENUMERATE_ALL, enum_cb, &ctx);
    chm_close(h);
    return (ok && !ctx.failed) ? 0 : 1;
}
`;

export type DumperKind = "ours" | "chmlib";

export interface Dumpers {
  ours: string;
  chmlib: string;
}

export interface ChmDumpEntry {
  path: string;
  start: bigint;
  length: bigint;
  flags: number;
  data: Uint8Array;
}

export interface ChmDump {
  entries: ChmDumpEntry[];
  stderr: string;
}

export async function buildDumpers(): Promise<Dumpers> {
  await getDeps();
  mkdirSync(OUT, { recursive: true });
  writeFileIfChanged(OUR_DUMP_C, OUR_DUMP_SOURCE);
  writeFileIfChanged(CHMLIB_DUMP_C, CHMLIB_DUMP_SOURCE);

  const ours = join(OUT, binName("our-dump"));
  const chmlib = join(OUT, binName("chmlib-dump"));
  const ourInputs = [
    OUR_DUMP_C,
    join(ROOT, "src", "chm.h"),
    join(ROOT, "src", "chm_internal.h"),
    join(ROOT, "src", "chm.c"),
    join(ROOT, "src", "lzx.c"),
  ];
  const chmlibInputs = [
    CHMLIB_DUMP_C,
    join(CHMLIB_DIR, "src", "chm_lib.h"),
    join(CHMLIB_DIR, "src", "chm_lib.c"),
    join(CHMLIB_DIR, "src", "lzx.c"),
    join(CHMLIB_DIR, "src", "lzx.h"),
  ];

  if (needsRebuild(ours, ourInputs)) {
    await $`clang -O2 -Wall -Werror -I${join(ROOT, "src")} ${join(ROOT, "src", "lzx.c")} ${join(ROOT, "src", "chm.c")} ${OUR_DUMP_C} -o ${ours}`.cwd(ROOT);
  }
  if (needsRebuild(chmlib, chmlibInputs)) {
    await $`clang -O2 -Wno-macro-redefined -I${join(CHMLIB_DIR, "src")} ${join(CHMLIB_DIR, "src", "lzx.c")} ${join(CHMLIB_DIR, "src", "chm_lib.c")} ${CHMLIB_DUMP_C} -o ${chmlib}`.cwd(ROOT);
  }

  return { ours, chmlib };
}

export function findChmFiles(input: string): string[] {
  const p = resolve(input);
  if (!existsSync(p)) throw new Error(`not found: ${input}`);
  const st = statSync(p);
  if (st.isFile()) {
    if (!p.toLowerCase().endsWith(".chm")) throw new Error(`not a .chm file: ${input}`);
    return [p];
  }
  if (!st.isDirectory()) throw new Error(`not a file or directory: ${input}`);

  const files: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const child = join(dir, name);
      const childStat = statSync(child);
      if (childStat.isDirectory()) {
        walk(child);
      } else if (childStat.isFile() && child.toLowerCase().endsWith(".chm")) {
        files.push(child);
      }
    }
  }
  walk(p);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function readU32(view: DataView, off: number): number {
  return view.getUint32(off, true);
}

function readU64(view: DataView, off: number): bigint {
  return view.getBigUint64(off, true);
}

// Some malformed/malicious .chm files send a dumper into an infinite loop
// (upstream CHMLib has such DoS cases). Cap each run so the harness can treat
// a hang as a read failure instead of blocking forever.
const DUMP_TIMEOUT_MS = 30_000;

export async function readDump(exe: string, file: string, includeContent = true): Promise<ChmDump> {
  const args = includeContent ? [exe, file] : [exe, "-list", file];
  const proc = Bun.spawn(args, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill(9);
  }, DUMP_TIMEOUT_MS);

  const [stdoutBuf, stderrText] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  const stderr = stderrText;
  if (timedOut) {
    throw new Error(`${basename(exe)} timed out for ${file} after ${DUMP_TIMEOUT_MS}ms`);
  }
  if (exitCode !== 0) {
    throw new Error(`${basename(exe)} failed for ${file}${stderr ? `: ${stderr.trim()}` : ""}`);
  }

  const bytes = new Uint8Array(stdoutBuf);
  const magic = new TextDecoder().decode(bytes.subarray(0, 9));
  if (magic !== "CHMDUMP1\n") throw new Error(`${basename(exe)} produced invalid dump`);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const entries: ChmDumpEntry[] = [];
  let off = 9;
  while (off < bytes.length) {
    if (off + 32 > bytes.length) throw new Error(`${basename(exe)} produced truncated entry header`);
    const pathLen = readU32(view, off); off += 4;
    const start = readU64(view, off); off += 8;
    const length = readU64(view, off); off += 8;
    const flags = readU32(view, off); off += 4;
    const dataLenBig = readU64(view, off); off += 8;
    if (dataLenBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("entry too large to parse");
    const dataLen = Number(dataLenBig);
    if (off + pathLen + dataLen > bytes.length) throw new Error(`${basename(exe)} produced truncated entry data`);
    const path = dec.decode(bytes.subarray(off, off + pathLen));
    off += pathLen;
    const data = bytes.slice(off, off + dataLen);
    off += dataLen;
    entries.push({ path, start, length, flags, data });
  }
  return { entries, stderr };
}

export function flagsText(flags: number): string {
  const space = (flags & 1) ? "compressed" : "plain";
  const kind = (flags & 2) ? "dir" : ((flags & 4) ? "file" : "object");
  const cls = (flags & 8) ? "normal" : ((flags & 16) ? "meta" : ((flags & 32) ? "special" : "unknown"));
  return `${space} ${cls} ${kind}`;
}
