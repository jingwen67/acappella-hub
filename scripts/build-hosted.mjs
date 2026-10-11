import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const types={'.html':'text/html; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.pdf':'application/pdf','.mscz':'application/octet-stream','.webmanifest':'application/manifest+json'};
const assets={};
function addAssets(dir,prefix=''){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),key=prefix+name;if(fs.statSync(file).isDirectory())addAssets(file,key+'/');else assets[key==='index.html'?'/':'/'+key]={type:types[path.extname(name)]||'application/octet-stream',data:fs.readFileSync(file).toString('base64')};}}
addAssets('public');
assets['/favicon.ico']=assets['/icon-192.png'];
fs.writeFileSync('worker/assets.js','export const assets = '+JSON.stringify(assets)+';\n');
fs.mkdirSync('dist/server',{recursive:true});
await build({entryPoints:['worker/index.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'neutral',external:['node:*'],target:'es2022'});
fs.copyFileSync('.openai/hosting.json','dist/hosting.json');
fs.mkdirSync('dist/.openai',{recursive:true});fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
fs.cpSync('drizzle','dist/drizzle',{recursive:true});
console.log('Hosted Worker built with schema migrations and embedded original assets.');
