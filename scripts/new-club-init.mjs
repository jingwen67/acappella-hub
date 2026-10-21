import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function emptyClubSchema(source){
 const clean=source.replace(/^INSERT INTO cucac\.plan_terms\(label\) VALUES\('2026 Fall'\) ON CONFLICT\(label\) DO NOTHING;\s*$/m,'');
 return "-- NEW EMPTY SUPABASE PROJECT ONLY. Refuses to touch an existing Hub.\nBEGIN;\nDO $$ BEGIN IF to_regclass('cucac.users') IS NOT NULL THEN RAISE EXCEPTION 'Hub already exists: initialize a NEW project instead'; END IF; END $$;\n"+clean+'\nCOMMIT;\n';
}
export const privateBucketSql="INSERT INTO storage.buckets(id,name,public) VALUES('hub-private','hub-private',false) ON CONFLICT(id) DO NOTHING;\nDO $$ BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='hub-private' AND public) THEN RAISE EXCEPTION 'Hub storage bucket must be private'; END IF; END $$;\n";
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/new-club-schema.sql',emptyClubSchema(fs.readFileSync('vercel/schema.sql','utf8')));fs.writeFileSync('dist/new-club-storage.sql',privateBucketSql);fs.writeFileSync('vercel/new-club-schema.sql',emptyClubSchema(fs.readFileSync('vercel/schema.sql','utf8')));fs.writeFileSync('vercel/new-club-storage.sql',privateBucketSql);console.log('Prepared vercel/new-club-schema.sql and vercel/new-club-storage.sql for a NEW project.');}
