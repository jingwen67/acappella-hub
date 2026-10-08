export const VOICE_PARTS=['soprano','alto','tenor','baritone','bass','bbox','rap'];
export function readVoiceParts(value){
 let values=value;
 if(!Array.isArray(values)){try{values=JSON.parse(value);}catch{values=String(value||'').toLowerCase().split(/[,，/、;\s]+/);}}
 if(!Array.isArray(values))values=[];
 const aliases={s:'soprano',a:'alto',t:'tenor',b:'bass',beatbox:'bbox',bari:'baritone'};
 const selected=new Set(values.map(v=>aliases[String(v).toLowerCase()]||String(v).toLowerCase()));
 return VOICE_PARTS.filter(v=>selected.has(v));
}
export function validateVoiceParts(values){
 if(!Array.isArray(values)||values.some(v=>!VOICE_PARTS.includes(v)))throw Object.assign(new Error('voice_parts_invalid'),{status:400});
 return VOICE_PARTS.filter(v=>values.includes(v));
}
