import { randomUUID } from 'node:crypto';
export function galleryService({db, files, imageExt, fail}) {
 const types={jpg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};
 const key=p=>'photos/'+p.id+'.'+p.ext;
 async function seed(owner) {
  const row=await db.prepare('SELECT * FROM users WHERE id = ?').get(owner);
  if(!row)throw fail(404,'user_missing');
  if(!row.gallery_seeded){
   const old=row.avatar_ext && await files.get('avatars/'+owner+'.'+row.avatar_ext);
   if(old){const id='legacy-'+owner;await files.put('photos/'+id+'.'+row.avatar_ext,await old.arrayBuffer());
    await db.prepare('INSERT OR IGNORE INTO photos (id,owner_id,uploaded_by,ext,created_at) VALUES (?,?,?,?,?)').run(id,owner,owner,row.avatar_ext,new Date().toISOString());
    await db.prepare('UPDATE users SET avatar_photo_id = ? WHERE id = ? AND gallery_seeded = 0').run(id,owner);
   }
   await db.prepare('UPDATE users SET gallery_seeded = 1 WHERE id = ?').run(owner);
  }
  return await db.prepare('SELECT * FROM users WHERE id = ?').get(owner);
 }
 async function list(owner,user){const row=await seed(owner);
  const photos=await db.prepare('SELECT p.*,u.name AS uploader_name FROM photos p LEFT JOIN users u ON u.id=p.uploaded_by WHERE p.owner_id=? ORDER BY p.created_at DESC,p.id DESC').all(owner);
  return {photos:photos.map(p=>({id:p.id,url:'/api/photos/'+p.id,name:p.uploader_name||'',canDelete:user.id===owner||user.id===p.uploaded_by,canSetAvatar:user.id===owner,isAvatar:row.avatar_photo_id===p.id})),mine:user.id===owner};
 }
 async function upload(owner,user,file){await seed(owner);if(!file?.body?.length)throw fail(400,'file_required');if(file.body.length>5*1024*1024)throw fail(413,'too_large');const ext=imageExt(file.body,file.filename);if(!ext)throw fail(400,'avatar_type');const p={id:randomUUID(),ext};await files.put(key(p),file.body);
  try{await db.prepare('INSERT INTO photos (id,owner_id,uploaded_by,ext,created_at) VALUES (?,?,?,?,?)').run(p.id,owner,user.id,ext,new Date().toISOString());}catch(e){await files.delete(key(p));throw e;}return await list(owner,user);
 }
 async function photo(id){const p=await db.prepare('SELECT * FROM photos WHERE id = ?').get(id);if(!p)throw fail(404,'not_found');return p;}
 async function bytes(id){const p=await photo(id);const f=await files.get(key(p));if(!f)throw fail(404,'not_found');return {body:await f.arrayBuffer(),type:types[p.ext]};}
 async function select(id,user){const p=await photo(id);if(user.id!==p.owner_id)throw fail(403,'forbidden');const f=await files.get(key(p));if(!f)throw fail(404,'not_found');await files.put('avatars/'+p.owner_id+'.'+p.ext,await f.arrayBuffer());await db.prepare('UPDATE users SET avatar_ext=?,avatar_photo_id=? WHERE id=?').run(p.ext,p.id,p.owner_id);return await list(p.owner_id,user);}
 async function remove(id,user){const p=await photo(id);if(user.id!==p.owner_id&&user.id!==p.uploaded_by)throw fail(403,'forbidden');
  await db.prepare('UPDATE users SET avatar_ext=\'\',avatar_photo_id=NULL WHERE id=? AND avatar_photo_id=?').run(p.owner_id,p.id);
  await db.prepare('DELETE FROM photos WHERE id = ?').run(id);await files.delete(key(p));return await list(p.owner_id,user);
 }
 return {list,upload,bytes,select,remove,seed};
}

