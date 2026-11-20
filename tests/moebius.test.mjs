import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDDIM,ddimStep,initialLatents,prepareMoebius,cfgInput,guidedNoise,decodedRGB} from '../moebius-core.js';
import {loadMoebiusFile} from '../moebius-cache.js';
import {runMoebius} from '../moebius-pipeline.js';

test('Moebius DDIM matches the upstream 20-step strength .99 fixture and analytic final step',()=>{
 const schedule=makeDDIM(20);
 assert.deepEqual(schedule.timesteps,[900,850,800,750,700,650,600,550,500,450,400,350,300,250,200,150,100,50,0]);
 assert.ok(Math.abs(schedule.alphas[0]-.99915)<1e-12);
 const out=ddimStep(new Float32Array([0]),new Float32Array([1]),0,-1,schedule);
 assert.ok(Math.abs(out[0]-1/Math.sqrt(.99915))<1e-7);
 assert.equal(makeDDIM(30).timesteps.length,29);assert.equal(makeDDIM(40).timesteps.length,39);
 assert.throws(()=>makeDDIM(1000000));
});
test('Moebius masks holes to zero in normalized space and uses PyTorch nearest latent masks',()=>{
 const n=512*512,image=new Float32Array(n*3).fill(1),mask=new Float32Array(n);
 mask[0]=1;mask[8*512+8]=1;
 const {masked,smallMask}=prepareMoebius(image,mask);
 assert.equal(masked[0],0);assert.equal(masked[n],0);assert.equal(masked[1],1);
 assert.equal(smallMask[0],1);assert.equal(smallMask[65],1);assert.equal(smallMask[1],0);
});
test('Moebius CFG channels and unconditional/conditional ordering are correct',()=>{
 const n=64*64,a=new Float32Array(4*n).fill(.1),m=new Float32Array(n).fill(.2),b=new Float32Array(4*n).fill(.3);
 const input=cfgInput(a,m,b,900);
 assert.deepEqual([...input.ids],[10n,11n,12n,13n,14n,15n,16n,17n,18n,19n,0n,1n,2n,3n,4n,5n,6n,7n,8n,9n]);
 assert.equal(input.latent[4*n],m[0]);assert.equal(input.latent[5*n],b[0]);assert.deepEqual(input.latent.slice(0,9*n),input.latent.slice(9*n));
 const noise=new Float32Array(8*n);noise.fill(2,0,4*n);noise.fill(3,4*n);assert.ok(guidedNoise(noise).every(x=>x===4));
 assert.deepEqual(initialLatents(7),initialLatents(7));assert.notDeepEqual(initialLatents(7),initialLatents(8));
});
test('Moebius output rejects numerical failures instead of replacing a usable canvas',()=>{
 const data=new Float32Array(3*512*512);data[0]=-2;data[1]=2;
 const rgb=decodedRGB(data);assert.equal(rgb[0],0);assert.equal(rgb[1],255);assert.equal(rgb[2],128);
 data[100]=NaN;assert.throws(()=>decodedRGB(data));
});
test('large-model cache streams into bounded blocks, detects corruption, and handles truncated downloads',async()=>{
 const map=new Map(),cache={match:async k=>map.get(k)?.clone(),put:async(k,r)=>{map.set(k,r);},delete:async k=>map.delete(k)};
 const file={url:'https://model.invalid/commit/model.onnx',bytes:9};let fetches=0;
 const fetch=async()=>{fetches++;return new Response(Uint8Array.from([1,2,3,4,5,6,7,8,9]));};
 assert.equal((await loadMoebiusFile(file,'test',()=>{},{cache,fetch}))[8],9);
 await loadMoebiusFile(file,'test',()=>{},{cache,fetch});assert.equal(fetches,1);
 map.set(file.url+'?kv-block=0',new Response(new Uint8Array(1)));
 await loadMoebiusFile(file,'test',()=>{},{cache,fetch});assert.equal(fetches,2);
 await assert.rejects(loadMoebiusFile(file,'test',()=>{},{cache:null,fetch:async()=>new Response(new Uint8Array(1))}),/不完整/);
});
test('model manifest pins the general checkpoint and declares all three actual file sizes',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../moebius.json',import.meta.url)));
 assert.equal(manifest.files.reduce((n,f)=>n+f.bytes,0),1241534741);
 assert.deepEqual(manifest.files.map(f=>f.name).sort(),['unet.onnx','vae_decoder.onnx','vae_encoder.onnx']);
 for(const file of manifest.files){assert.ok(file.url.includes('/'+manifest.revision+'/'));assert.match(file.sha256,/^[a-f0-9]{64}$/);}
});
test('pipeline releases every tensor and session, including failed inference',async()=>{
 let tensors=0,sessions=0;
 class Tensor{constructor(type,data,dims){this.type=type;this.data=data;this.dims=dims;tensors++;}dispose(){tensors--;}}
 const ort={Tensor,InferenceSession:{create:async()=>{sessions++;return {run:async()=>{throw Error('GPU lost');},release:async()=>{sessions--;}};}}};
 await assert.rejects(runMoebius({ort,load:async()=>new Uint8Array(1),image:new Float32Array(3*512*512),mask:new Float32Array(512*512),seed:7}),/GPU lost/);
 assert.equal(tensors,0);assert.equal(sessions,0);
});
