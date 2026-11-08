/* Stub: file IO is unused; sequences are passed from JS memory. */
#ifndef STUB_ZLIB_H
#define STUB_ZLIB_H
#include <stddef.h>
typedef void *gzFile;
static inline gzFile gzopen(const char*p,const char*m){(void)p;(void)m;return 0;}
static inline gzFile gzdopen(int f,const char*m){(void)f;(void)m;return 0;}
static inline int gzread(gzFile f,void*b,unsigned n){(void)f;(void)b;(void)n;return 0;}
static inline int gzclose(gzFile f){(void)f;return 0;}
static inline int gzrewind(gzFile f){(void)f;return 0;}
#endif
