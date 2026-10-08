import {createClient} from '@supabase/supabase-js';
export function createStorage({url,key,bucket='cucac-private'}) {
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const store=client.storage.from(bucket);
 return {
  async get(path){const {data,error}=await store.download(path);if(error){if(String(error.statusCode||error.status)==='404'||/not found|does not exist/i.test(error.message))return null;throw new Error('Photo storage unavailable');}return {arrayBuffer:()=>data.arrayBuffer(),text:()=>data.text(),json:async()=>JSON.parse(await data.text())};},
  async put(path,body){const {error}=await store.upload(path,body,{upsert:true,contentType:path.endsWith('.json')?'application/json':'application/octet-stream'});if(error)throw new Error('Photo storage unavailable');},
  async audioUploadUrl(path){const {data,error}=await store.createSignedUploadUrl(path);if(error)throw new Error('Audio upload unavailable');return data.signedUrl;},
  async audioInfo(path){const {data,error}=await store.info(path);if(error)throw new Error('Audio file not found');return data;},
  async audioPlaybackUrl(path,seconds){const {data,error}=await store.createSignedUrl(path,seconds);if(error)throw new Error('Audio playback unavailable');return data.signedUrl;},
  async delete(path){const {error}=await store.remove([path]);if(error)throw new Error('Photo storage unavailable');}
 };
}
