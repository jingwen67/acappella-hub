import {createHash} from 'node:crypto';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const isPdf=file=>file.mimeType==='application/pdf';
export function createPdfs(google,storage){
 const preference=id=>`private/pdf-defaults/${id}.json`;
 async function info(folderId,files){
  files=(files||await google.listFolderFiles(folderId)).filter(isPdf);
  const saved=await storage.get(preference(folderId));const chosen=saved?(await saved.json()).fileId:'';
  const latest=[...files].sort((a,b)=>String(b.modifiedTime||'').localeCompare(String(a.modifiedTime||''))||a.name.localeCompare(b.name)||a.id.localeCompare(b.id))[0];
  const selected=files.find(f=>f.id===chosen)||latest;
  return {files,defaultPdfId:selected?.id||'',selection:files.length===1?'single':files.some(f=>f.id===chosen)?'starred':'latest'};
 }
 async function star(folderId,fileId,actorId){const data=await info(folderId);if(!data.files.some(f=>f.id===fileId))throw fail(404,'pdf_not_found');await storage.put(preference(folderId),JSON.stringify({fileId,actorId,updatedAt:new Date().toISOString()}));return {...data,defaultPdfId:fileId,selection:data.files.length===1?'single':'starred'};}
 async function content(folderId,fileId){
  const data=await info(folderId);const file=data.files.find(f=>f.id===(fileId||data.defaultPdfId));if(!file)throw fail(404,'pdf_missing');
  const cache=`private/pdf-cache/${folderId}/${file.id}`;const stamp=createHash('sha256').update((file.targetId||file.id)+'|'+(file.modifiedTime||'')).digest('hex');
  const saved=await storage.get(cache+'.json');const previous=saved?await saved.json():null;
  if(previous?.stamp!==stamp){const bytes=await google.downloadPdf(file.targetId||file.id);await storage.put(cache+'.pdf',bytes);await storage.put(cache+'.json',JSON.stringify({stamp}));}
  return {url:await storage.pdfPlaybackUrl(cache+'.pdf',3600),name:file.name,fileId:file.id,expiresIn:3600};
 }
 return {info,star,content};
}
