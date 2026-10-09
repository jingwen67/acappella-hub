ALTER TABLE cucac.phases ADD COLUMN IF NOT EXISTS solo_results jsonb;
UPDATE cucac.phases p SET solo_results=(
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'likes',r.likes,'again',r.again,'rank',r.rank) ORDER BY r.likes DESC,r.name),'[]'::jsonb)
 FROM (SELECT stats.*,dense_rank() OVER (ORDER BY likes DESC) AS rank FROM (
 SELECT u.id,u.name,count(v.candidate_id) FILTER (WHERE v.reaction='like')::int AS likes,count(v.candidate_id) FILTER (WHERE v.reaction='again')::int AS again
 FROM cucac.candidacies ca JOIN cucac.users u ON u.id=ca.user_id LEFT JOIN cucac.votes v ON v.phase_id=ca.phase_id AND v.candidate_id=ca.user_id
 WHERE ca.phase_id=p.id GROUP BY u.id,u.name) stats) r
) WHERE p.status='closed' AND p.poll_type='solo' AND p.solo_results IS NULL;
