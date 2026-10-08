import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
const assets={};
for(const name of fs.readdirSync('public')){const file=path.join('public',name);if(fs.statSync(file).isFile())assets[name==='index.html'?'/':'/'+name]={type:types[path.extname(name)]||'application/octet-stream',data:fs.readFileSync(file).toString('base64')};}
assets['/favicon.ico']=assets['/icon-192.png'];
fs.writeFileSync('worker/assets.js','export const assets = '+JSON.stringify(assets)+';\n');
await build({entryPoints:['worker/index.js'],outfile:'dist/vercel-worker.mjs',bundle:true,format:'esm',platform:'node',target:'node22',external:['node:*']});
console.log('Vercel runtime built; Sites is unchanged.');
