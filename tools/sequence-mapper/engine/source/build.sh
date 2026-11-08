#!/bin/bash
# Rebuilds engine/mm2.wasm. Usage: build.sh <zig> <minimap2-2.31 dir> <simde-0.8.2 dir> <output.wasm>
set -e
Z=$1; M=$(realpath "$2"); I=$(realpath "$3"); O=$(realpath -m "$4"); H=$(cd "$(dirname "$0")" && pwd)
cd "$M"
SRC="kalloc.c misc.c bseq.c sketch.c sdust.c options.c index.c lchain.c align.c hit.c map.c format.c pe.c seed.c esterr.c splitidx.c jump.c ksw2_extz2_sse.c ksw2_extd2_sse.c ksw2_exts2_sse.c ksw2_ll_sse.c $H/kthread_stub.c $H/wrapper.c"
"$Z" cc -O2 -target wasm32-wasi -mexec-model=reactor -msimd128 -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_GETPID -Dru_maxrss=ru_utime.tv_sec -DHAVE_KALLOC -DUSE_SIMDE -DSIMDE_ENABLE_NATIVE_ALIASES -D__SSE2__ -DSIMDE_FLOAT16_API=1 -I. -I"$H/compat" -I"$I" $SRC -Wl,--export=mp_in -Wl,--export=mp_out -Wl,--export=mp_ref -Wl,--export=mp_map -Wl,--export=malloc -Wl,-z,stack-size=4194304 -Wl,--initial-memory=33554432 -Wl,--max-memory=1073741824 -o "$O"
