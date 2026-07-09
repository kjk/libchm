# libchm — a plain-C CHM reader

This is a CHM / ITSS archive reader, ported and cleaned from CHMLib, in the style of [djvudec](https://github.com/kjk/djvudec).

* plain C, no dependencies
* simpler / cleaned API
* easy to integrate: copy `dist/chm.h` and `dist/chm.c`
* in-memory only (no incremental I/O)
* fuzzing + amalgamation + wasm support

## API

See `src/chm.h`. Basic usage:

```c
chm_ctx *ctx = chm_open(NULL, data, len);   /* data must outlive ctx */
struct chm_entry **entries = NULL;
int n = chm_get_entries(ctx, &entries);
for (int i = 0; i < n; i++) {
    if (strcmp(entries[i]->path, "/foo/bar.html") == 0) {
        uint8_t *buf = malloc(entries[i]->length);
        if (buf) {
            chm_read_entry(ctx, entries[i], buf);
            free(buf);
        }
        break;
    }
}
chm_close(ctx);
```

## Build & test

Requires `clang` and `bun`.

```
bun cmd/build.ts          # builds out/clang/chm_test
bun cmd/tests.ts          # smoke tests over testfiles/chm
bun cmd/build-dist.ts     # updates dist/chm.{h,c}
bun cmd/fuzz.ts           # libFuzzer (seeded from testfiles/chm)
```

CLI:
```
chm_test -list file.chm
```

## How it was made

Port of CHMLib (from SumatraPDF's ext/CHMLib) done with Grok Build, cleaned to djvudec coding conventions, with ctx/alloc, amalgam, fuzz, wasm.

## License

See LICENSE.md (LGPL-ish origin from CHMLib, adapted).
