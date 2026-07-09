/* fuzz_target.c -- libFuzzer target for chm decoder. */
#include "chm.h"
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    if (size < 8) return 0;
    chmFile *h = chm_open(NULL, data, size);
    if (!h) return 0;

    /* drive common surface */
    struct chmUnitInfo ui;
    chm_resolve_object(h, "/", &ui);
    chm_resolve_object(h, "/#SYSTEM", &ui);

    uint8_t buf[256];
    chm_retrieve_object(h, &ui, buf, 0, sizeof(buf));

    /* enumerate a little */
    /* to avoid long runs, we don't full walk here; just open/close stresses parse */
    chm_close(h);
    return 0;
}
