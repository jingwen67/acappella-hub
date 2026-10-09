import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const entry=fs.readFileSync('public/index.html','utf8').replace(/const hubUiVersion='[^']*';/,"const hubUiVersion='__HUB_UI_VERSION__';");
const uiVersion=createHash('sha256').update(entry).digest('hex').slice(0,16);
fs.writeFileSync('public/index.html',entry.replace('__HUB_UI_VERSION__',uiVersion));
import {build} from 'esbuild';
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
const assets={};
for(const name of fs.readdirSync('public')){const file=path.join('public',name);if(fs.statSync(file).isFile())assets[name==='index.html'?'/':'/'+name]={type:types[path.extname(name)]||'application/octet-stream',data:fs.readFileSync(file).toString('base64')};}
for(const [name,file] of [['pdfjs.mjs','build/pdf.mjs'],['pdfjs-worker.mjs','build/pdf.worker.mjs']]){fs.copyFileSync('node_modules/pdfjs-dist/'+file,'public/'+name);assets['/'+name]={type:types['.mjs'],data:fs.readFileSync('node_modules/pdfjs-dist/'+file).toString('base64')};}
for(const dir of ['standard_fonts','cmaps']){fs.mkdirSync('public/pdfjs/'+dir,{recursive:true});fs.cpSync('node_modules/pdfjs-dist/'+dir,'public/pdfjs/'+dir,{recursive:true});}
for(const dir of ['standard_fonts','cmaps'])for(const name of fs.readdirSync('node_modules/pdfjs-dist/'+dir))assets['/pdfjs/'+dir+'/'+name]={type:'application/octet-stream',data:fs.readFileSync('node_modules/pdfjs-dist/'+dir+'/'+name).toString('base64')};
assets['/favicon.ico']=assets['/icon-192.png'];
fs.writeFileSync('worker/assets.js','export const assets = '+JSON.stringify(assets)+';\n');
await build({entryPoints:['worker/index.js'],outfile:'dist/vercel-worker.mjs',bundle:true,format:'esm',platform:'node',target:'node22',external:['node:*'],define:{__HUB_UI_VERSION__:JSON.stringify(uiVersion)}});
console.log('Vercel runtime built; Sites is unchanged.');
