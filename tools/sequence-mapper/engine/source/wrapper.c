/* MIT, same as minimap2. Minimal in-memory API for one reference and many queries. */
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "minimap.h"
static mm_idx_t *mi;static mm_idxopt_t io;static mm_mapopt_t mo;static mm_tbuf_t *tb;
static char *inbuf;static int incap;static int32_t *out;static int outcap;
char *mp_in(int n){if(n>incap){free(inbuf);inbuf=malloc(n+1);incap=n;}return inbuf;}
int32_t *mp_out(void){return out;}
/* seq in mp_in buffer; negative override = keep preset. */
int mp_ref(int len,const char *preset,int k,int w,int min_cnt,int min_chain,int min_dp,int bw){
 const char *seqs[1],*names[1]={"ref"};mm_verbose=0;
 if(mi){mm_idx_destroy(mi);mi=0;}if(tb){mm_tbuf_destroy(tb);tb=0;}
 mm_set_opt(0,&io,&mo);if(preset&&*preset&&mm_set_opt(preset,&io,&mo)<0)return -1;
 if(k>0)io.k=k;if(w>0)io.w=w;
 if(min_cnt>0)mo.min_cnt=min_cnt;if(min_chain>0)mo.min_chain_score=min_chain;if(min_dp>0)mo.min_dp_max=min_dp;if(bw>0)mo.bw=bw;
 mo.flag|=MM_F_CIGAR|MM_F_EQX;mo.flag|=MM_F_NO_LJOIN*0;
 inbuf[len]=0;seqs[0]=inbuf;
 mi=mm_idx_str(io.w,io.k,io.flag&MM_I_HPC,io.bucket_bits,1,seqs,names);if(!mi)return -2;
 mm_mapopt_update(&mo,mi);tb=mm_tbuf_init();return 0;
}
/* out: [n, then per hit: rev,rs,re,qs,qe,mapq,flags(parent==id|sam_pri<<1),mlen,blen,ncig,cig...] */
int mp_map(int len){
 int n=0,i,j,p=1;inbuf[len]=0;mm_reg1_t *r=mm_map(mi,len,inbuf,&n,tb,&mo,0);
 int need=1;for(i=0;i<n;i++)need+=10+(r[i].p?r[i].p->n_cigar:0);
 if(need>outcap){free(out);out=malloc(sizeof(int32_t)*need*2);outcap=need*2;}
 out[0]=n;
 for(i=0;i<n;i++){mm_reg1_t *x=&r[i];out[p++]=x->rev;out[p++]=x->rs;out[p++]=x->re;out[p++]=x->qs;out[p++]=x->qe;out[p++]=x->mapq;out[p++]=(x->id==x->parent)|(x->sam_pri<<1);out[p++]=x->mlen;out[p++]=x->blen;
  int c=x->p?x->p->n_cigar:0;out[p++]=c;for(j=0;j<c;j++)out[p++]=x->p->cigar[j];free(x->p);}
 free(r);return n;
}
