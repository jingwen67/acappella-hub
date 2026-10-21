// New club deployments must use a different Supabase project and origin.
// Existing CUCAC deployments use the unchanged default path.
export function validateClubIsolation(env){
 if(!env.HUB_PROFILE||env.HUB_PROFILE==='cucac')return;
 const project=env.HUB_SUPABASE_PROJECT_REF;
 if(!project||!/^[a-z0-9]{20}$/.test(project)||project==='dxlgiqnbdrhocsobybon')throw Error('New club requires its own Supabase project reference');
 let storage,db,origin;try{storage=new URL(env.SUPABASE_URL);db=new URL(env.DATABASE_URL);origin=new URL(env.PUBLIC_ORIGIN);}catch{throw Error('New club deployment configuration is incomplete');}
 if(storage.protocol!=='https:'||storage.hostname!==project+'.supabase.co')throw Error('Supabase project does not match this club');
 const user=decodeURIComponent(db.username);if(db.hostname!=='db.'+project+'.supabase.co'&&!(db.hostname.endsWith('.pooler.supabase.com')&&user==='postgres.'+project))throw Error('Database and file storage must belong to the same new club project');
 if(!['postgres:','postgresql:'].includes(db.protocol)||origin.protocol!=='https:'||origin.hostname==='cucac-hub.vercel.app')throw Error('New club requires a separate HTTPS origin');
}
