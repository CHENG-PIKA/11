// Adapted from simonw/moebius-web (Apache-2.0); see MOEBIUS-NOTICE.md.
// Pure numeric operations shared by the browser pipeline and regression tests.
export const IMAGE_SIZE=512,LATENT_SIZE=64,SCALE=.13025;
export function makeDDIM(steps=20){
 if(![20,30,40].includes(steps))throw Error('补景步数无效。');
 const alphas=new Float64Array(1000),a=Math.sqrt(.00085),b=Math.sqrt(.012);let acc=1;
 for(let i=0;i<1000;i++){const beta=a+(b-a)*i/999;acc*=1-beta*beta;alphas[i]=acc;}
 const ratio=Math.floor(1000/steps),timesteps=Array.from({length:steps},(_,i)=>i*ratio).reverse().slice(steps-Math.floor(steps*.99));
 return {alphas,timesteps};
}
export function ddimStep(eps,sample,t,previous,schedule){
 const at=schedule.alphas[t],ap=previous<0?1:schedule.alphas[previous],out=new Float32Array(sample.length);
 for(let i=0;i<out.length;i++)out[i]=Math.sqrt(ap)*(sample[i]-Math.sqrt(1-at)*eps[i])/Math.sqrt(at)+Math.sqrt(1-ap)*eps[i];
 return out;
}
export function randn(n,seed){
 let s=seed>>>0;const rng=()=>{s|=0;s=(s+0x6d2b79f5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
 const out=new Float32Array(n);for(let i=0;i<n;i++){let u=0,v=0;while(!u)u=rng();while(!v)v=rng();out[i]=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}return out;
}
export function initialLatents(seed){
 const out=randn(4*64*64,seed),offset=randn(4,seed^0x9e3779b9);
 for(let i=0;i<out.length;i++)out[i]+=.0357*offset[Math.floor(i/(64*64))];return out;
}
export function prepareMoebius(image,mask){
 const n=512*512;if(image.length!==n*3||mask.length!==n)throw Error('Moebius 输入尺寸不正确。');
 const masked=new Float32Array(n*3),smallMask=new Float32Array(64*64);
 for(let i=0;i<masked.length;i++)masked[i]=(image[i]*2-1)*(1-mask[i%n]);
 // Match PyTorch nearest interpolation: top-left of each 8×8 cell.
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)smallMask[y*64+x]=mask[y*8*512+x*8];
 return {masked,smallMask};
}
export function cfgInput(latents,mask,maskedLatents,t){
 const plane=64*64,nine=new Float32Array(9*plane),batch=new Float32Array(18*plane);
 nine.set(latents);nine.set(mask,4*plane);nine.set(maskedLatents,5*plane);batch.set(nine);batch.set(nine,nine.length);
 const ids=new BigInt64Array(20);for(let i=0;i<10;i++){ids[i]=BigInt(i+10);ids[i+10]=BigInt(i);}
 return {latent:batch,timesteps:new BigInt64Array([BigInt(t),BigInt(t)]),ids};
}
export function guidedNoise(noise,guidance=2){
 const n=4*64*64;if(noise.length!==2*n)throw Error('Moebius 噪声预测尺寸不正确。');
 const out=new Float32Array(n);for(let i=0;i<n;i++)out[i]=noise[i]+guidance*(noise[n+i]-noise[i]);return out;
}
export function decodedRGB(values){
 if(values.length!==3*512*512)throw Error('Moebius 输出尺寸不正确。');
 const out=new Uint8Array(values.length);for(let i=0;i<out.length;i++){
  if(!Number.isFinite(values[i]))throw Error('Moebius 返回异常像素，当前画布已保留。可重试或切换 LaMa。');
  out[i]=Math.round(Math.max(0,Math.min(1,(values[i]+1)/2))*255);
 }return out;
}
