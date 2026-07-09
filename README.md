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
chmFile *chm = chm_open(NULL, data, len);   /* data must outlive chm */
struct chm_entry entry;
if (chm_resolve_object(chm, "/foo/bar.html", &ui) == CHM_RESOLVE_SUCCESS) {
    uint8_t *buf = ...;
    chm_retrieve_object(chm, &ui, buf, 0, ui.length);
}
chm_enumerate(chm, CHM_ENUMERATE_FILES | CHM_ENUMERATE_NORMAL, my_enum, ctx);
chm_close(chm);
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
