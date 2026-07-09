/* chm_test.c -- simple CLI test harness for libchm (djvudec style). */

#include "chm.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int list_entry(chmFile *h, struct chmUnitInfo *ui, void *ctx)
{
    (void)h;
    (void)ctx;
    const char *type = (ui->flags & 2) ? "dir" : "file";
    printf("  %s %s (len=%llu space=%d)\n", type, ui->path, (unsigned long long)ui->length, ui->space);
    return CHM_ENUMERATOR_CONTINUE;
}

int main(int argc, char **argv)
{
    if (argc < 2) {
        fprintf(stderr, "usage: chm_test [-list] file.chm\n");
        return 1;
    }
    int do_list = 0;
    const char *path = NULL;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-list") == 0) do_list = 1;
        else if (!path) path = argv[i];
    }
    if (!path) {
        fprintf(stderr, "no chm file\n");
        return 1;
    }

    FILE *f = fopen(path, "rb");
    if (!f) {
        perror("fopen");
        return 1;
    }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz <= 0) {
        fclose(f);
        fprintf(stderr, "empty file\n");
        return 1;
    }
    uint8_t *data = (uint8_t *)malloc((size_t)sz);
    if (!data) {
        fclose(f);
        return 1;
    }
    if (fread(data, 1, (size_t)sz, f) != (size_t)sz) {
        perror("fread");
        free(data);
        fclose(f);
        return 1;
    }
    fclose(f);

    chmFile *h = chm_open(NULL, data, (size_t)sz);
    if (!h) {
        fprintf(stderr, "chm_open failed for %s\n", path);
        free(data);
        return 1;
    }
    printf("opened %s (%ld bytes)\n", path, sz);

    if (do_list) {
        printf("entries:\n");
        chm_enumerate(h, CHM_ENUMERATE_ALL, list_entry, NULL);
    }

    chm_close(h);
    free(data);
    printf("OK\n");
    return 0;
}
