export function localFrame(width,height){
 const scale=Math.min(1,1024/Math.max(width,height));
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export function toModelInput(rgba,alpha,width,height){
 const n=width*height;if(rgba.length!==n*4||alpha.length!==n*4)throw Error('画布与空白区域尺寸不一致。');
 const image=new Uint8Array(n*3),mask=new Uint8Array(n);let holes=0;
 for(let i=0;i<n;i++){for(let c=0;c<3;c++)image[c*n+i]=rgba[i*4+c];mask[i]=alpha[i*4+3]===255?255:0;if(!mask[i])holes++;}
 return {image,mask,holes};
}
export function toRGBA(rgb,width,height){
 const n=width*height;if(rgb.length!==n*3)throw Error('本地补景图片尺寸无效。');
 const rgba=new Uint8ClampedArray(n*4);for(let i=0;i<n;i++){for(let c=0;c<3;c++)rgba[i*4+c]=rgb[c*n+i];rgba[i*4+3]=255;}return rgba;
}
export function toLamaInput(rgba,alpha,width,height){
 const n=width*height;if(rgba.length!==n*4||alpha.length!==n*4)throw Error('画布与空白区域尺寸不一致。');
 const image=new Float32Array(n*3),mask=new Float32Array(n);let holes=0;
 for(let i=0;i<n;i++){for(let c=0;c<3;c++)image[c*n+i]=rgba[i*4+c]/255;mask[i]=alpha[i*4+3]===255?0:1;holes+=mask[i];}
 return {image,mask,holes};
}
export function lamaToRGB(values,width,height){
 if(values.length!==width*height*3)throw Error('LaMa 返回的图片尺寸不匹配。');
 const out=new Uint8Array(values.length);
 for(let i=0;i<values.length;i++){if(!Number.isFinite(values[i]))throw Error('模型返回异常像素，当前画布已保留。请切换 CPU 重试。');out[i]=Math.max(0,Math.min(255,Math.round(values[i])));}
 return out;
}
export function squareFrame(width,height,side=512){
 const k=side/Math.max(width,height),w=Math.max(1,Math.round(width*k)),h=Math.max(1,Math.round(height*k));
 return {x:Math.floor((side-w)/2),y:Math.floor((side-h)/2),w,h,side};
}
