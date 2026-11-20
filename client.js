import {toModelInput,toLamaInput,toRGBA,squareFrame} from './core.js';
import {MOEBIUS_CACHE} from './moebius-cache.js';
let worker=null;
export function stopLocalEngine(){worker?.terminate();worker=null;}
export async function clearLocalModel(){stopLocalEngine();if('caches' in window)await Promise.all(['kv-local-ai-v2','kv-local-model-v1',MOEBIUS_CACHE].map(k=>caches.delete(k)));}
// Letterbox instead of stretching the picture into the model's square input.
function squareCanvas(original,frame){
 const c=document.createElement('canvas');c.width=c.height=frame.side;const x=c.getContext('2d'),{x:left,y:top,w,h,side}=frame;
 x.drawImage(original,0,0,original.width,original.height,left,top,w,h);
 if(top){x.drawImage(original,0,0,original.width,1,left,0,w,top);x.drawImage(original,0,original.height-1,original.width,1,left,top+h,w,side-top-h);}
 if(left){x.drawImage(original,0,0,1,original.height,0,top,left,h);x.drawImage(original,original.width-1,0,1,original.height,left+w,top,side-left-w,h);}
 return c;
}
export function fillLocally(image,mask,{device='auto',model='lama',steps=20,onProgress=()=>{},signal}={}){
 const outputWidth=image.width,outputHeight=image.height;
 const check=toModelInput(image.getContext('2d').getImageData(0,0,outputWidth,outputHeight).data,mask.getContext('2d').getImageData(0,0,outputWidth,outputHeight).data,outputWidth,outputHeight);
 if(!check.holes)return Promise.resolve({canvas:image,device:'无需补景',skipped:true});
 const frame=model!=='migan'?squareFrame(outputWidth,outputHeight):null;
 if(frame){image=squareCanvas(image,frame);mask=squareCanvas(mask,frame);}
 const width=image.width,height=image.height;
 const input=frame?toLamaInput(image.getContext('2d').getImageData(0,0,width,height).data,mask.getContext('2d').getImageData(0,0,width,height).data,width,height):check;
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new DOMException('已停止本机补景','AbortError'));
  worker??=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  const abort=()=>{stopLocalEngine();reject(new DOMException('已停止本机补景，当前画布保持不变。','AbortError'));};
  signal?.addEventListener('abort',abort,{once:true});const finish=()=>signal?.removeEventListener('abort',abort);
  worker.onerror=()=>{finish();stopLocalEngine();reject(Error('本机计算引擎无法启动。请刷新页面，或选择 CPU 模式重试。'));};
  worker.onmessage=({data})=>{
   if(data.type==='progress')return onProgress(data.message,data);
   finish();
   if(data.type==='error'){stopLocalEngine();return reject(Error(data.message));}
   if(data.type==='result'){
    try{
     const raw=document.createElement('canvas');raw.width=data.width;raw.height=data.height;
     raw.getContext('2d').putImageData(new ImageData(toRGBA(new Uint8Array(data.image),data.width,data.height),data.width,data.height),0,0);
     let canvas=raw;
     if(frame){canvas=document.createElement('canvas');canvas.width=outputWidth;canvas.height=outputHeight;canvas.getContext('2d').drawImage(raw,frame.x,frame.y,frame.w,frame.h,0,0,outputWidth,outputHeight);}
     resolve({canvas,device:data.device,model:data.model,skipped:false});
    }catch(e){stopLocalEngine();reject(e);}
   }
  };
  worker.postMessage({width,height,image:input.image.buffer,mask:input.mask.buffer,device,model,steps,seed:crypto.getRandomValues(new Uint32Array(1))[0]},[input.image.buffer,input.mask.buffer]);
 });
}
