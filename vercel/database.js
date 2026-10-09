import pg from 'pg';
const tables=['users','sessions','phases','candidacies','votes','arrangers','semesters','scores','photos','photo_likes','invitations'];
export function translateSQL(source) {
 let sql=source.trim().replace(/;$/,'');
 sql=sql.replace(/([\w.]+)\s*=\s*\?\s+COLLATE NOCASE/gi,'lower($1) = lower(?)');
 const ignore=/INSERT OR IGNORE/i.test(sql);
 sql=sql.replace(/INSERT OR IGNORE/gi,'INSERT');
 // Parameterize only placeholders outside SQL string literals.
 let quote=false,n=0,out='';
 for(let i=0;i<sql.length;i++){const c=sql[i];if(c==="'"){if(quote&&sql[i+1]==="'"){out+="''";i++;continue;}quote=!quote;}out+=c==='?'&&!quote?'$'+(++n):c;}
 sql=out.replace(/\b(FROM|JOIN|UPDATE|INTO)\s+([a-z_]+)/gi,(all,keyword,table)=>tables.includes(table)?keyword+' cucac.'+table:all);
 if(ignore || (/^INSERT INTO cucac.users/i.test(sql)&&/WHERE NOT EXISTS/i.test(sql)))sql+=' ON CONFLICT DO NOTHING';
 if(/^INSERT\s+INTO\s+cucac\.(users|phases|arrangers|semesters|scores)\b/i.test(sql)&&! /\bRETURNING\b/i.test(sql))sql+=' RETURNING id';
 return sql;
}
function normalizeError(error){if(error.code==='23505')error.message='UNIQUE constraint: '+error.message;return error;}
export function createDatabase(pool) {
 class Statement {
  constructor(sql,args=[]){this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.sql,args);}
  async execute(client=pool){try{return await client.query(translateSQL(this.sql),this.args);}catch(e){throw normalizeError(e);}}
  async first(){return (await this.execute()).rows[0]||null;}
  async all(){return {results:(await this.execute()).rows};}
  async run(){const r=await this.execute();return {meta:{changes:r.rowCount,last_row_id:r.rows[0]?.id||0}};}
 }
 return {prepare:sql=>new Statement(sql),async batch(statements){const client=await pool.connect();try{await client.query('BEGIN');const results=[];for(const s of statements){const r=await s.execute(client);results.push({meta:{changes:r.rowCount,last_row_id:r.rows[0]?.id||0}});}await client.query('COMMIT');return results;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}};
}
export function createPool(connectionString){return new pg.Pool({connectionString,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:true},...(process.env.DATABASE_CA?{ssl:{rejectUnauthorized:true,ca:process.env.DATABASE_CA}}:{})});}
