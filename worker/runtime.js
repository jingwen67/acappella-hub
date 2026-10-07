import { Buffer } from 'node:buffer';
export function database(binding) {
 let queue=null;
 return {
  beginBatch(){if(queue)throw new Error('Nested transaction');queue=[];},
  async commitBatch(){const pending=queue;queue=null;if(pending.length)await binding.batch(pending);},
  cancelBatch(){queue=null;},
  prepare(sql){
   const bound=(args)=>binding.prepare(sql).bind(...args);
   return {
    get(...args){return bound(args).first();},
    async all(...args){return (await bound(args).all()).results;},
    async run(...args){
     const stmt=bound(args);
     if(queue){queue.push(stmt);return {};}
     const r=await stmt.run();return {changes:r.meta.changes,lastInsertRowid:r.meta.last_row_id};
    }
   };
  }
 };
}
export async function boundedBody(request, limit) {
 if(Number(request.headers.get('content-length'))>limit)throw Object.assign(new Error('too_large'),{status:413});
 if(!request.body)return Buffer.alloc(0);
 const reader=request.body.getReader(),parts=[];let size=0;
 try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Object.assign(new Error('too_large'),{status:413});}parts.push(Buffer.from(value));}}
 finally {reader.releaseLock();}
 return Buffer.concat(parts);
}
async function derive(password,salt) {
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 return Buffer.from(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt},key,256));
}
export async function hashPassword(password){const salt=crypto.getRandomValues(new Uint8Array(16));return `pbkdf2:${Buffer.from(salt).toString('hex')}:${(await derive(password,salt)).toString('hex')}`;}
export async function verifyPassword(password,stored){
 const [kind,salt,expected]=String(stored).split(':');
 if(kind!=='pbkdf2'||!salt||!expected)return false;
 const actual=await derive(password,Buffer.from(salt,'hex')),wanted=Buffer.from(expected,'hex');
 if(actual.length!==wanted.length)return false;let different=0;for(let i=0;i<actual.length;i++)different|=actual[i]^wanted[i];return different===0;
}
const setups=new WeakMap();
export async function initialize(env){
 if(setups.has(env.DB))return setups.get(env.DB);
 const pending=(async()=>{
  if(!env.ADMIN_PASSWORD)throw new Error('Administrator setup is missing');
  const password=await hashPassword(env.ADMIN_PASSWORD);
  const names=['Ashley','Charlie Mei','Chris Lee','Christina Wang','Jace Li','Jane Ye','Joey Zhao','Lance Chen','Max Gao','PennYo','Pentatonix','Sophia Peng','Wei You','未知网络作者 / unknown online author'];
  await env.DB.batch([
   env.DB.prepare("INSERT INTO users (name,password_hash,created_at,is_admin,can_start) SELECT 'admin',?,?,1,1 WHERE NOT EXISTS (SELECT 1 FROM users WHERE is_admin=1)").bind(password,new Date().toISOString()),
   ...names.map(name=>env.DB.prepare('INSERT OR IGNORE INTO arrangers (name,created_at) VALUES (?,?)').bind(name,new Date().toISOString()))
  ]);
 })();setups.set(env.DB,pending);
 try{await pending;}catch(error){setups.delete(env.DB);throw error;}
}
export function responseSink(){
 let status=200,headers={},body=null,sent=false;
 return {
  get headersSent(){return sent;},
  writeHead(code,h){status=code;headers=h;sent=true;},
  end(bytes){body=bytes??null;},
  response(){return new Response(body,{status,headers});}
 };
}
