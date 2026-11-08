/* Single-thread replacement for kthread.c: GitHub Pages has no COOP/COEP, so no wasm threads. */
#include <stdlib.h>
#include <stdint.h>
void kt_for(int n_threads,void (*func)(void*,long,int),void *data,long n){long i;(void)n_threads;for(i=0;i<n;++i)func(data,i,0);}
void kt_pipeline(int n_threads,void *(*func)(void*,int,void*),void *shared_data,int n_steps){(void)n_threads;(void)func;(void)shared_data;(void)n_steps;abort();}
#include <string.h>
#include <sys/resource.h>
int getrusage(int who,struct rusage *r){(void)who;memset(r,0,sizeof *r);return 0;}
