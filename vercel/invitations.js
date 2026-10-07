import {randomBytes,createHash} from 'node:crypto';
const digest=code=>createHash('sha256').update(String(code||'').trim()).digest('hex');
const failure=(status,message)=>Object.assign(new Error(message),{status});
export function createInvitations(pool){
 return {
  async create(admin){const code=randomBytes(18).toString('base64url');const id=randomBytes(16).toString('hex');const expires=new Date(Date.now()+7*86400000).toISOString();
   await pool.query('INSERT INTO cucac.invitations(id,code_hash,created_by,created_at,expires_at,is_shared) VALUES($1,$2,$3,$4,$5,1)',[id,digest(code),admin.id,new Date().toISOString(),expires]);return {id,code,expiresAt:expires};},
  async list(){return {invitations:(await pool.query('SELECT id,created_at,expires_at,used_at,revoked,is_shared,use_count FROM cucac.invitations ORDER BY created_at DESC LIMIT 100')).rows};},
  async revoke(id){await pool.query('UPDATE cucac.invitations SET revoked=1 WHERE id=$1',[id]);},
  async register({code,name,passwordHash,createdAt}) {
   if(!code)throw failure(403,'invite_required');
   const c=await pool.connect();try{await c.query('BEGIN');
    const invite=(await c.query('SELECT * FROM cucac.invitations WHERE code_hash=$1 FOR UPDATE',[digest(code)])).rows[0];
    if(!invite||invite.revoked||(!invite.is_shared&&invite.used_at)||new Date(invite.expires_at)<=new Date())throw failure(403,'invite_invalid');
    const inserted=await c.query('INSERT INTO cucac.users(name,password_hash,created_at) VALUES($1,$2,$3) RETURNING id',[name,passwordHash,createdAt]);
    await c.query('UPDATE cucac.invitations SET used_at=$1,used_by=$2,use_count=use_count+1 WHERE id=$3',[createdAt,inserted.rows[0].id,invite.id]);
    await c.query('COMMIT');return {lastInsertRowid:inserted.rows[0].id};
   }catch(e){await c.query('ROLLBACK');if(e.code==='23505')throw failure(409,'name_taken');throw e;}finally{c.release();}
  }
 };
}
