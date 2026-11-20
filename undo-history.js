// Keep image references instead of duplicating full canvases for every drag.
export function createUndoHistory({limit=30,maxBytes=160*1024*1024}={}){
 const entries=[];let activeGroup=null;
 const bytes=()=>{const seen=new Set();let total=0;for(const {state} of entries)for(const key of ['source','logo','title','generated']){const img=state[key]?.img;if(!img||seen.has(img))continue;seen.add(img);total+=(img.naturalWidth||img.width||0)*(img.naturalHeight||img.height||0)*4;}return total;};
 return {
  record(state,label,group=null){
   if(group&&activeGroup===group)return false;
   entries.push({state,label});activeGroup=group;
   while(entries.length>1&&(entries.length>limit||bytes()>maxBytes))entries.shift();
   return true;
  },
  endGroup(){activeGroup=null;},
  undo(){activeGroup=null;return entries.pop()||null;},
  get size(){return entries.length;},
  get label(){return entries.at(-1)?.label||'';}
 };
}
