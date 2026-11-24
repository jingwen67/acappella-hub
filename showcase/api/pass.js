import {timingSafeEqual} from 'node:crypto';
function eq(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return y.length>0&&x.length===y.length&&timingSafeEqual(x,y)}
export default async function handler(req,res){
res.setHeader('Cache-Control','no-store');
if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
const b=req.body||{}, action=b.action;
const admin=eq(b.password,process.env.ADMIN_PASSWORD), staff=eq(b.password,process.env.STAFF_PASSWORD);
if(!['status','claim','ticket','lookup','redeem','list','toggle'].includes(action))return res.status(400).json({error:'Invalid action'});
if(['list','toggle'].includes(action)&&!admin||['lookup','redeem'].includes(action)&&!admin&&!staff||action==='claim'&&!eq(b.pin,process.env.CLAIM_PIN))return res.status(403).json({error:'Incorrect access code'});
const name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),code=String(b.code||'').trim().toUpperCase();
if(action==='claim'&&(!name||name.length>100||email.length>254||!/^\S+@\S+\.\S+$/.test(email)))return res.status(400).json({error:'Enter a valid name and email'});
try{
const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/rpc/showcase_pass',{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({a:action,n:name,e:email,c:code,o:b.open===true})});
if(!r.ok)throw Error('Database request failed');
return res.status(200).json(await r.json());
}catch{return res.status(503).json({error:'Service temporarily unavailable. Please try again.'})}
}