// Cache in 16 MiB blocks so storing a 907 MB file does not duplicate it in memory.
export const MOEBIUS_CACHE='kv-moebius-fp32-v1';
const BLOCK=16*1024*1024;
const blockURL=(file,index)=>`${file.url}?kv-block=${index}`;
export async function loadMoebiusFile(file,label,onProgress=()=>{},deps={}){
 const fetcher=deps.fetch||fetch;let cache=deps.cache;
 if(cache===undefined){try{cache=await caches.open(MOEBIUS_CACHE);}catch{cache=null;}}
 const output=new Uint8Array(file.bytes),count=Math.ceil(file.bytes/BLOCK);
 let complete=!!cache;
 for(let i=0;complete&&i<count;i++){
  const hit=await cache.match(blockURL(file,i));if(!hit){complete=false;break;}
  const part=new Uint8Array(await hit.arrayBuffer()),expected=Math.min(BLOCK,file.bytes-i*BLOCK);
  if(part.length!==expected){await cache.delete(blockURL(file,i));complete=false;break;}
  output.set(part,i*BLOCK);onProgress(`正在读取已缓存的 Moebius ${label} · ${Math.round((i+1)/count*100)}%`);
 }
 if(complete)return output;
 const controller=new AbortController();let timeout;
 const touch=()=>{clearTimeout(timeout);timeout=setTimeout(()=>controller.abort(),60000);};
 let reader;
 try{
  touch();const response=await fetcher(file.url,{credentials:'omit',signal:controller.signal});
  if(!response.ok||!response.body)throw Error(`模型下载失败（HTTP ${response.status}）。`);
  reader=response.body.getReader();let received=0,cachedTo=0;
  for(;;){
   const {done,value}=await reader.read();if(done)break;touch();
   if(received+value.length>file.bytes)throw Error('模型文件大小不符。');
   output.set(value,received);received+=value.length;
   onProgress(`下载 Moebius ${label} · ${Math.round(received/1e6)} / ${Math.round(file.bytes/1e6)} MB（${Math.floor(received/file.bytes*100)}%）`);
   while(cache&&Math.min(cachedTo+BLOCK,file.bytes)<=received){
    const end=Math.min(cachedTo+BLOCK,file.bytes);if(end===cachedTo)break;
    try{await cache.put(blockURL(file,cachedTo/BLOCK),new Response(output.slice(cachedTo,end)));}
    catch{cache=null;onProgress('浏览器缓存空间不足，本次继续运行；下次可能需要重新下载。');}
    cachedTo=end;
   }
  }
  if(received!==file.bytes)throw Error('模型下载不完整。');return output;
 }catch(e){
  if(e.name==='AbortError')throw Error('模型下载超过 60 秒没有响应。请检查网络后重试，或使用 LaMa。');
  if(e instanceof TypeError)throw Error('无法连接模型下载源 Hugging Face。请检查网络，或选择已内置的 LaMa / MI-GAN。素材没有上传。');
  throw e;
 }finally{clearTimeout(timeout);try{await reader?.cancel();}catch{}reader?.releaseLock();}
}
