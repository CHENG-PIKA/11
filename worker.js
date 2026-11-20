import * as ort from './ort130.webgpu.min.mjs';
import {lamaToRGB} from './core.js';
import {runMoebius} from './moebius-pipeline.js';
import {loadMoebiusFile} from './moebius-cache.js';

ort.env.wasm.wasmPaths={mjs:new URL('./ort130-asyncify.mjs',import.meta.url).href};
ort.env.wasm.numThreads=1;
ort.env.logLevel='error';
ort.env.webgpu.powerPreference='high-performance';
let session=null,sessionKey='',running=false,runtimeReady=false;
const progress=(message,extra={})=>postMessage({type:'progress',message,...extra});
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function downloadBundle(file,label){
 const response=await fetch(new URL(file,import.meta.url));if(!response.ok)throw Error(`${label}清单读取失败，请刷新页面重试。`);
 const manifest=await response.json();let cache=null;
 try{cache=await caches.open('kv-local-ai-v2');}catch{}
 const output=new Uint8Array(manifest.bytes);let offset=0;
 for(const part of manifest.parts){
  const url=new URL(part.path,import.meta.url).href;let bytes;
  const cached=await cache?.match(url).catch(()=>null);
  if(cached){bytes=new Uint8Array(await cached.arrayBuffer());progress(`正在读取已缓存的${label}…`);}
  else{
   const res=await fetch(url);if(!res.ok||!res.body)throw Error(`${label}下载失败，请检查网络后重试。`);
   const reader=res.body.getReader();bytes=new Uint8Array(part.bytes);let n=0;
   try{for(;;){const {value,done}=await reader.read();if(done)break;if(n+value.length>part.bytes)throw Error(`${label}文件大小异常。`);bytes.set(value,n);n+=value.length;progress(`正在下载${label}：${Math.round((offset+n)/manifest.bytes*100)}%`,{loaded:offset+n,total:manifest.bytes});}}finally{reader.releaseLock();}
   if(n!==part.bytes)throw Error(`${label}下载不完整，请重试。`);
  }
  if(bytes.length!==part.bytes||(crypto.subtle&&hex(await crypto.subtle.digest('SHA-256',bytes))!==part.sha256)){await cache?.delete(url);throw Error(`${label}缓存校验失败，请再次点击生成以重新下载。`);}
  if(!cached)await cache?.put(url,new Response(bytes)).catch(()=>{});
  output.set(bytes,offset);offset+=bytes.length;
 }
 return output;
}
async function getSession(device,model){
 const key=model+':'+device;if(session&&sessionKey===key)return session;
 if(session){await session.release();session=null;}
 let useGPU=false;
 if(device!=='cpu'&&navigator.gpu){try{useGPU=!!(await navigator.gpu.requestAdapter({powerPreference:'high-performance'}));}catch{}}
 if(device==='gpu'&&!useGPU)throw Error('当前浏览器没有可用的 WebGPU 显卡，请选择 CPU 模式。');
 if(!runtimeReady){ort.env.wasm.wasmBinary=await downloadBundle('./runtime.json','计算引擎');runtimeReady=true;}
 const bytes=await downloadBundle(model==='lama'?'./lama.json':'./model.json',model==='lama'?'LaMa 模型':'MI-GAN 模型');
 const options={graphOptimizationLevel:'all',...(model==='lama'?{extra:{session:{disable_quant_qdq:'1'}}}:{})};
 progress(`正在初始化 ${model==='lama'?'LaMa 增强':'MI-GAN 轻量'} · ${useGPU?'显卡':'CPU'}，首次运行可能较慢…`);
 try{session=await ort.InferenceSession.create(bytes,{...options,executionProviders:useGPU?['webgpu','wasm']:['wasm']});}
 catch(error){console.error('Local engine initialization:',error);if(!useGPU||device==='gpu')throw Error('本机引擎启动失败，请关闭占用内存的标签页，或改用 MI-GAN 轻量模型 / CPU。');progress('显卡初始化未成功，正在改用本地 CPU…');session=await ort.InferenceSession.create(bytes,{...options,executionProviders:['wasm']});useGPU=false;}
 sessionKey=key;session.localLabel=useGPU?'本地显卡 / CPU 协同':'本地 CPU';return session;
}
onmessage=async({data})=>{
 if(running)return;running=true;const tensors=[];
 try{
  const {width,height,image,mask,device='auto',model='lama',steps=20,seed=0}=data,l=model!=='migan',unit=l?4:1;
  if(!['lama','migan','moebius'].includes(model)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>2400000||(l&&(width!==512||height!==512))||image.byteLength!==width*height*3*unit||mask.byteLength!==width*height*unit)throw Error('本地补景画布数据无效。');
  if(model==='moebius'){
   if(device==='cpu')throw Error('Moebius 需要本机显卡。请选择“自动”或“显卡”，仅使用 CPU 时请选择 LaMa / MI-GAN。');
   if(![20,30,40].includes(steps))throw Error('Moebius 补景步数无效。');
   progress('正在检测 Moebius 所需的 WebGPU 显卡…');
   const adapter=await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
   if(!adapter)throw Error('此浏览器没有可用的 WebGPU 显卡。可在开启硬件加速的新版 Chrome / Edge 中重试，或选择 LaMa。');
   ort.env.webgpu.adapter=adapter;
   if(session){await session.release();session=null;sessionKey='';}
   if(!runtimeReady){ort.env.wasm.wasmBinary=await downloadBundle('./runtime.json','计算引擎');runtimeReady=true;}
   const response=await fetch(new URL('./moebius.json',import.meta.url));if(!response.ok)throw Error('Moebius 模型清单读取失败，请刷新页面。');
   const manifest=await response.json();
   const pixels=await runMoebius({ort,image:new Float32Array(image),mask:new Float32Array(mask),steps,seed,onProgress:progress,
    load:(name,label)=>{const file=manifest.files.find(v=>v.name===name);if(!file)throw Error('Moebius 模型清单不完整。');return loadMoebiusFile(file,label,progress);}
   });
   postMessage({type:'result',image:pixels.buffer,width,height,device:'本地显卡 / CPU 协同',model},[pixels.buffer]);return;
  }
  let engine=await getSession(device,model);progress(`${l?'LaMa 增强':'MI-GAN 轻量'} · ${engine.localLabel}正在补齐背景…`,{device:engine.localLabel});
  const input=new ort.Tensor(l?'float32':'uint8',l?new Float32Array(image):new Uint8Array(image),[1,3,height,width]),known=new ort.Tensor(l?'float32':'uint8',l?new Float32Array(mask):new Uint8Array(mask),[1,1,height,width]);tensors.push(input,known);
  let result;
  try{result=await engine.run({image:input,mask:known});}
  catch(error){if(device!=='auto'||engine.localLabel==='本地 CPU')throw error;progress('显卡运算未成功，正在使用本机 CPU 重试…');engine=await getSession('cpu',model);result=await engine.run({image:input,mask:known});}
  const output=result.output||result.result||Object.values(result)[0];tensors.push(...Object.values(result));
  if(output.type!==(l?'float32':'uint8')||output.data.length!==width*height*3)throw Error('模型返回的图片格式不匹配，当前画布已保留。');
  const pixels=l?lamaToRGB(output.data,width,height):new Uint8Array(output.data);postMessage({type:'result',image:pixels.buffer,width,height,device:engine.localLabel,model},[pixels.buffer]);
 }catch(e){console.error('Local inference:',e);postMessage({type:'error',message:typeof e?.message==='string'&&e.message.length<240?e.message:'本机模型运行失败，当前画布已保留。请选择 CPU 或 MI-GAN 轻量模型后重试。'});}
 finally{for(const t of tensors)try{t.dispose();}catch{}running=false;}
};
