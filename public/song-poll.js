const SONG_POLL_FLAT=false;
let songPollDraft={title:'',semester:'all',query:'',selected:new Map(),maxVotes:1,unlimited:true,anonymous:false,folders:null,loadedSource:null,error:'',loading:false,request:0};
const songPollNormalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
const songPollAddDrafts=new Map(),songPollAddOpen=new Set();
async function songPollLoad(d=songPollDraft){
 const source=d.semester,request=++d.request;d.loading=true;d.error='';
 try{const data=await api('/api/library/folders?semesterId='+encodeURIComponent(source));if(request!==d.request)return;d.folders=data.folders||[];d.loadedSource=source;}
 catch(error){if(request===d.request)d.error=error.message;}
 finally{if(request===d.request){d.loading=false;if(view==='poll')renderRound(latest);}}
}
function songPollForm(phase=null){
 if(phase&&!songPollAddDrafts.has(phase.id))songPollAddDrafts.set(phase.id,{...songPollDraft,selected:new Map(),folders:null,loadedSource:null,request:0,loading:false,error:''});
 const d=phase?songPollAddDrafts.get(phase.id):songPollDraft;
 const exists=name=>phase?.candidates.some(song=>songPollNormalize(song.name)===songPollNormalize(name));
 for(const [id,song] of d.selected)if(exists(song.name))d.selected.delete(id);
 const limit=el('input',{name:'maxVotes',type:'number',min:1,max:Math.max(1,d.selected.size),step:1,value:d.maxVotes,disabled:d.unlimited,required:!d.unlimited,oninput:event=>d.maxVotes=event.target.value});
 const results=el('div',{class:'card stack',style:'max-height:360px;overflow:auto'}),count=el('p',{class:'hint'});
 const draw=()=>{limit.max=String(Math.max(1,d.selected.size));count.textContent=planText('已选 '+d.selected.size+' 首','Selected '+d.selected.size+' songs');const songs=(d.folders||[]).filter(s=>songPollNormalize(s.name).includes(songPollNormalize(d.query)));results.replaceChildren(...songs.map(song=>el('label',{class:'plan-library-choice'},el('input',{type:'checkbox',checked:exists(song.name)||d.selected.has(song.id),disabled:exists(song.name),onchange:event=>{if(event.target.checked){if(d.selected.size>=100){event.target.checked=false;showBanner(planText('最多选择 100 首歌曲','Choose up to 100 songs'));return;}d.selected.set(song.id,song);}else d.selected.delete(song.id);draw();}}),el('span',{},song.name))),!songs.length?el('p',{class:'hint'},d.loading?pair('正在加载…','Loading…'):pair('没有匹配的歌曲','No matching songs')):null);};draw();
 const form=el('form',{class:'stack',id:phase?'song-poll-add-form':'song-poll-form',onsubmit:event=>{event.preventDefault();if(d.selected.size<(phase?1:2)){showBanner(phase?planText('请选择要添加的歌曲','Choose songs to add'):planText('请至少选择两首歌曲','Choose at least two songs'));return;}run(async()=>{if(phase){const data=await api('/api/phases/'+phase.id+'/songs',{method:'POST',body:JSON.stringify({songFolderIds:[...d.selected.keys()]})});d.selected.clear();songPollAddOpen.delete(phase.id);return data;}const data=await api('/api/phases',{method:'POST',body:JSON.stringify({pollType:'song',title:d.title,songFolderIds:[...d.selected.keys()],maxVotes:d.unlimited?null:Number(d.maxVotes),anonymous:d.anonymous})});songPollDraft={title:'',semester:'all',query:'',selected:new Map(),maxVotes:1,unlimited:true,anonymous:false,folders:null,loadedSource:null,error:'',loading:false,request:0};return data;});}},
 phase?null:el('label',{},pair('投票名称','Poll title'),el('input',{name:'title',required:true,maxlength:40,value:d.title,oninput:event=>d.title=event.target.value})),
 SONG_POLL_FLAT?null:el('label',{},pair('学期','Semester'),el('select',{value:d.semester,onchange:event=>{d.semester=event.target.value;d.error='';d.folders=null;renderRound(latest);}},el('option',{value:'all',selected:d.semester==='all'},pair('所有学期','All semesters')),...(latest.library?.semesters||[]).map(term=>el('option',{value:term.id,selected:String(term.id)===d.semester},term.label)))),
 el('input',{type:'search',placeholder:planText('搜索歌名','Search song titles'),'aria-label':planText('搜索歌名','Search song titles'),value:d.query,oninput:event=>{d.query=event.target.value;draw();}}),
 d.error?el('div',{class:'hint'},d.error,el('button',{type:'button',class:'nav-btn',onclick:()=>songPollLoad(d)},pair('重试','Retry'))):null,results,count,
 el('div',{class:'stack'},[...d.selected.values()].map(song=>el('div',{class:'plan-inline'},el('span',{},song.name),el('button',{type:'button',class:'nav-btn remove-part',onclick:()=>{d.selected.delete(song.id);renderRound(latest);}},pair('移除','Remove'))))),
 phase?null:el('div',{class:'stack'},el('label',{class:'plan-library-choice'},el('input',{name:'unlimited',type:'checkbox',checked:d.unlimited,onchange:event=>{d.unlimited=event.target.checked;limit.disabled=d.unlimited;limit.required=!d.unlimited;}}),pair('不限（默认）','No limit (default)')),el('label',{},pair('每人最多可选几首','Maximum songs per person'),limit)),
 phase?null:el('label',{},pair('是否匿名投票？','Anonymous voting?'),el('select',{name:'anonymous',onchange:event=>d.anonymous=event.target.value==='true'},el('option',{value:'false',selected:!d.anonymous},pair('否（默认）','No (default)')),el('option',{value:'true',selected:d.anonymous},pair('是','Yes')))),
 phase?el('p',{class:'hint'},pair('新歌加在末尾，已有选票和每人票数上限保持不变。','New songs appear at the end. Existing votes and the choice limit stay unchanged.')):el('p',{class:'hint'},pair('非匿名时，仅管理员和发起者可查看个人选票。发起后立即开放投票。','For non-anonymous polls, only the administrator and creator can view individual ballots. Voting opens immediately.')),
 el('button',{type:'submit',class:'primary'},phase?pair('添加歌曲','Add songs'):pair('发起投票','Launch poll')));
 if(!d.loading&&d.loadedSource!==d.semester&&!d.error)queueMicrotask(()=>songPollLoad(d));
 return form;
}

function songPollAddControl(phase){
 if(phase.pollType!=='song'||!latest.user.isMd)return null;
 return el('section',{class:'stack'},el('button',{type:'button',class:'nav-btn',onclick:()=>{if(songPollAddOpen.has(phase.id))songPollAddOpen.delete(phase.id);else songPollAddOpen.add(phase.id);renderRound(latest);}},songPollAddOpen.has(phase.id)?pair('收起添加歌曲','Hide song picker'):pair('添加歌曲','Add songs')),songPollAddOpen.has(phase.id)?songPollForm(phase):null);
}
