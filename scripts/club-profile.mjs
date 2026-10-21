import fs from 'node:fs';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
// Only public presentation is changed here. Credentials and business data are never copied.
function png(size){
 const crc=buffer=>{let n=0xffffffff;for(const byte of buffer){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),check=Buffer.alloc(4);length.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([length,type,data,check]);};
 const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*(size*4+1)+1+x*4,u=x/size,v=y/size;const ink=(u>.28&&u<.39&&v>.25&&v<.75)||(u>.61&&u<.72&&v>.25&&v<.75)||(u>.28&&u<.72&&v>.45&&v<.55);raw.set(ink?[36,28,22,255]:[243,236,223,255],i);}
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const htmlEscape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const jsEscape=value=>JSON.stringify(String(value)).slice(1,-1).replaceAll("'",'\\u0027').replaceAll('<','\\u003c').replaceAll('>','\\u003e');
export function applyClubProfile({root=process.cwd(),profile=process.env.HUB_PROFILE,origin=process.env.PUBLIC_ORIGIN||''}={}){
 if(!profile||profile==='cucac')return;
 if(!/^[a-z0-9-]+$/.test(profile))throw Error('Invalid HUB_PROFILE');
 try{const url=new URL(origin);if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash)throw Error();}catch{throw Error('Set PUBLIC_ORIGIN to the new club HTTPS origin before building');}
 const config=JSON.parse(fs.readFileSync(path.join(root,'clubs',profile+'.json'),'utf8'));
 for(const key of ['nameZh','nameEn','shortName'])if(typeof config[key]!=='string'||!config[key].trim()||config[key].length>80)throw Error('Invalid public club profile');
 const substitutions=[['https://cucac-hub.vercel.app',origin.replace(/\/$/,'')||'/'],['https://acappella-hub.elenazhang0607.chatgpt.site',origin.replace(/\/$/,'')||'/'],['哥大中文阿卡贝拉',config.nameZh],['CU Chinese A Cappella',config.nameEn],['CUCAC',config.shortName]];
 const replace=(text,escape)=>substitutions.reduce((value,[from,to])=>value.replaceAll(from,escape(to)),text);
 const publicDir=path.join(root,'public');
 // Render from a fresh Git checkout for each deployment. Never reuse a branded build as source.
 for(const name of fs.readdirSync(publicDir)){const file=path.join(publicDir,name);if(!fs.statSync(file).isFile()||!/[.](html|mjs|js)$/.test(name))continue;let content=fs.readFileSync(file,'utf8');if(name.endsWith('.html')){const parts=content.split(/(<script\b[^>]*>[\s\S]*?<\/script>)/gi);content=parts.map(part=>/^<script\b/i.test(part)?replace(part,jsEscape):replace(part,htmlEscape)).join('');}else content=replace(content,jsEscape);fs.writeFileSync(file,content);}
 const manifestPath=path.join(publicDir,'manifest.webmanifest'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.name=config.shortName;manifest.short_name=config.shortName;manifest.description=config.nameEn+' · Members, scores and voting';fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 fs.writeFileSync(path.join(publicDir,'icon-192.png'),png(192));fs.writeFileSync(path.join(publicDir,'icon-512.png'),png(512));
 fs.writeFileSync(path.join(publicDir,'club-profile.json'),JSON.stringify({id:profile,...config},null,2)+'\n');
 if(config.emptyWorkshop){const workshop=path.join(publicDir,'workshop');fs.rmSync(workshop,{recursive:true,force:true});fs.mkdirSync(workshop,{recursive:true});fs.writeFileSync(path.join(workshop,'index.html'),'<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+htmlEscape(config.shortName)+' · Workshop</title><style>body{margin:60px auto;padding:24px;max-width:700px;font:17px system-ui;background:#f3ecdf;color:#241c16}a{color:inherit}p{line-height:1.7}</style><a href="/">返回 Hub / Back to Hub</a><h1>编曲 Workshop / Arranging Workshop</h1><p>暂无资料，请联系 MD。<br>No materials yet. Please contact your MD.</p></html>');}
}
