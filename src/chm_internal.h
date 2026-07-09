/* chm_internal.h -- internal structures and helpers for the CHM reader.
 *
 * Single internal header included by chm.c and lzx.c.
 * All cross-module symbols and types are declared here.
 * Mirrors the style of djvudec's djvu_internal.h .
 */
#ifndef CHM_INTERNAL_H
#define CHM_INTERNAL_H

#include "chm.h"
#include <limits.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* concrete ctx (declared opaque in chm.h) -- defined after dependent structs below */

#ifndef CHM_RESTRICT
#if defined(_MSC_VER)
#define CHM_RESTRICT __restrict
#else
#define CHM_RESTRICT restrict
#endif
#endif

/* ===================================================================== */
/* LZX decompressor (from lzx.c, kept here so lzx.c and chm.c share)     */
/* ===================================================================== */

#define DECR_OK (0)
#define DECR_DATAFORMAT (1)
#define DECR_ILLEGALDATA (2)
#define DECR_NOMEMORY (3)

#define LZX_MIN_MATCH (2)
#define LZX_MAX_MATCH (257)
#define LZX_NUM_CHARS (256)
#define LZX_BLOCKTYPE_INVALID (0)
#define LZX_BLOCKTYPE_VERBATIM (1)
#define LZX_BLOCKTYPE_ALIGNED (2)
#define LZX_BLOCKTYPE_UNCOMPRESSED (3)
#define LZX_PRETREE_NUM_ELEMENTS (20)
#define LZX_ALIGNED_NUM_ELEMENTS (8)
#define LZX_NUM_PRIMARY_LENGTHS (7)
#define LZX_NUM_SECONDARY_LENGTHS (249)

#define LZX_PRETREE_MAXSYMBOLS (LZX_PRETREE_NUM_ELEMENTS)
#define LZX_PRETREE_TABLEBITS (6)
#define LZX_MAINTREE_MAXSYMBOLS (LZX_NUM_CHARS + 50 * 8)
#define LZX_MAINTREE_TABLEBITS (12)
#define LZX_LENGTH_MAXSYMBOLS (LZX_NUM_SECONDARY_LENGTHS + 1)
#define LZX_LENGTH_TABLEBITS (12)
#define LZX_ALIGNED_MAXSYMBOLS (LZX_ALIGNED_NUM_ELEMENTS)
#define LZX_ALIGNED_TABLEBITS (7)

#define LZX_LENTABLE_SAFETY (64)

#define LZX_DECLARE_TABLE(tbl) \
    uint16_t tbl##_table[(1 << LZX_##tbl##_TABLEBITS) + (LZX_##tbl##_MAXSYMBOLS << 1)]; \
    uint8_t tbl##_len[LZX_##tbl##_MAXSYMBOLS + LZX_LENTABLE_SAFETY]

struct LZXstate {
    uint8_t *window;
    uint32_t window_size;
    uint32_t actual_size;
    uint32_t window_posn;
    uint32_t R0, R1, R2;
    uint16_t main_elements;
    int header_read;
    uint16_t block_type;
    uint32_t block_length;
    uint32_t block_remaining;
    uint32_t frames_read;
    int32_t intel_filesize;
    int32_t intel_curpos;
    int intel_started;

    LZX_DECLARE_TABLE(PRETREE);
    LZX_DECLARE_TABLE(MAINTREE);
    LZX_DECLARE_TABLE(LENGTH);
    LZX_DECLARE_TABLE(ALIGNED);
};

/* LZX public (internal to us) */
struct LZXstate *LZXinit(int window);
void LZXteardown(struct LZXstate *pState);
int LZXreset(struct LZXstate *pState);
int LZXdecompress(struct LZXstate *pState, uint8_t *inpos, uint8_t *outpos, int inlen, int outlen);
int LZX_test_pretree_make_decode_table(void); /* test helper */

/* ===================================================================== */
/* CHM internal types and helpers                                        */
/* ===================================================================== */

/* tuning */
#ifndef CHM_MAX_BLOCKS_CACHED
#define CHM_MAX_BLOCKS_CACHED 5
#endif
#define CHM_MAX_DIR_PAGES 65536
#define CHM_DIR_SEEN_BITMAP_BITS CHM_MAX_DIR_PAGES
#define CHM_DIR_SEEN_BITMAP_WORDS (CHM_DIR_SEEN_BITMAP_BITS / 32)

#if defined(_WIN32)
#define strcasecmp _stricmp
#define strncasecmp _strnicmp
#endif

/* unmarshal helpers (internal) */
static inline int _unmarshal_char_array(uint8_t **pData, unsigned int *pLenRemain, char *dest, int count)
{
    if (count <= 0 || (unsigned int)count > *pLenRemain) return 0;
    memcpy(dest, *pData, (size_t)count);
    *pData += count;
    *pLenRemain -= (unsigned int)count;
    return 1;
}

static inline int _unmarshal_uchar_array(uint8_t **pData, unsigned int *pLenRemain, uint8_t *dest, int count)
{
    if (count <= 0 || (unsigned int)count > *pLenRemain) return 0;
    memcpy(dest, *pData, (size_t)count);
    *pData += count;
    *pLenRemain -= (unsigned int)count;
    return 1;
}

static inline int _unmarshal_int32(uint8_t **pData, unsigned int *pLenRemain, int32_t *dest)
{
    if (4 > *pLenRemain) return 0;
    *dest = (*pData)[0] | ((*pData)[1] << 8) | ((*pData)[2] << 16) | ((*pData)[3] << 24);
    *pData += 4;
    *pLenRemain -= 4;
    return 1;
}

static inline int _unmarshal_uint32(uint8_t **pData, unsigned int *pLenRemain, uint32_t *dest)
{
    if (4 > *pLenRemain) return 0;
    *dest = (*pData)[0] | ((*pData)[1] << 8) | ((*pData)[2] << 16) | ((*pData)[3] << 24);
    *pData += 4;
    *pLenRemain -= 4;
    return 1;
}

static inline int _unmarshal_int64(uint8_t **pData, unsigned int *pLenRemain, int64_t *dest)
{
    int64_t temp = 0;
    if (8 > *pLenRemain) return 0;
    for (int i = 8; i > 0; i--) {
        temp <<= 8;
        temp |= (*pData)[i - 1];
    }
    *dest = temp;
    *pData += 8;
    *pLenRemain -= 8;
    return 1;
}

static inline int _unmarshal_uint64(uint8_t **pData, unsigned int *pLenRemain, uint64_t *dest)
{
    uint64_t temp = 0;
    if (8 > *pLenRemain) return 0;
    for (int i = 8; i > 0; i--) {
        temp <<= 8;
        temp |= (*pData)[i - 1];
    }
    *dest = temp;
    *pData += 8;
    *pLenRemain -= 8;
    return 1;
}

static inline int _unmarshal_uuid(uint8_t **pData, unsigned int *pDataLen, uint8_t *dest)
{
    return _unmarshal_uchar_array(pData, pDataLen, dest, 16);
}

/* header structs (kept internal) */
#define _CHM_ITSF_V2_LEN (0x58)
#define _CHM_ITSF_V3_LEN (0x60)

struct chmItsfHeader {
    char signature[4];
    int32_t version;
    int32_t header_len;
    int32_t unknown_000c;
    uint32_t last_modified;
    uint32_t lang_id;
    uint8_t dir_uuid[16];
    uint8_t stream_uuid[16];
    uint64_t unknown_offset;
    uint64_t unknown_len;
    uint64_t dir_offset;
    uint64_t dir_len;
    uint64_t data_offset;
};

#define _CHM_ITSP_V1_LEN (0x54)

struct chmItspHeader {
    char signature[4];
    int32_t version;
    int32_t header_len;
    int32_t unknown_000c;
    uint32_t block_len;
    int32_t blockidx_intvl;
    int32_t index_depth;
    int32_t index_root;
    int32_t index_head;
    int32_t unknown_0024;
    uint32_t num_blocks;
    int32_t unknown_002c;
    uint32_t lang_id;
    uint8_t system_uuid[16];
    uint8_t unknown_0044[16];
};

static const char *_chm_pmgl_marker = "PMGL";
#define _CHM_PMGL_LEN (0x14)

struct chmPmglHeader {
    char signature[4];
    uint32_t free_space;
    uint32_t unknown_0008;
    int32_t block_prev;
    int32_t block_next;
};

static const char *_chm_pmgi_marker = "PMGI";
#define _CHM_PMGI_LEN (0x08)

struct chmPmgiHeader {
    char signature[4];
    uint32_t free_space;
};

#define _CHM_LZXC_RESETTABLE_V1_LEN (0x28)

struct chmLzxcResetTable {
    uint32_t version;
    uint32_t block_count;
    uint32_t unknown;
    uint32_t table_offset;
    uint64_t uncompressed_len;
    uint64_t compressed_len;
    uint64_t block_len;
};

#define _CHM_LZXC_MIN_LEN (0x18)
#define _CHM_LZXC_V2_LEN (0x1c)

struct chmLzxcControlData {
    uint32_t size;
    char signature[4];
    uint32_t version;
    uint32_t resetInterval;
    uint32_t windowSize;
    uint32_t windowsPerReset;
    uint32_t unknown_18;
};

/* archive state lives directly in chm_ctx (no separate chmFile) */

/* allocator wrappers (ctx may be null -> defaults) */
void *chm_alloc(chm_ctx *ctx, size_t size);
void  chm_free(chm_ctx *ctx, void *ptr);
void  chm_errorf(chm_ctx *ctx, int sev, const char *fmt, ...);

/* dir session (used within chm.c) */
struct chmDirSession {
    chm_ctx *ctx;
    uint8_t *page_buf;
    uint8_t *page_buf_end;
};

/* enumerate helpers (used within chm.c) */
struct chmEnumerateState {
    CHM_ENUMERATOR e;
    void *context;
    int type_bits;
    int filter_bits;
};

struct chmEnumerateDirState {
    CHM_ENUMERATOR e;
    void *context;
    int type_bits;
    int filter_bits;
    int it_has_begun;
    char prefixRectified[CHM_MAX_PATHLEN + 1];
    int prefixLen;
    char lastPath[CHM_MAX_PATHLEN + 1];
    int lastPathLen;
};

/* concrete ctx definition (after all structs it references) */
struct chm_ctx {
    chm_alloc_cb alloc;
    chm_free_cb  free;
    chm_error_cb error;
    void *user;

    /* archive state */
    const uint8_t *data;   /* borrowed */
    size_t data_len;

    uint64_t dir_offset;
    uint64_t dir_len;
    uint64_t data_offset;
    int32_t index_root;
    int32_t index_head;
    uint32_t block_len;

    uint64_t span;
    struct chmUnitInfo rt_unit;
    struct chmUnitInfo cn_unit;
    struct chmLzxcResetTable reset_table;

    /* LZX control */
    int compression_enabled;
    uint32_t window_size;
    uint32_t reset_interval;
    uint32_t reset_blkcount;

    struct LZXstate *lzx_state;
    int lzx_last_block;

    /* block cache */
    uint8_t **cache_blocks;
    uint64_t *cache_block_indices;
    int32_t cache_num_blocks;

    /* dir visit state */
    uint64_t dir_page_count;
    uint64_t dir_pages_seen;
    uint32_t dir_seen_bitmap[CHM_DIR_SEEN_BITMAP_WORDS];
};

#endif /* CHM_INTERNAL_H */
