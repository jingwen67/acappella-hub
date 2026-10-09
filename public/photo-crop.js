// Crop locally before uploading; pointer controls support mouse and touch.
window.cropPhoto=async function(file){
 if(file.size>5*1024*1024)throw new Error('每张图片不能超过 5 MB。 / Each photo must be under 5 MB.');
 const url=URL.createObjectURL(file),image=new Image();image.src=url;
 try{await image.decode();}catch{URL.revokeObjectURL(url);throw new Error('无法读取图片，请使用 JPG、PNG 或 WebP。 / Use a readable JPG, PNG or WebP image.');}
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='photo-preview photo-crop';
  const title=document.createElement('h3');title.textContent='裁剪照片 / Crop photo';
  const mode=document.createElement('select');mode.setAttribute('aria-label','裁剪比例 / Crop ratio');mode.innerHTML='<option value="square">1:1</option><option value="free">自由裁剪 / Freeform</option>';
  const canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:auto;height:auto;max-width:100%;margin:auto;touch-action:none;max-height:60dvh;object-fit:contain;';
  const factor=Math.min(1,560/image.naturalWidth,420/image.naturalHeight);canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
  let rect,drag=null,finished=false;
  function reset(){const size=Math.min(canvas.width,canvas.height)*.85;rect=mode.value==='square'?{x:(canvas.width-size)/2,y:(canvas.height-size)/2,w:size,h:size}:{x:0,y:0,w:canvas.width,h:canvas.height};draw();}
  function draw(){const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(image,0,0,canvas.width,canvas.height);c.fillStyle='#0008';c.fillRect(0,0,canvas.width,canvas.height);c.save();c.beginPath();c.rect(rect.x,rect.y,rect.w,rect.h);c.clip();c.drawImage(image,0,0,canvas.width,canvas.height);c.restore();c.strokeStyle='#fff';c.lineWidth=2;c.strokeRect(rect.x,rect.y,rect.w,rect.h);c.fillStyle='#fff';c.fillRect(rect.x+rect.w-8,rect.y+rect.h-8,8,8);}
  const position=e=>{const box=canvas.getBoundingClientRect();return {x:(e.clientX-box.left)*canvas.width/box.width,y:(e.clientY-box.top)*canvas.height/box.height};};
  canvas.onpointerdown=e=>{const p=position(e);const inside=p.x>=rect.x&&p.x<=rect.x+rect.w&&p.y>=rect.y&&p.y<=rect.y+rect.h;drag={...p,old:{...rect},kind:Math.abs(p.x-rect.x-rect.w)<20&&Math.abs(p.y-rect.y-rect.h)<20?'resize':inside?'move':'new'};canvas.setPointerCapture(e.pointerId);e.preventDefault();};
  canvas.onpointermove=e=>{if(!drag)return;const p=position(e),dx=p.x-drag.x,dy=p.y-drag.y;
   if(drag.kind==='move'){rect.x=Math.max(0,Math.min(canvas.width-rect.w,drag.old.x+dx));rect.y=Math.max(0,Math.min(canvas.height-rect.h,drag.old.y+dy));}
   else {const anchor=drag.kind==='resize'?{x:drag.old.x,y:drag.old.y}:drag;let w=Math.max(12,Math.min(canvas.width-anchor.x,p.x-anchor.x)),h=Math.max(12,Math.min(canvas.height-anchor.y,p.y-anchor.y));if(mode.value==='square')w=h=Math.min(w,h);rect={x:Math.max(0,Math.min(canvas.width-12,anchor.x)),y:Math.max(0,Math.min(canvas.height-12,anchor.y)),w,h};rect.w=Math.min(rect.w,canvas.width-rect.x);rect.h=Math.min(rect.h,canvas.height-rect.y);}
   draw();e.preventDefault();};canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};mode.onchange=reset;
  const size=document.createElement('input');size.type='range';size.min='15';size.max='100';size.value='85';size.setAttribute('aria-label','裁剪大小 / Crop size');size.oninput=()=>{const ratio=Number(size.value)/100,cx=rect.x+rect.w/2,cy=rect.y+rect.h/2,w=mode.value==='square'?Math.min(canvas.width,canvas.height)*ratio:canvas.width*ratio,h=mode.value==='square'?w:canvas.height*ratio;rect={x:Math.max(0,Math.min(canvas.width-w,cx-w/2)),y:Math.max(0,Math.min(canvas.height-h,cy-h/2)),w,h};draw();};
  const actions=document.createElement('div');actions.className='photo-actions';const cancel=document.createElement('button');cancel.className='nav-btn';cancel.textContent='取消 / Cancel';const save=document.createElement('button');save.className='nav-btn';save.textContent='裁剪并上传 / Crop & upload';
  function finish(result){if(finished)return;finished=true;URL.revokeObjectURL(url);dialog.close();dialog.remove();resolve(result);}cancel.onclick=()=>finish(null);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});dialog.addEventListener('close',()=>{if(!finished)finish(null);});
  save.onclick=async()=>{save.disabled=true;try{const out=document.createElement('canvas'),sx=rect.x/factor,sy=rect.y/factor,sw=rect.w/factor,sh=rect.h/factor,scale=Math.min(1,2000/sw,2000/sh);out.width=Math.max(1,Math.round(sw*scale));out.height=Math.max(1,Math.round(sh*scale));const c=out.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,out.width,out.height);c.drawImage(image,sx,sy,sw,sh,0,0,out.width,out.height);let blob;for(const quality of [.9,.8,.65,.5]){blob=await new Promise(resolve=>out.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<3.8*1024*1024)break;}if(!blob||blob.size>5*1024*1024)throw Error();finish(new File([blob],'photo.jpg',{type:'image/jpeg'}));}catch{save.disabled=false;title.textContent='裁剪失败，请重试 / Crop failed; retry';}};
  actions.append(cancel,save);dialog.append(title,mode,canvas,size,actions);document.body.append(dialog);reset();dialog.showModal();
 });
};
