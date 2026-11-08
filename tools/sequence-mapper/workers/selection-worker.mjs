// SPDX-License-Identifier: GPL-2.0-or-later
import {analyzeSelection} from '../core/selection.mjs';
self.onmessage=({data:d})=>{try{self.postMessage({id:d.id,result:analyzeSelection(d.sequence,d.conditions)});}catch(e){self.postMessage({id:d.id,error:e.message||String(e)});}};
