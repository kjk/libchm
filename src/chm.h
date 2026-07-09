/* chm.h -- plain-C CHM archive reader (in the style of djvudec / jbig2dec).
 *
 * Read-only access to .chm (and ITSS) archives. The caller supplies the
 * entire file up-front as an in-memory buffer that must outlive the chm.
 *
 * Simplified / cleaned API compared to original chm_lib.h while staying
 * compatible enough for existing callers (e.g. SumatraPDF).
 */

#ifndef CHM_H
#define CHM_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ----- allocator + diagnostics (djvudec / jbig2dec style) ----- */

/* ctx identifies the chm_ctx the allocation belongs to. NULL only for
   bootstrap allocation/free of the chm_ctx struct itself. */
typedef void *(*chm_alloc_cb)(void *user, void *ctx, size_t size);
typedef void  (*chm_free_cb)(void *user, void *ctx, void *ptr);

/* msg is a NUL-terminated, already-formatted message. */
typedef void (*chm_error_cb)(void *user, int severity, const char *msg);

typedef struct chm_ctx chm_ctx;
typedef struct chmFile chmFile;  /* opaque handle for an open archive */

/* Pass NULL for alloc/free to use the default malloc/free.
   Pass NULL for error to silently ignore diagnostics. */
chm_ctx *chm_ctx_new(chm_alloc_cb alloc, chm_free_cb free_cb,
                     chm_error_cb error, void *user);
void chm_ctx_free(chm_ctx *ctx);

/* ----- archives ----- */

/* Open an archive over an in-memory buffer (NOT copied; must remain valid
   until chm_close). Returns NULL on failure (diagnostics via error cb if set).
   This is the only open entrypoint (in-memory only, like djvudec). */
chmFile *chm_open(chm_ctx *ctx, const uint8_t *data, size_t len);
void chm_close(chmFile *h);

/* methods for setting tuning parameters for particular file */
#define CHM_PARAM_MAX_BLOCKS_CACHED 0
void chm_set_param(chmFile *h, int paramType, int paramVal);

/* ----- units (files/directories inside the archive) ----- */

#define CHM_MAX_PATHLEN (512)

struct chmUnitInfo {
    uint64_t start;
    uint64_t length;
    int space;
    int flags;
    char path[CHM_MAX_PATHLEN + 1];
};

/* the two available spaces in a CHM file (only these two are used in practice) */
#define CHM_UNCOMPRESSED (0)
#define CHM_COMPRESSED (1)

/* resolve a particular object from the archive */
#define CHM_RESOLVE_SUCCESS (0)
#define CHM_RESOLVE_FAILURE (1)
int chm_resolve_object(chmFile *h, const char *objPath, struct chmUnitInfo *ui);

/* retrieve part of an object from the archive */
int64_t chm_retrieve_object(chmFile *h, struct chmUnitInfo *ui, uint8_t *buf,
                             uint64_t addr, int64_t len);

/* enumerate the objects in the .chm archive */
typedef int (*CHM_ENUMERATOR)(chmFile *h, struct chmUnitInfo *ui, void *context);

#define CHM_ENUMERATE_NORMAL (1)
#define CHM_ENUMERATE_META   (2)
#define CHM_ENUMERATE_SPECIAL (4)
#define CHM_ENUMERATE_FILES  (8)
#define CHM_ENUMERATE_DIRS   (16)
#define CHM_ENUMERATE_ALL    (31)

#define CHM_ENUMERATOR_FAILURE (0)
#define CHM_ENUMERATOR_CONTINUE (1)
#define CHM_ENUMERATOR_SUCCESS (2)

int chm_enumerate(chmFile *h, int what, CHM_ENUMERATOR e, void *context);
int chm_enumerate_dir(chmFile *h, const char *prefix, int what,
                      CHM_ENUMERATOR e, void *context);

#ifdef __cplusplus
}
#endif

#endif /* CHM_H */
