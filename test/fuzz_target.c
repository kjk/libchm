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
    struct chm_entry ui;
    chm_resolve_object(ctx, "/", &ui);
    chm_resolve_object(ctx, "/#SYSTEM", &ui);

    /* retrieve full object (partial reads no longer supported) */
    if (ui.length > 0 && ui.length <= (1 << 20)) {
        uint8_t *tmp = malloc(ui.length);
        if (tmp) {
            chm_retrieve_object(ctx, &ui, tmp);
            free(tmp);
        }
    }

    /* get all units */
    struct chm_entry **units = NULL;
    int n = chm_get_entries(ctx, &units);
    (void)n;

    chm_close(ctx);
    chm_ctx_free(ctx);
    return 0;
}
