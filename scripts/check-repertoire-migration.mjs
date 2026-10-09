import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const pg=new PGlite(),migration=fs.readFileSync('vercel/repertoire-schema.sql','utf8'),schema=fs.readFileSync('vercel/schema.sql','utf8');
try{
 await pg.exec(schema.slice(0,schema.lastIndexOf(migration)));
 const q=(s,a=[])=>pg.query(s,a);
 const member=(await q("INSERT INTO cucac.users(name,password_hash,created_at) VALUES('Migration singer','unused','original') RETURNING id")).rows[0].id;
 const term=(await q('SELECT id FROM cucac.plan_terms LIMIT 1')).rows[0].id;
 const song=(await q("INSERT INTO cucac.plan_songs(term_id,title) VALUES($1,'Existing song') RETURNING id",[term])).rows[0].id;
 await q("INSERT INTO cucac.plan_entries(song_id,member_key,member_id,member_name,part,created_at) VALUES($1,$2,$2,'Original name','alto','2026-10-01')",[song,member]);
 await pg.exec(migration);await pg.exec(migration);
 const cast=(await q('SELECT * FROM cucac.plan_cast')).rows;assert.equal(cast.length,1);assert.equal(cast[0].member_name,'Original name');assert.equal(cast[0].part,'alto');assert.equal(cast[0].song_id,song);
 await q("INSERT INTO cucac.plan_cast(song_id,member_key,member_id,member_name,part) VALUES($1,$2,$2,'Original name','solo')",[song,member]);assert.equal((await q('SELECT * FROM cucac.plan_cast')).rows.length,2);
 assert.equal((await q('SELECT * FROM cucac.plan_entries')).rows.length,1);assert.equal((await q('SELECT count(*)::int AS n FROM cucac.plan_terms WHERE is_current')).rows[0].n,1);
 assert.equal((await q("SELECT rowsecurity FROM pg_tables WHERE schemaname='cucac' AND tablename='plan_cast'")).rows[0].rowsecurity,true);
 console.log('PASS: idempotent upgrade preserves existing song/member/part/name records, retains the legacy table, enables multi-part and Solo cast rows, and protects the private cast table.');
}finally{await pg.close();}
