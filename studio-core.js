export const presets = [
 {id:'xiaohongshu',platform:'小红书',material:'图文封面',w:1080,h:1440},
 {id:'wechat',platform:'微信公众号',material:'封面',w:900,h:383},
 {id:'led',platform:'现场LED',material:'主屏',w:1920,h:1080},
 {id:'story',platform:'视频号',material:'竖版封面',w:1080,h:1920},
 {id:'square',platform:'社交媒体',material:'方形海报',w:1080,h:1080},
 {id:'mobile',platform:'手机传播',material:'全屏海报',w:1125,h:2436},
 {id:'custom',platform:'自定义',material:'海报',w:1080,h:1440}
];
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function clean(v){return String(v||'未命名').trim().replace(/[\\/:*?"<>|\s\x00-\x1f]+/g,'-').replace(/^\.+|\.+$/g,'')||'未命名';}
export function filename(s){return `${clean(s.event)}-${clean(s.platform)}-${clean(s.material)}-${s.w}x${s.h}px.png`;}
export function validateSize(w,h){return Number.isInteger(w)&&Number.isInteger(h)&&w>=64&&h>=64&&w<=8192&&h<=8192&&w*h<=24000000;}
// Keep model pixels separate from the intended canvas ratio, including padded AI frames.
export function generatedAsset(img,w,h){const raw={x:0,y:0,w:img.naturalWidth||img.width,h:img.naturalHeight||img.height};return {img,name:'AI 背景',raw,crop:{...raw},logicalSize:{w,h},w,h,hasTransparency:false};}
export function manualSourceRect(s,source){const fit=contain(source.w,source.h,{x:0,y:0,w:s.w,h:s.h},'center');const zoom=Number(s.sourceZoom),k=Number.isFinite(zoom)&&zoom>0?zoom/100:1,w=fit.w*k,h=fit.h*k;const x=Number(s.sourceX??50),y=Number(s.sourceY??50);return {x:(Number.isFinite(x)?x:50)/100*s.w-w/2,y:(Number.isFinite(y)?y:50)/100*s.h-h/2,w,h};}
export function contain(iw,ih,box,anchor='center',scale=1){const k=Math.min(box.w/iw,box.h/ih)*clamp(scale,.35,1);const w=iw*k,h=ih*k;return {x:box.x+(box.w-w)/2,y:box.y+(anchor==='top'?0:anchor==='bottom'?box.h-h:(box.h-h)/2),w,h};}
export function constrainLayer(s,asset,r){const w=Number.isFinite(r.w)&&r.w>0?r.w:asset.w;return {x:Number.isFinite(r.x)?r.x:0,y:Number.isFinite(r.y)?r.y:0,w,h:w*asset.h/asset.w};}
export function transformFromRect(s,r){return {x:(r.x+r.w/2)/s.w,y:(r.y+r.h/2)/s.h,w:r.w/s.w};}
export function layout(s,source,logo,title){
 const safe={x:0,y:0,w:s.w,h:s.h},portrait=s.h/s.w>1.1;
 // Brand layers are independent of the source placement and generated background.
 const slot=s.sourcePlacement;const image=slot?{x:slot.x*s.w,y:slot.y*s.h,w:slot.w*s.w,h:slot.h*s.h}:source?contain(source.w,source.h,safe,s.anchor,(s.scale??100)/100):null,layers=[];
 for(const [type,asset] of [['logo',logo],['title',title]]){
  if(!asset)continue;
  const box=type==='logo'?{x:s.w*.05,y:s.h*.05,w:s.w*.19,h:s.h*.13}:portrait?{x:safe.x+safe.w*.06,y:safe.y+safe.h*.12,w:safe.w*.88,h:safe.h*.25}:{x:safe.x,y:safe.y+safe.h*.18,w:safe.w*.4,h:safe.h*.62};
  let r=contain(asset.w,asset.h,box,type==='logo'?'top':'center');
  const t=s.layers?.[type];
  if(t&&[t.x,t.y,t.w].every(Number.isFinite)&&t.w>0){const w=t.w*s.w,h=w*asset.h/asset.w;r={x:t.x*s.w-w/2,y:t.y*s.h-h/2,w,h};}
  layers.push({type,...constrainLayer(s,asset,r)});
 }
 return {safe,image,layers};
}
// Conservative edge trim: only transparent or uniform edge-connected rows/columns.
// It is not semantic subject detection. Any contrasting detail stops that edge.
export function detectContentBounds({data,width:w,height:h},{solid=true,tolerance=8,padding=0.005}={}){
 let l=w,t=h,r=-1,b=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(data[(y*w+x)*4+3]>5){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}}
 if(r<0)return {x:0,y:0,w,h,empty:true,changed:false};
 const alpha={l,t,r,b};
 const pixel=(x,y)=>{const i=(y*w+x)*4;return [data[i],data[i+1],data[i+2],data[i+3]];};
 const blank=(x,y,c)=>{const p=pixel(x,y);return p[3]<=5||(p[3]>=245&&c[3]>=245&&Math.max(Math.abs(p[0]-c[0]),Math.abs(p[1]-c[1]),Math.abs(p[2]-c[2]))<=tolerance);};
 const row=(y,c)=>{for(let x=l;x<=r;x++)if(!blank(x,y,c))return false;return true;};
 const col=(x,c)=>{for(let y=t;y<=b;y++)if(!blank(x,y,c))return false;return true;};
 if(solid){
  const top=pixel(Math.round((l+r)/2),t),bottom=pixel(Math.round((l+r)/2),b);
  while(t<b&&row(t,top))t++;
  while(b>t&&row(b,bottom))b--;
  const left=pixel(l,Math.round((t+b)/2)),right=pixel(r,Math.round((t+b)/2));
  while(l<r&&col(l,left))l++;
  while(r>l&&col(r,right))r--;
  // Do not collapse an empty/near-uniform canvas to a strip or invent a subject.
  if(r-l<4||b-t<4){({l,t,r,b}=alpha);}
 }
 const p=Math.ceil(Math.max(w,h)*padding);l=Math.max(0,l-p);t=Math.max(0,t-p);r=Math.min(w-1,r+p);b=Math.min(h-1,b+p);
 return {x:l,y:t,w:r-l+1,h:b-t+1,empty:false,changed:l>0||t>0||r<w-1||b<h-1};
}
export function generationFrame(w,h){
 if(!validateSize(w,h))throw Error('目标画布尺寸无效。');
 // Pad only the intermediate API frame; retain the exact user's output viewport.
 const fw=Math.max(w,h/3),fh=Math.max(h,w/3),scale=Math.max(Math.min(1024/Math.max(fw,fh),Math.sqrt(1000000/(fw*fh))),Math.sqrt(655360/(fw*fh)));
 const gw=Math.max(512,Math.ceil(fw*scale/16)*16),gh=Math.max(512,Math.ceil(fh*scale/16)*16),k=Math.min(gw/w,gh/h);
 return {w:gw,h:gh,viewport:{x:(gw-w*k)/2,y:(gh-h*k)/2,w:w*k,h:h*k},scale:k};
}
