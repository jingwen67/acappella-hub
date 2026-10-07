import worker from '../dist/vercel-worker.mjs';
import {createDatabase,createPool} from '../vercel/database.js';
import {createStorage} from '../vercel/storage.js';
import {createVoting} from '../vercel/voting.js';
import {createInvitations} from '../vercel/invitations.js';
let environment;
function configuredEnv(){
 if(environment)return environment;
 for(const name of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ADMIN_PASSWORD','PUBLIC_ORIGIN'])if(!process.env[name])throw new Error('Missing configuration: '+name);
 const pool=createPool(process.env.DATABASE_URL);
 environment={DB:createDatabase(pool),FILES:createStorage({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,bucket:process.env.SUPABASE_STORAGE_BUCKET||'cucac-private'}),ADMIN_PASSWORD:process.env.ADMIN_PASSWORD,PUBLIC_ORIGIN:process.env.PUBLIC_ORIGIN,INVITE_REQUIRED:true,invitations:createInvitations(pool),voting:createVoting(pool)};
 return environment;
}
export const config={api:{bodyParser:false}};
export default async function handler(req,res){
 try {
  const env=configuredEnv(),origin=new URL(env.PUBLIC_ORIGIN).origin;
  const headers=new Headers();for(const [k,v] of Object.entries(req.headers)){if(v!=null)headers.set(k,Array.isArray(v)?v.join(','):v);}
  const url=new URL(req.url,origin);
  let body;
  if(!['GET','HEAD'].includes(req.method)){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4*1024*1024){res.statusCode=413;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'too_large'}));return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
  const request=new Request(url,{method:req.method,headers,...(body?{body}: {})});
  const response=await worker.fetch(request,env);
  res.statusCode=response.status;for(const [k,v] of response.headers)res.setHeader(k,v);
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'server'}));}
}
