// Moebius FP32: staged loading keeps only one model session resident at a time.
// Adapted from simonw/moebius-web, Apache-2.0. See MOEBIUS-NOTICE.md.
import {SCALE,makeDDIM,ddimStep,initialLatents,prepareMoebius,cfgInput,guidedNoise,decodedRGB} from './moebius-core.js';

async function infer(session,feeds,outputName){
 let result;
 try{
  result=await session.run(feeds);const output=result[outputName];
  if(!output||output.type!=='float32')throw Error('Moebius 模型输出不匹配。');
  const data=Float32Array.from(output.data);
  if(data.some(v=>!Number.isFinite(v)))throw Error('Moebius 运算出现异常数值，当前画布已保留。');
  return data;
 }finally{for(const tensor of [...Object.values(feeds),...Object.values(result||{})])tensor.dispose();}
}
export async function runMoebius({ort,load,image,mask,steps=20,seed,onProgress=()=>{},executionProviders=['webgpu','wasm']}){
 const schedule=makeDDIM(steps),{masked,smallMask}=prepareMoebius(image,mask);
 let session;
 const open=async(name,label)=>{
  const bytes=await load(name,label);onProgress(`正在初始化 Moebius ${label}…`);
  return ort.InferenceSession.create(bytes,{executionProviders,graphOptimizationLevel:'all'});
 };
 const release=async()=>{if(session){const current=session;session=null;await current.release();}};
 try{
  session=await open('vae_encoder.onnx','图像编码器');onProgress('Moebius · 正在理解当前构图…');
  const moments=await infer(session,{image:new ort.Tensor('float32',masked,[1,3,512,512])},'moments');
  if(moments.length!==8*64*64)throw Error('Moebius 图像编码尺寸不正确。');
  const maskedLatents=Float32Array.from(moments.subarray(0,4*64*64),x=>x*SCALE);await release();
  session=await open('unet.onnx','扩散模型');let latents=initialLatents(seed);
  for(let i=0;i<schedule.timesteps.length;i++){
   const t=schedule.timesteps[i],previous=schedule.timesteps[i+1]??-1;
   onProgress(`Moebius 正在补景 · ${i+1} / ${schedule.timesteps.length} 步`,{step:i+1,total:schedule.timesteps.length});
   const input=cfgInput(latents,smallMask,maskedLatents,t);
   const noise=await infer(session,{
    latent:new ort.Tensor('float32',input.latent,[2,9,64,64]),
    timesteps:new ort.Tensor('int64',input.timesteps,[2]),
    input_ids:new ort.Tensor('int64',input.ids,[2,10])
   },'noise');
   latents=ddimStep(guidedNoise(noise),latents,t,previous,schedule);
  }
  await release();session=await open('vae_decoder.onnx','图像解码器');onProgress('Moebius · 正在还原背景细节…');
  const decoded=await infer(session,{latent:new ort.Tensor('float32',Float32Array.from(latents,x=>x/SCALE),[1,4,64,64])},'image');
  return decodedRGB(decoded);
 }finally{await release();}
}
