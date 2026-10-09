export const VOICE_PARTS=['soprano','alto','tenor','baritone','bass','bbox','rap'];
export function readVoiceParts(value){
 let values=value;
 if(!Array.isArray(values)){try{values=JSON.parse(value);}catch{values=String(value||'').toLowerCase().split(/[,，/、;\s]+/);}}
 if(values&&typeof values==='object'&&!Array.isArray(values))values=[values.primary,...(Array.isArray(values.secondary)?values.secondary:[])];
 if(!Array.isArray(values))values=[];
 const aliases={s:'soprano',a:'alto',t:'tenor',b:'bass',beatbox:'bbox',bari:'baritone'};
 const selected=new Set(values.map(v=>aliases[String(v).toLowerCase()]||String(v).toLowerCase()));
 return VOICE_PARTS.filter(v=>selected.has(v));
}
export function validateVoiceParts(values){
 if(!Array.isArray(values)||values.some(v=>!VOICE_PARTS.includes(v)))throw Object.assign(new Error('voice_parts_invalid'),{status:400});
 return VOICE_PARTS.filter(v=>values.includes(v));
}

export function readVoiceSettings(value){let parsed=value;try{if(typeof value==='string')parsed=JSON.parse(value);}catch{}const parts=readVoiceParts(value);const primary=parsed&&!Array.isArray(parsed)&&VOICE_PARTS.includes(parsed.primary)?parsed.primary:parts[0]||'';return {primary,secondary:parts.filter(p=>p!==primary)};}
export function voiceSettingsFromBody(body,current){if(body.primaryVoicePart!==undefined){const primary=body.primaryVoicePart;if(primary!==''&&!VOICE_PARTS.includes(primary))throw Object.assign(new Error('voice_parts_invalid'),{status:400});const secondary=validateVoiceParts(body.secondaryVoiceParts||[]).filter(p=>p!==primary);if(!primary&&secondary.length)throw Object.assign(new Error('voice_parts_invalid'),{status:400});return {primary,secondary};}const parts=body.voiceParts===undefined?readVoiceParts(body.voicePart):validateVoiceParts(body.voiceParts);const previous=readVoiceSettings(current).primary;const primary=parts.includes(previous)?previous:parts[0]||'';return {primary,secondary:parts.filter(p=>p!==primary)};}
