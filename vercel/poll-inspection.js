import {isCustomRound} from './custom-polls.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
// Read the existing ballots: introducing this screen never changes a running poll.
export async function inspectPoll(pool,id,user,kind){
 if(kind==='ballots'&&!user.isAdmin)throw fail(403,'forbidden');
 const p=(await pool.query('SELECT * FROM cucac.phases WHERE id=$1',[id])).rows[0];
 if(!p)throw fail(404,'phase_missing');
 if(kind==='pending'&&!user.isAdmin&&user.id!==p.created_by)throw fail(403,'forbidden');
 if(kind==='pending')return {members:(await pool.query(`SELECT u.id,u.name,u.full_name FROM cucac.vote_presence pr JOIN cucac.users u ON u.id=pr.user_id LEFT JOIN cucac.vote_submissions s ON s.phase_id=pr.phase_id AND s.voter_id=pr.user_id WHERE pr.phase_id=$1 AND pr.joined_at IS NOT NULL AND u.is_admin=0 AND s.voter_id IS NULL ORDER BY lower(u.name),u.id`,[id])).rows.map(u=>({id:u.id,name:u.full_name||u.name}))};
 let votes;
 if(isCustomRound(p))votes=(await pool.query('SELECT voter_id,option_id FROM cucac.custom_votes WHERE phase_id=$1 ORDER BY voter_id,option_id',[id])).rows.map(v=>({voterId:v.voter_id,name:p.part_labels[v.option_id-1],reaction:'like'}));
 else if(p.poll_type==='solo')votes=(await pool.query('SELECT v.voter_id,v.reaction,u.name,u.full_name FROM cucac.votes v JOIN cucac.users u ON u.id=v.candidate_id WHERE v.phase_id=$1 ORDER BY v.voter_id,v.candidate_id',[id])).rows.map(v=>({voterId:v.voter_id,name:v.full_name||v.name,reaction:v.reaction}));
 else{
  const labels=p.part_labels?.length?p.part_labels:[p.part_a,p.part_b,...(p.part_c?[p.part_c]:[])];
  votes=(await pool.query(`SELECT v.voter_id,e.part,a.name AS name1,a.full_name AS full1,b.name AS name2,b.full_name AS full2 FROM cucac.duet_votes v JOIN cucac.duet_entries e ON e.phase_id=v.phase_id AND e.id=v.entry_id JOIN cucac.users a ON a.id=e.member1 LEFT JOIN cucac.users b ON b.id=e.member2 WHERE v.phase_id=$1 ORDER BY v.voter_id,e.part,e.id`,[id])).rows.map(v=>({voterId:v.voter_id,name:[v.full1||v.name1,v.full2||v.name2].filter(Boolean).join(' + '),reaction:'like',part:v.part==='pair'?'':labels[['A','B','C'].indexOf(v.part)>=0?['A','B','C'].indexOf(v.part):Number(v.part.replace('part_',''))-1]}));
 }
 const attendees=(await pool.query(`SELECT u.id,u.name,u.full_name,s.submitted_at,pr.joined_at FROM cucac.users u LEFT JOIN cucac.vote_presence pr ON pr.user_id=u.id AND pr.phase_id=$1 LEFT JOIN cucac.vote_submissions s ON s.voter_id=u.id AND s.phase_id=$1 ORDER BY lower(u.name),u.id`,[id])).rows;
 return {members:attendees.filter(u=>u.joined_at||u.submitted_at||votes.some(v=>v.voterId===u.id)).map(u=>({id:u.id,name:u.full_name||u.name,submitted:Boolean(u.submitted_at),choices:votes.filter(v=>v.voterId===u.id).map(({voterId,...v})=>v)}))};
}
