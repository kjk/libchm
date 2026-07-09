/* fuzz_target.c -- libFuzzer target for chm decoder. */
#include "chm.h"
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size)
{
    if (size < 8) return 0;
    chm_ctx *ctx = chm_ctx_new(NULL, NULL, NULL, NULL);
    if (!ctx) return 0;
    if (!chm_open(ctx, data, size)) {
        chm_ctx_free(ctx);
        return 0;
    }

    /* drive common surface */
    struct chmUnitInfo ui;
    chm_resolve_object(ctx, "/", &ui);
    chm_resolve_object(ctx, "/#SYSTEM", &ui);

    uint8_t buf[256];
    chm_retrieve_object(ctx, &ui, buf, 0, sizeof(buf));

    /* enumerate a little */
    chm_close(ctx);
    chm_ctx_free(ctx);
    return 0;
}
