// Feather background edges only; restore protected subjects to full original opacity.
export function sourceOverlay(asset,plan,target){
 const image=plan.image,crop=asset.crop,k=Math.min(1,2048/Math.max(crop.w,crop.h));
 const out=document.createElement('canvas');out.width=Math.max(1,Math.round(crop.w*k));out.height=Math.max(1,Math.round(crop.h*k));
 const mask=document.createElement('canvas');mask.width=out.width;mask.height=out.height;
 const ctx=out.getContext('2d'),m=mask.getContext('2d');ctx.drawImage(asset.img,crop.x,crop.y,crop.w,crop.h,0,0,out.width,out.height);m.fillStyle='#fff';m.fillRect(0,0,mask.width,mask.height);
 const band=Math.min(64,Math.min(image.w,image.h)*.12),fx=Math.min(.49,band/image.w),fy=Math.min(.49,band/image.h);
 const edges=[[image.x>1,0,0,mask.width,0,fx],[image.x+image.w<target.w-1,mask.width,0,0,0,fx],[image.y>1,0,0,0,mask.height,fy],[image.y+image.h<target.h-1,0,mask.height,0,0,fy]];
 m.globalCompositeOperation='destination-in';
 for(const [enabled,x1,y1,x2,y2,f] of edges){if(!enabled)continue;const gradient=m.createLinearGradient(x1,y1,x2,y2);gradient.addColorStop(0,'rgba(255,255,255,0)');gradient.addColorStop(f,'#fff');gradient.addColorStop(1,'#fff');m.fillStyle=gradient;m.fillRect(0,0,mask.width,mask.height);}
 m.globalCompositeOperation='source-over';m.fillStyle='#fff';
 for(const r of plan.protectedRegions||[]){const pad=band;m.fillRect((r.x-image.x-pad)/image.w*mask.width,(r.y-image.y-pad)/image.h*mask.height,(r.w+pad*2)/image.w*mask.width,(r.h+pad*2)/image.h*mask.height);}
 ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);return out;
}
