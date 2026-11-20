import {fillLocally,stopLocalEngine,clearLocalModel} from './client.js';
import {localFrame} from './core.js';
import {resizeFromCorner,resizeAboutCenter,sourceTransformFromRect} from './canvas-transform.js';
import {createUndoHistory} from './undo-history.js';
import {presets,filename,validateSize,layout,clamp,constrainLayer,transformFromRect,detectContentBounds,manualSourceRect,generatedAsset} from './studio-core.js';
import {supportsDirectSave,choosePngFile,writePngFile} from './save-file.js';
const $=id=>document.getElementById(id),root=$('studioRoot');
if(root&&!root.dataset.initialized){root.dataset.initialized='true';init();}
async function init(){
 const icons={upload:'M12 16V3m-5 5 5-5 5 5M5 14v6h14v-6',image:'M4 3h16v18H4zM4 16l5-5 4 4 3-3 4 4M8 7h.01',lock:'M6 10h12v11H6zM8 10V6a4 4 0 018 0v4',sparkles:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z',download:'M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4',copy:'M8 8h12v13H8zM16 8V3H3v13h5',check:'m5 12 4 4L19 6','arrow-up-right':'M6 18 18 6M7 6h11v11'};
 document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[el.dataset.icon]||icons.image}"/></svg>`);
 let s={event:'',preset:'xiaohongshu',...presets[0],safe:0,scale:100,sourceZoom:100,sourceX:50,sourceY:50,anchor:'bottom',background:'#ffffff',quality:'medium',theme:'navy',prompt:'',example:false,showLogo:true,showTitle:true,trim:true,autoAI:true,lockLayers:true,layers:{},selectedLayer:'source'};
 try{const p=JSON.parse(localStorage.getItem('kv-studio-github-v1')||'null');if(p&&validateSize(p.w,p.h))s={...s,...p,safe:clamp(Number(p.safe)||0,0,20),scale:clamp(Number(p.scale)||100,35,100),layers:p.layers||{}};}catch{}
 const legacyExample=s.example===true;s.example=false;
 if(legacyExample)s.event='';
 if(legacyExample){s.sourceZoom=100;s.sourceX=s.sourceY=50;s.background='#ffffff';s.selectedLayer='source';}
 if((s.workflowVersion||0)<5&&s.safe)s.sourceZoom=(Number(s.sourceZoom)||100)*(1-2*s.safe/100);
 s.safe=0;s.lockLayers=false;s.trim=false;s.sourcePlacement=null;s.hideBrandLayers=false;s.aiHiddenLayers=[];s.autoAI=false;s.workflowVersion=5;
 s.sourceZoom=Number.isFinite(Number(s.sourceZoom))&&Number(s.sourceZoom)>0?Number(s.sourceZoom):100;
 if(!['source','logo','title'].includes(s.selectedLayer))s.selectedLayer='source';
 s.sourceX=Number.isFinite(Number(s.sourceX))?Number(s.sourceX):50;s.sourceY=Number.isFinite(Number(s.sourceY))?Number(s.sourceY):50;
 let currentPlan=null,finalReview=null,phase='idle',blendedSource=null,localAbort=null;
 s.engine='local';s.device=['auto','cpu','gpu'].includes(s.device)?s.device:'auto';s.localModel=['moebius','lama','migan'].includes(s.localModel)?s.localModel:'lama';s.moebiusSteps=[20,30,40].includes(s.moebiusSteps)?s.moebiusSteps:20;
 let engineRefresh=0;
 const modelLabels={moebius:'Moebius 扩散',lama:'LaMa 增强',migan:'MI-GAN 轻量'};
 let source=null,logo=null,title=null,generated=null,busy=false,mode='extended',aiReady=false,toastTimer=null,drawQueued=false,autoTimer=null,autoPaused=false,uploading=false,exporting=false,downloadURL=null;
 const history=createUndoHistory();let restoring=false;
 const cv=$('previewCanvas'),ctx=cv.getContext('2d');
 const db=await openDB().catch(()=>null);
 function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('kv-studio-github-assets-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('assets');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 function dbGet(k){return new Promise(resolve=>{if(!db)return resolve(null);const r=db.transaction('assets').objectStore('assets').get(k);r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);});}
 function dbPut(k,v){return new Promise((resolve,reject)=>{if(!db)return reject(Error('浏览器未提供图片保存空间'));const tx=db.transaction('assets','readwrite');if(v)tx.objectStore('assets').put(v,k);else tx.objectStore('assets').delete(k);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
 function captureEditor(){
  const copy=a=>a?{...a,crop:{...a.crop},raw:{...a.raw}}:null;
  return {settings:structuredClone(s),source:copy(source),logo:copy(logo),title:copy(title),generated:copy(generated)};
 }
 function remember(label,group=null){if(restoring)return;history.record(captureEditor(),label,group);syncUndo();}
 function syncUndo(){const b=$('undoButton');b.disabled=busy||uploading||exporting||restoring||!history.size;b.title=history.size?`撤回：${history.label}（Ctrl / ⌘ + Z）`:'暂无可撤回的操作';$('undoHint').textContent=history.size?`可撤回：${history.label}`:'支持构图、换图与补景；刷新后撤回记录清空';}
 async function undoEditor(){
  if(busy||uploading||exporting||restoring)return;const entry=history.undo();if(!entry)return;
  restoring=true;setBusy(true);
  try{
   const options={engine:s.engine,device:s.device,localModel:s.localModel,moebiusSteps:s.moebiusSteps,theme:s.theme,quality:s.quality,prompt:s.prompt};
   s={...entry.state.settings,...options};({source,logo,title,generated}=entry.state);
   currentPlan=finalReview=blendedSource=null;autoPaused=false;$('sizeError').textContent='';$('downloadResult').hidden=true;
   invalidate();syncFields();setMode('extended');
   await Promise.all(['source','logo','title'].map(type=>{const a=type==='source'?source:assetFor(type);return dbPut(type,a?{url:a.url,name:a.name,id:a.id}:null);}));
   if(generated)await storeGenerated();else await dbPut('generated',null);
   decision('已撤回上一步',`已撤回「${entry.label}」，恢复当时的画面、素材与位置。`);feedback(`已撤回：${entry.label}`,'success');
  }catch{feedback('画布已撤回，但浏览器保存失败；刷新前请先下载。','error');}
  finally{restoring=false;setBusy(false);}
 }
 $('undoButton').onclick=undoEditor;
 root.addEventListener('keydown',e=>{const editing=e.target.closest('input,textarea,select,[contenteditable="true"]');if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey&&!editing){e.preventDefault();undoEditor();}});
 root.addEventListener('focusout',()=>history.endGroup());
 window.addEventListener('pointerup',()=>history.endGroup());
 window.addEventListener('pointercancel',()=>history.endGroup());
 function save(){try{localStorage.setItem('kv-studio-github-v1',JSON.stringify({...s,sourcePlacement:null,hideBrandLayers:false}));}catch{toast('当前浏览器无法保存设置，下载不受影响。');}}
 function toast(msg){$('toast').textContent=msg;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3000);}
 function feedback(msg,type=''){const el=$('feedback');el.textContent=msg;el.className=`feedback ${type}`;}
 const assetFor=type=>type==='logo'?logo:title;
 const activeVisual=()=>generated||source;
 async function loadAsset(url,name,kind='plain'){
  const img=new Image();img.decoding='async';img.src=url;await img.decode();
  if(img.naturalWidth*img.naturalHeight>60000000)throw Error('图片像素过大，请先缩小到 6000 万像素以内。');
  const raw={x:0,y:0,w:img.naturalWidth,h:img.naturalHeight};let crop={...raw},hasTransparency=false;
  if(kind!=='plain'){
   const c=document.createElement('canvas'),k=Math.min(1,1536/Math.max(raw.w,raw.h));c.width=Math.max(1,Math.round(raw.w*k));c.height=Math.max(1,Math.round(raw.h*k));
   const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(img,0,0,c.width,c.height);
   const pixels=cx.getImageData(0,0,c.width,c.height);let transparent=0;for(let i=3;i<pixels.data.length;i+=4)if(pixels.data[i]<245)transparent++;hasTransparency=transparent/(c.width*c.height)>.005;const b=detectContentBounds(pixels,{solid:kind==='source',padding:kind==='source'?.005:.002});
   if(b.empty)throw Error('这张图片完全透明，请选择含有可见内容的素材。');
   crop={x:Math.floor(b.x/c.width*raw.w),y:Math.floor(b.y/c.height*raw.h),w:0,h:0};
   crop.w=Math.min(raw.w-crop.x,Math.ceil((b.x+b.w)/c.width*raw.w)-crop.x);crop.h=Math.min(raw.h-crop.y,Math.ceil((b.y+b.h)/c.height*raw.h)-crop.y);c.width=c.height=1;
  }
  return {img,url,name,raw,detected:crop,crop,w:crop.w,h:crop.h,hasTransparency};
 }
 function applyCrop(){if(!source)return;source.crop={...source.raw};source.w=source.raw.w;source.h=source.raw.h;}
 function drawAsset(c,a,r){if(!a)return;const b=a.crop;c.drawImage(a.img,b.x,b.y,b.w,b.h,r.x,r.y,r.w,r.h);}
 function paint(c,w,h){c.clearRect(0,0,w,h);c.save();c.scale(w/s.w,h/s.h);c.fillStyle=s.background;c.fillRect(0,0,s.w,s.h);const visual=activeVisual(),l=layout(s,visual,logo,title);if(visual)drawAsset(c,visual,l.image);for(const r of l.layers)drawAsset(c,assetFor(r.type),r);c.restore();}
 function objectRect(type=s.selectedLayer){const l=layout(s,activeVisual(),logo,title);return type==='source'?(source?l.image:null):l.layers.find(r=>r.type===type);}
 function objectName(type=s.selectedLayer){return type==='source'?(generated?'AI 背景':'主视觉'):type==='logo'?'LOGO':'主标题';}
 function placeHandle(el,r){el.style.left=r.x/s.w*100+'%';el.style.top=r.y/s.h*100+'%';el.style.width=r.w/s.w*100+'%';el.style.height=r.h/s.h*100+'%';}
 function renderHandles(){
  for(const type of ['source','logo','title']){
   const el=$('handle'+type[0].toUpperCase()+type.slice(1)),r=objectRect(type);
   el.hidden=mode==='original'||!r;el.disabled=busy||uploading||restoring;
   el.classList.toggle('selected',s.selectedLayer===type);el.setAttribute('aria-pressed',String(s.selectedLayer===type));
   el.querySelector('span').textContent=objectName(type);el.setAttribute('aria-label',`拖动${objectName(type)}，方向键移动，加减键缩放`);
   if(r)placeHandle(el,r);
  }
  const box=$('selectionBox'),r=objectRect();box.hidden=mode==='original'||!r||busy||uploading||restoring;
  if(r)placeHandle(box,r);
 }
 function redraw(){if(drawQueued)return;drawQueued=true;requestAnimationFrame(()=>{drawQueued=false;const space=$('artboard'),ratio=mode==='original'&&source?source.raw.w/source.raw.h:s.w/s.h;const maxW=Math.max(1,space.clientWidth-40),maxH=Math.max(1,space.clientHeight-78);let w=Math.min(maxW,maxH*ratio),h=w/ratio;$('canvasFrame').style.width=`${w}px`;$('canvasFrame').style.height=`${h}px`;const k=Math.min(window.devicePixelRatio||1,2);cv.width=Math.max(1,Math.round(w*k));cv.height=Math.max(1,Math.round(h*k));if(mode==='original'&&source){ctx.clearRect(0,0,cv.width,cv.height);ctx.drawImage(source.img,0,0,cv.width,cv.height);}else paint(ctx,cv.width,cv.height);renderHandles();});}
 function setPhase(value){phase=value;const order=['analyze','compose','review'],index=value==='done'?3:order.indexOf(value);for(let i=0;i<order.length;i++){const el=$(['stageAnalyze','stageCompose','stageReview'][i]);el.classList.toggle('active',i===index);el.classList.toggle('done',i<index);}const labels={analyze:'正在识别主视觉与延展条件',compose:'正在按你的构图补齐背景',review:'正在检查成品',done:'自动延展完成'};$('loadingTitle').textContent=labels[value]||'正在处理';}
 function decision(title,summary,plan=null,extra=[]){
  $('decisionTitle').textContent=title;$('decisionSummary').textContent=summary;const dl=$('decisionDetails');dl.replaceChildren();dl.hidden=!plan;
  if(plan){const rows=[['处理方式',{scale:'等比缩放，直接适配',crop:'使用画布中可见的内容',outpaint:'保留手动构图并补齐背景'}[plan.strategy]],['构图安排',plan.composition],['主标题',plan.decisions?.title],['LOGO',plan.decisions?.logo]];for(const [name,text] of rows)if(text){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=text;dl.append(dt,dd);}}
  const warnings=[...(plan?.warnings||[]),...(plan?.issues||[]),...extra];const ul=$('decisionWarnings');ul.replaceChildren();ul.hidden=!warnings.length;if(warnings.length||phase==='error')ul.closest('details').open=true;for(const item of warnings){const li=document.createElement('li');li.textContent=item;ul.append(li);}
 }
 function updateVisualPlacement(){const visual=activeVisual();s.sourcePlacement=null;if(visual){const r=manualSourceRect(s,visual);s.sourcePlacement={x:r.x/s.w,y:r.y/s.h,w:r.w/s.w,h:r.h/s.h};}}
 function invalidate(){clearTimeout(autoTimer);$('downloadResult').hidden=true;blendedSource=null;currentPlan=null;finalReview=null;s.hideBrandLayers=false;s.aiHiddenLayers=[];applyCrop();updateVisualPlacement();setPhase(generated?'edited':'idle');$('resultBadge').textContent=generated?'AI 背景 · 可继续编辑':'素材预览 · 待 AI 分析';$('canvasCaption').textContent=generated?'已生成背景完整保留，可继续拖动和缩放；新露出的空白可再次补景。':'AI 将保留当前主视觉大小和位置，识别并补齐背景。';$('exportNote').textContent=generated?'下载会使用当前背景位置与大小；如有新空白，可再次点击 AI 补齐背景。':'当前尚未经过 AI 分析，仅可导出素材预览。';if(generated)decision('AI 背景可继续编辑','拖动、缩放不会恢复成原图。调整后可直接下载，或继续补齐新露出的空白。');}
 async function clearGenerated(){generated=null;await dbPut('generated',null).catch(()=>{});}
 async function storeGenerated(){try{let image=generated.img;if(!image.toBlob){const c=document.createElement('canvas');c.width=image.naturalWidth||image.width;c.height=image.naturalHeight||image.height;c.getContext('2d').drawImage(image,0,0);image=c;}await dbPut('generated',{blob:await toBlob(image),w:generated.w,h:generated.h,sourceId:source.id});}catch{toast('背景已生成，但未能保存到浏览器；刷新前请先下载 PNG。');}}
 async function restoreGenerated(){if(!source)return;const saved=await dbGet('generated');if(!saved?.blob||saved.sourceId!==source.id||!validateSize(saved.w,saved.h))return;const url=URL.createObjectURL(saved.blob);try{const a=await loadAsset(url,'AI 背景');generated=generatedAsset(a.img,saved.w,saved.h);invalidate();syncFields();update();feedback('已恢复 AI 背景和编辑位置，可继续拖动、缩放或补齐空白。');}finally{URL.revokeObjectURL(url);}}
 function markManual(){$('downloadResult').hidden=true;finalReview=null;decision('品牌图层已更新','保留你设置的大小、位置和遮挡关系，可直接导出。',currentPlan);$('resultBadge').textContent='图层已更新';$('canvasCaption').textContent='已保留当前主视觉构图，标题和 LOGO 可自由拖动。';$('exportNote').textContent='手动修改后的画面需再次目检；导出不含辅助线。';}
 function outputFilename(){const name=filename(s);return generated||finalReview?name:name.replace(/\.png$/,'-预览.png');}
 function objectPercent(){const r=objectRect();return s.selectedLayer==='source'?s.sourceZoom:r?r.w/s.w*100:100;}
 function syncEditor(){
  if(!objectRect()){const available=['source','title','logo'].find(type=>objectRect(type));if(available)s.selectedLayer=available;}
  const r=objectRect(),name=objectName(),disabled=!r||busy||uploading||restoring;
  $('objectSelect').options[0].textContent=generated?'AI 背景':'主视觉';
  for(const option of $('objectSelect').options)option.disabled=!objectRect(option.value);
  $('objectSelect').value=s.selectedLayer;$('objectSelect').disabled=busy||uploading||restoring||!(source||logo||title);
  for(const id of ['objectScale','objectScaleNumber','zoomOut','zoomIn','resetObject'])$(id).disabled=disabled;
  const value=objectPercent(),range=$('objectScale');range.min=Math.min(1,value);range.max=Math.max(s.selectedLayer==='source'?400:150,value);range.value=value;
  const metric=s.selectedLayer==='source'?'缩放':'宽度 / 画布';
  range.setAttribute('aria-label',name+metric+'百分比');range.setAttribute('aria-valuetext',value.toFixed(1)+'%');
  const input=$('objectScaleNumber');input.setAttribute('aria-label',name+metric+'百分比');if(document.activeElement!==input)input.value=Number(value.toFixed(2));
  $('zoomOut').setAttribute('aria-label','缩小'+name);$('zoomIn').setAttribute('aria-label','放大'+name);
  $('editorHint').textContent=!r?'上传主视觉、主标题或 LOGO 后即可调整。':mode==='original'?'原图预览中 · 选择对象或调整大小即可返回延展画布。':`${metric} ${Number(value.toFixed(1))}% · 拖动移动 · 拖四角等比缩放`;
 }
 function update(){
  const empty=!(source||logo||title);$('canvasEmpty').hidden=!empty;$('originalButton').disabled=!source;
  if(empty){$('resultBadge').textContent='等待上传素材';$('canvasCaption').textContent='上传自己的主视觉、主标题与 LOGO，自由构图。';$('exportNote').textContent='上传素材后即可编辑和导出 PNG。';}
  save();$('outputName').textContent=outputFilename();$('sizeMeta').textContent=`${s.w} × ${s.h} px · ${ratioText(s.w,s.h)}`;$('canvasSize').textContent=mode==='original'?`${source?.raw.w||0} × ${source?.raw.h||0} px · 原图`:`${s.w} × ${s.h} px`;
  $('sourceMeta').textContent=source?`${source.name} · 原图 ${source.raw.w} × ${source.raw.h} px`:'请上传主视觉';
  $('cropInfo').textContent=!source?'识别透明边、白边与均匀纯色边。':!s.trim?'已使用完整原图，可重新开启自动裁切。':source.w===source.raw.w&&source.h===source.raw.h?'未检测到可去除的外围空白，完整保留画面。':`已裁去外围空白：${source.w} × ${source.h} px；原图保留。`;
  for(const type of ['logo','title']){const a=assetFor(type);$(type+'Label').textContent=a?a.name:'PNG / WebP / JPG';$('remove'+(type==='logo'?'Logo':'Title')).hidden=!a;}
  $('scaleValue').textContent=s.scale+'%';const invalid=Boolean($('sizeError').textContent);$('downloadButton').disabled=busy||uploading||exporting||!(source||logo||title)||invalid;$('prepareDownload').disabled=$('downloadButton').disabled;$('prepareDownload').hidden=!supportsDirectSave(window);
  const complete=!!source;
  $('generateButton').disabled=busy||uploading||!complete||!aiReady||invalid;
  $('deviceInput').disabled=busy||uploading;$('localModelInput').disabled=busy||uploading;$('clearModel').disabled=busy;$('moebiusSteps').disabled=busy||uploading;$('cancelLocal').hidden=!(busy&&localAbort&&s.engine==='local');
  $('downloadLabel').textContent=exporting?'正在准备 PNG…':supportsDirectSave(window)?'选择位置并保存 PNG':'准备 PNG 下载文件';
  $('autoInfo').textContent=!complete?'请先上传主视觉；主标题与 LOGO 可按需置入。':autoPaused?'上次处理未完成，可按当前构图再次尝试。':'调整完成后点击按钮，AI 会按当前构图补齐背景，不会自动重排主视觉。';
  if(phase==='idle')decision(source?'先调整主视觉，再补景':'等待主视觉',source?'在画布中拖动主视觉，用四角或下方工具栏调整大小。确认后，AI 将保留你的构图并补齐空白。':'上传主视觉后即可调整大小和位置，再上传 LOGO 与主标题。');
  syncEditor();syncUndo();redraw();
 }
 function ratioText(w,h){const gcd=(a,b)=>b?gcd(b,a%b):a,d=gcd(w,h);return w/d<30&&h/d<30?`${w/d}:${h/d}`:`${(w/h).toFixed(2)}:1`;}
 function setTheme(v){if(!['navy','light','warm'].includes(v))v='navy';s.theme=v;root.dataset.theme=v;document.body.style.background=getComputedStyle(root).getPropertyValue('--bg');document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===v)));save();}
 function syncFields(){for(const [id,key] of Object.entries({eventName:'event',presetSelect:'preset',customW:'w',customH:'h',customPlatform:'platform',customMaterial:'material',anchorInput:'anchor',scaleInput:'scale',backgroundInput:'background',deviceInput:'device',localModelInput:'localModel',moebiusSteps:'moebiusSteps'}))$(id).value=s[key];for(const [id,key] of [['trimToggle','trim'],['autoAI','autoAI']])$(id).checked=s[key]!==false;$('customFields').hidden=s.preset!=='custom';setTheme(s.theme);}
 function scheduleAuto(){clearTimeout(autoTimer);if(!s.autoAI||autoPaused||!aiReady||busy||uploading||!source||!logo||!title||$('sizeError').textContent)return;feedback('素材已齐，即将由 AI 分析当前尺寸并自动完成延展…');autoTimer=setTimeout(()=>generateLocal(),2200);}
 $('presetSelect').innerHTML=presets.map(p=>`<option value="${p.id}">${p.id==='custom'?'自定义尺寸':p.platform+' · '+p.material}</option>`).join('');
 async function upload(file,type){
  if(!file||busy||uploading)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type))return feedback('请选择 PNG、JPG 或 WebP 图片。','error');if(file.size>20*1024*1024)return feedback('图片超过 20MB，请压缩后重试。','error');
  clearTimeout(autoTimer);uploading=true;update();let storageOK=true,changed=false;
  try{
   const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});const a=await loadAsset(url,file.name,type==='source'?'source':'brand');
   remember(type==='source'?'更换主视觉':type==='logo'?'更换 LOGO':'更换主标题');
   if(type==='source'){
    await clearGenerated();a.id=crypto.randomUUID();source=a;s.sourceZoom=100;s.sourceX=s.sourceY=50;
    s.example=false;s.selectedLayer='source';s.anchor='center';s.background='#ffffff';applyCrop();
   }else{if(type==='logo'){logo=a;s.showLogo=true;}else{title=a;s.showTitle=true;}delete s.layers[type];s.selectedLayer=type;}
   if(type==='source')invalidate();else markManual();changed=true;setMode('extended');syncFields();await dbPut(type,{url,name:file.name,id:a.id}).catch(()=>{storageOK=false;});feedback(storageOK?'素材已载入并保存在此浏览器。':'素材已载入，但浏览器存储空间不足；刷新前请先导出。',storageOK?'':'error');
  }catch(e){feedback('素材处理失败：'+(e.message||'图片无法读取'),'error');}
  finally{uploading=false;update();}
  if(changed&&(type==='source'||!generated))scheduleAuto();
 }
 $('uploadButton').onclick=()=>$('sourceFile').click();$('sourceFile').onchange=e=>{upload(e.target.files[0],'source');e.target.value='';};
 for(const type of ['logo','title']){
  $(type+'Button').onclick=()=>$(type+'File').click();$(type+'File').onchange=e=>{upload(e.target.files[0],type);e.target.value='';};
  $('remove'+(type==='logo'?'Logo':'Title')).onclick=()=>{if(busy||restoring||uploading)return;remember(type==='logo'?'移除 LOGO':'移除主标题');if(type==='logo'){logo=null;s.showLogo=false;}else{title=null;s.showTitle=false;}delete s.layers[type];dbPut(type,null).catch(()=>{});markManual();update();};
 }
 const drop=$('uploadButton');for(const evt of ['dragenter','dragover'])drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.add('dragging');});for(const evt of ['dragleave','drop'])drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.remove('dragging');if(evt==='drop')upload(e.dataTransfer.files[0],'source');});
 $('eventName').oninput=e=>{remember('修改活动名称','eventName');s.event=e.target.value;update();};
 $('presetSelect').onchange=e=>{remember('切换画布尺寸');const p=presets.find(p=>p.id===e.target.value);s={...s,...p,preset:p.id,sourceZoom:100,sourceX:50,sourceY:50};$('sizeError').textContent='';invalidate();syncFields();update();scheduleAuto();};
 for(const id of ['customW','customH'])$(id).oninput=()=>{clearTimeout(autoTimer);const w=Number($('customW').value),h=Number($('customH').value);if(!validateSize(w,h)){$('sizeError').textContent='宽高须为 64～8192 的整数，总像素不超过 2400 万。';update();return;}remember('修改画布尺寸',id);$('sizeError').textContent='';s.w=w;s.h=h;s.sourceZoom=100;s.sourceX=s.sourceY=50;invalidate();update();scheduleAuto();};
 for(const [id,key] of [['customPlatform','platform'],['customMaterial','material']])$(id).oninput=e=>{remember('修改物料名称',id);s[key]=e.target.value;update();};
 $('trimToggle').onchange=e=>{s.trim=e.target.checked;applyCrop();invalidate();update();scheduleAuto();};
 $('autoAI').onchange=e=>{s.autoAI=e.target.checked;clearTimeout(autoTimer);update();if(s.autoAI&&!currentPlan)scheduleAuto();else if(!s.autoAI)feedback('自动处理已关闭。点击主按钮即可开始 AI 分析与出图。');};

 for(const [id,key] of [['anchorInput','anchor'],['scaleInput','scale'],['backgroundInput','background']])$(id).oninput=e=>{remember('调整背景设置',id);s[key]=key==='scale'?Number(e.target.value):e.target.value;invalidate();update();};
 function changeSource(values,group=null){if(!source||busy||uploading||restoring||Object.entries(values).every(([k,v])=>s[k]===v))return;remember(generated?'调整 AI 背景':'调整主视觉',group);Object.assign(s,values);invalidate();setMode('extended');feedback(generated?'AI 背景位置已更新，已生成内容保持不变；可直接下载，或补齐新露出的空白。':'手动构图已更新。确认大小和位置后，点击“按当前构图 AI 补齐背景”。');}
 function setMode(v){mode=v;$('originalButton').setAttribute('aria-pressed',String(v==='original'));$('extendedButton').setAttribute('aria-pressed',String(v==='extended'));update();}
 $('originalButton').onclick=()=>setMode('original');$('extendedButton').onclick=()=>setMode('extended');document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>setTheme(b.dataset.themeChoice));
 function moveObject(type,r,group=null){
  if(busy||restoring||uploading||![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.w<=0||r.h<=0)return;
  if(type==='source'){if(source)changeSource(sourceTransformFromRect(s,activeVisual(),r),group);return;}
  const a=assetFor(type),current=objectRect(type);if(!a||!current)return;
  if(['x','y','w','h'].every(key=>Math.abs(current[key]-r[key])<1e-8))return;
  remember(type==='logo'?'调整 LOGO':'调整主标题',group);s.layers[type]=transformFromRect(s,constrainLayer(s,a,r));markManual();setMode('extended');
 }
 function changeSize(value,group=null){
  if(!Number.isFinite(value)||value<=0)return;
  if(s.selectedLayer==='source')changeSource({sourceZoom:value},group);
  else {const r=objectRect();if(r)moveObject(s.selectedLayer,resizeAboutCenter(r,value/100*s.w),group);}
 }
 function selectObject(type){if(busy||uploading||restoring)return;history.endGroup();s.selectedLayer=type;setMode('extended');}
 $('objectSelect').onchange=e=>selectObject(e.target.value);
 $('objectScale').oninput=e=>changeSize(Number(e.target.value),'object-scale');
 $('objectScale').onchange=()=>history.endGroup();
 $('objectScaleNumber').oninput=e=>{if(e.target.value!=='')changeSize(Number(e.target.value),'object-number');};
 $('objectScaleNumber').onblur=()=>{$('objectScaleNumber').value=Number(objectPercent().toFixed(2));history.endGroup();};
 $('zoomOut').onclick=()=>changeSize(objectPercent()/1.1);$('zoomIn').onclick=()=>changeSize(objectPercent()*1.1);
 $('resetObject').onclick=()=>{if(busy||restoring||uploading||!objectRect())return;if(s.selectedLayer==='source')changeSource({sourceZoom:100,sourceX:50,sourceY:50});else{remember('重置'+objectName());delete s.layers[s.selectedLayer];markManual();setMode('extended');}};
 for(const type of ['source','logo','title']){
  const el=$('handle'+type[0].toUpperCase()+type.slice(1));let drag=null;
  el.onpointerdown=e=>{
   if(e.button!==0||busy||restoring||uploading||!objectRect(type))return;e.preventDefault();selectObject(type);el.focus({preventScroll:true});
   drag={id:e.pointerId,x:e.clientX,y:e.clientY,r:objectRect(type),box:$('canvasFrame').getBoundingClientRect()};el.setPointerCapture(e.pointerId);
  };
  el.onpointermove=e=>{if(!drag||e.pointerId!==drag.id)return;const dx=(e.clientX-drag.x)/drag.box.width*s.w,dy=(e.clientY-drag.y)/drag.box.height*s.h;if(!dx&&!dy)return;moveObject(type,{...drag.r,x:drag.r.x+dx,y:drag.r.y+dy},'object-drag');};
  const finish=e=>{history.endGroup();if(drag&&e.pointerId===drag.id){drag=null;if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);}};
  el.onpointerup=finish;el.onpointercancel=finish;el.onlostpointercapture=()=>{drag=null;history.endGroup();};
  el.onclick=()=>{if(!busy&&!uploading&&!restoring){s.selectedLayer=type;update();}};
  el.onfocus=()=>{if(!drag&&!busy&&!uploading&&!restoring&&s.selectedLayer!==type)selectObject(type);};
  el.onkeydown=e=>{
   const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
   if(['+','=','-','_'].includes(e.key)){e.preventDefault();s.selectedLayer=type;changeSize(objectPercent()*(e.key==='-'||e.key==='_'?1/1.1:1.1));return;}
   if(!delta)return;e.preventDefault();s.selectedLayer=type;const r=objectRect(type),k=e.shiftKey?10:1;if(r)moveObject(type,{...r,x:r.x+delta[0]*k,y:r.y+delta[1]*k});
  };
 }
 for(const el of document.querySelectorAll('[data-corner]')){
  let resize=null;
  el.onpointerdown=e=>{const r=objectRect();if(e.button!==0||busy||uploading||restoring||!r)return;e.preventDefault();e.stopPropagation();history.endGroup();el.focus({preventScroll:true});resize={id:e.pointerId,type:s.selectedLayer,x:e.clientX,y:e.clientY,r,box:$('canvasFrame').getBoundingClientRect()};el.setPointerCapture(e.pointerId);};
  el.onpointermove=e=>{if(!resize||e.pointerId!==resize.id)return;const dx=(e.clientX-resize.x)/resize.box.width*s.w,dy=(e.clientY-resize.y)/resize.box.height*s.h;if(!dx&&!dy)return;moveObject(resize.type,resizeFromCorner(resize.r,el.dataset.corner,dx,dy),'object-resize');};
  const finish=e=>{history.endGroup();if(resize&&e.pointerId===resize.id){resize=null;if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);}};
  el.onpointerup=finish;el.onpointercancel=finish;el.onlostpointercapture=()=>{resize=null;history.endGroup();};
  el.onkeydown=e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();const r=objectRect(),k=e.shiftKey?10:1;if(r)moveObject(s.selectedLayer,resizeFromCorner(r,el.dataset.corner,delta[0]*k,delta[1]*k));};
 }
 $('copyName').onclick=async()=>{try{await navigator.clipboard.writeText(outputFilename());toast('文件名已复制');}catch{toast('复制未获浏览器授权，可选中文件名手动复制。');}};
 const toBlob=c=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('图片导出失败，请减小尺寸')),'image/png'));
 async function exportPNG(direct=true){
  if(!(source||logo||title)||busy||uploading||exporting||$('sizeError').textContent)return;
  clearTimeout(autoTimer);exporting=true;setMode('extended');const name=outputFilename(),width=s.w,height=s.h,c=document.createElement('canvas');
  try{
   let handle=null;
   if(direct&&supportsDirectSave(window)){try{handle=await choosePngFile(window,name);}catch(e){if(e.name==='AbortError'){toast('已取消保存，画布仍然保留。');return;}feedback('当前页面无法打开保存窗口，正在准备普通下载文件。');}}
   c.width=width;c.height=height;paint(c.getContext('2d'),width,height);const blob=await toBlob(c),previous=downloadURL;downloadURL=URL.createObjectURL(blob);
   $('exportImage').src=downloadURL;$('downloadFileName').textContent=name;$('downloadDimensions').textContent=`${width} × ${height} px · PNG`;$('downloadStatus').textContent='PNG 已准备好。';$('downloadResult').hidden=false;$('downloadAgain').hidden=true;$('serverImage').hidden=true;
   if(previous)setTimeout(()=>URL.revokeObjectURL(previous),30000);
   if(handle){await writePngFile(handle,blob);$('downloadStatus').textContent='已保存到你选择的位置：'+handle.name;toast('PNG 已写入你选择的文件。');}
   else{
    const link=$('downloadAgain');link.href=downloadURL;link.download=name;link.removeAttribute('target');link.hidden=false;
    $('downloadStatus').textContent='本机 PNG 已就绪，请点击“下载 PNG 文件”。图片未上传到服务器。';link.focus({preventScroll:true});$('downloadResult').scrollIntoView({block:'nearest',behavior:'smooth'});

   }
  }catch(e){const message=e.message||'保存未完成，请重试。';$('downloadStatus').textContent='保存未完成：'+message;feedback(message,'error');if(downloadURL){$('downloadResult').hidden=false;feedback(message+' 可点击“查看图片并另存”，右键保存图片。','error');}}
  finally{c.width=c.height=1;exporting=false;update();}
 }
 $('downloadButton').onclick=()=>exportPNG(true);$('prepareDownload').onclick=()=>exportPNG(false);
 $('downloadAgain').onclick=()=>{$('downloadStatus').textContent='已交由浏览器处理下载。若未出现文件，请点击“查看图片并另存”。';};
 $('openExport').onclick=()=>{$('exportDialog').showModal();};$('closeExport').onclick=()=>{$('exportDialog').close();};
 function setBusy(v){busy=v;$('sourceFields').disabled=v;$('aiFields').disabled=v;$('loadingOverlay').hidden=!v||restoring;$('generateLabel').textContent=v?'AI 正在补齐背景…':'按当前构图 AI 补齐背景';update();}
 async function refreshEngine(){
  const revision=++engineRefresh,moebius=s.localModel==='moebius';
  $('moebiusOptions').hidden=!moebius;
  $('engineHelp').textContent=moebius?'Moebius 扩散 · 免费开源：首次下载约 1.27 GB（含引擎），从 Hugging Face 下载并缓存在浏览器。仅开始补景时下载，素材不上传。':s.localModel==='lama'?'LaMa 增强：模型与引擎由本站提供，首次下载约 64 MB，加载时需要较多内存。适合背景结构和纹理补齐，首次处理较慢。':'MI-GAN 轻量：模型与引擎由本站提供，首次下载约 57 MB，速度更快，适合小面积补景。';
  $('modelLimits').textContent=moebius?'需要可用的 WebGPU 显卡和充足内存。大面积空白可能生成多余元素，建议分次扩展；可撤回重试。内部生成 512 × 512，再按所选尺寸合成，不会凭空增加原生清晰度。':'模型依据现有画面补景，不读取文字要求。大面积扩展仍可能失真；不满意可撤回并换模型重试。素材和计算留在本机，成品按所选尺寸导出。';
  aiReady=typeof Worker!=='undefined'&&typeof WebAssembly!=='undefined';
  if(moebius&&aiReady){
   aiReady=false;
   if(s.device==='cpu'){$('aiStatus').textContent='Moebius 需要显卡 · 请切换计算设备';update();return;}
   $('aiStatus').textContent='正在检测 WebGPU 显卡…';update();let adapter=null;
   try{adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});}catch{}
   if(revision!==engineRefresh)return;
   aiReady=!!adapter;$('aiStatus').textContent=aiReady?'Moebius · 显卡可用':'未检测到 WebGPU · 请选择 LaMa / MI-GAN';
  }else $('aiStatus').textContent=aiReady?(s.device==='cpu'?'本机 CPU · 可开始补景':navigator.gpu?'本机模式 · 运行时检测显卡':'本机模式 · 将使用 CPU'):'浏览器不支持本机计算，请更换浏览器';
  update();
 }
 $('localModelInput').onchange=async e=>{s.localModel=e.target.value;stopLocalEngine();save();await refreshEngine();feedback('已切换补景模型，当前画布和已生成背景保留。');};
 $('deviceInput').onchange=async e=>{s.device=e.target.value;stopLocalEngine();save();await refreshEngine();};
 $('moebiusSteps').onchange=e=>{s.moebiusSteps=Number(e.target.value);save();};
 $('clearModel').onclick=async()=>{await clearLocalModel();toast('模型缓存已清除，下次补景会重新下载；素材仍保留。');};
 $('cancelLocal').onclick=()=>localAbort?.abort();
 async function generateLocal(){
  if(busy||uploading||!source||!aiReady||$('sizeError').textContent)return;
  localAbort=new AbortController();let timer;
  try{
   setBusy(true);setMode('extended');setPhase('analyze');$('studioRoot').setAttribute('aria-busy','true');
   decision('识别当前画布空白','本机将按当前大小、位置与透明区域补景，保留标题和 LOGO 的独立图层。');
   const started=Date.now();timer=setInterval(()=>$('elapsedTime').textContent=`本机处理中 · ${Math.floor((Date.now()-started)/1000)} 秒`,1000);
   const visual=activeVisual(),r=layout(s,visual,logo,title).image,f=localFrame(s.w,s.h),image=document.createElement('canvas'),mask=document.createElement('canvas');image.width=mask.width=f.width;image.height=mask.height=f.height;
   const ic=image.getContext('2d'),mc=mask.getContext('2d');ic.fillStyle=s.background;ic.fillRect(0,0,f.width,f.height);
   const scaled={x:r.x/s.w*f.width,y:r.y/s.h*f.height,w:r.w/s.w*f.width,h:r.h/s.h*f.height};drawAsset(ic,visual,scaled);drawAsset(mc,visual,scaled);
   setPhase('compose');$('loadingTitle').textContent='准备本机补景';
   const result=await fillLocally(image,mask,{device:s.device,model:s.localModel,steps:s.moebiusSteps,signal:localAbort.signal,onProgress:(message)=>{$('loadingTitle').textContent=message;feedback(message);}});
   if(localAbort.signal.aborted)throw new DOMException('已停止本机补景，当前画布保持不变。','AbortError');
   $('cancelLocal').hidden=true;
   if(result.skipped){setPhase('done');decision('当前画布已铺满','未发现需要补齐的空白，可继续调整或直接下载。');$('resultBadge').textContent='画布已铺满';feedback('当前画布没有空白，无需运行模型。');return;}
   // Composite the unchanged visible source above model pixels. Brand layers are never baked in.
   const out=document.createElement('canvas'),k=Math.min(1,Math.sqrt(8000000/(s.w*s.h)),4096/Math.max(s.w,s.h));out.width=Math.max(1,Math.round(s.w*k));out.height=Math.max(1,Math.round(s.h*k));
   const oc=out.getContext('2d');oc.drawImage(result.canvas,0,0,out.width,out.height);drawAsset(oc,visual,{x:r.x/s.w*out.width,y:r.y/s.h*out.height,w:r.w/s.w*out.width,h:r.h/s.h*out.height});
   remember('本机 AI 补景');generated=generatedAsset(out,s.w,s.h);s.sourceZoom=100;s.sourceX=s.sourceY=50;currentPlan=finalReview=null;blendedSource=null;updateVisualPlacement();syncEditor();save();await storeGenerated();
   setPhase('done');decision('本机补景完成','已合成原主视觉与独立品牌图层。可继续移动背景、缩放，再补齐新空白；请自行检查接缝与细节。');$('resultBadge').textContent='本机补景完成';$('canvasCaption').textContent='背景已保存，可继续拖动、缩放；主标题与 LOGO 仍是独立图层。';$('exportNote').textContent='补景和导出均在本机完成，导出保持所选像素尺寸；请自行检查画面细节。';feedback(modelLabels[result.model]+' · '+result.device+'已完成补景。效果不满意可点击“撤回上一步”。','success');
  }catch(e){setPhase('error');decision(e.name==='AbortError'?'本机补景已停止':'本机补景未完成',e.message);feedback(e.message,e.name==='AbortError'?'':'error');$('resultBadge').textContent=generated?'已有背景已保留':'当前画布已保留';}
  finally{clearInterval(timer);localAbort=null;$('studioRoot').removeAttribute('aria-busy');setBusy(false);}
 }
 $('generateButton').onclick=()=>generateLocal();
 new ResizeObserver(redraw).observe($('artboard'));
 try{
  syncFields();const stored=await Promise.all(['source','logo','title'].map(dbGet));let failed=false;
  // Restore only files uploaded in this browser; the retired bundled example has no fallback.
  for(const [i,type] of ['source','logo','title'].entries()){
   const item=stored[i];if(!item?.url?.startsWith('data:image/')||item.id==='example-master-v1'||(type==='source'&&legacyExample)||(type==='logo'&&s.showLogo===false)||(type==='title'&&s.showTitle===false))continue;
   try{const a=await loadAsset(item.url,item.name,type==='source'?'source':'brand');a.id=item.id||(type==='source'?'legacy-upload':undefined);if(type==='source')source=a;else if(type==='logo')logo=a;else title=a;}catch{failed=true;}
  }
  const previousBackground=await dbGet('generated');if(previousBackground?.sourceId==='example-master-v1')await dbPut('generated',null).catch(()=>{});
  applyCrop();invalidate();syncFields();update();await restoreGenerated();
  if(failed)feedback('部分已保存素材无法载入，请重新上传。','error');
  else if(!generated)feedback(source||logo||title?'已恢复你在此浏览器上传的素材，可继续编辑。':'上传你的主视觉开始制作，主标题与 LOGO 可按需置入。');
 }catch{feedback('素材载入失败，请上传一张主视觉。','error');}
 await refreshEngine();update();
}
