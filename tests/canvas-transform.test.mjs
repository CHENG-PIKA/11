import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeFromCorner,resizeAboutCenter,sourceTransformFromRect} from '../canvas-transform.js';
import {manualSourceRect,layout,transformFromRect} from '../studio-core.js';
import {createUndoHistory} from '../undo-history.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const sameRect=(a,b)=>{for(const key of ['x','y','w','h'])close(a[key],b[key]);};
for(const corner of ['nw','ne','sw','se'])test(`${corner} resize preserves aspect and opposite anchor, including off-canvas placement`,()=>{
 const original={x:-100,y:120,w:400,h:180};
 const dx=corner.endsWith('w')?-100:100,dy=corner.startsWith('n')?-45:45;
 const next=resizeFromCorner(original,corner,dx,dy);
 close(next.w,500);close(next.h,225);close(next.w/next.h,original.w/original.h);
 close(corner.endsWith('w')?next.x+next.w:next.x,corner.endsWith('w')?original.x+original.w:original.x);
 close(corner.startsWith('n')?next.y+next.h:next.y,corner.startsWith('n')?original.y+original.h:original.y);
 sameRect(resizeFromCorner(next,corner,-dx,-dy),original);
});

test('dragging through the anchor stays positive and a large enlargement is not clipped',()=>{
 const rect={x:0,y:0,w:20,h:10};
 const tiny=resizeFromCorner(rect,'se',-200,-100);assert.ok(tiny.w>0&&tiny.h>0);close(tiny.w/tiny.h,2);
 const large=resizeFromCorner(rect,'se',20000,10000);close(large.w,20020);close(large.h,10010);
});

test('resized background survives conversion for both source and generated aspect ratios',()=>{
 const settings={w:1080,h:1440,sourceZoom:83,sourceX:12,sourceY:64};
 for(const asset of [{w:2048,h:1243},{w:1080,h:1440}]){
  const resized=resizeFromCorner(manualSourceRect(settings,asset),'nw',-72,-41);
  const transformed=sourceTransformFromRect(settings,asset,resized);
  sameRect(manualSourceRect({...settings,...transformed},asset),resized);
 }
});

test('percentage resize stays centered and brand transforms round-trip without distortion',()=>{
 const settings={w:900,h:383},asset={w:300,h:90},rect={x:-100,y:20,w:600,h:180};
 const resized=resizeAboutCenter(rect,1350);close(resized.x+resized.w/2,200);close(resized.y+resized.h/2,110);
 const layers=layout({...settings,layers:{title:transformFromRect(settings,resized)}},null,null,asset).layers;
 sameRect(layers[0],resized);
});

test('one corner gesture restores its starting rectangle and keeps generated pixels',()=>{
 const history=createUndoHistory(),image={width:1080,height:1440},start={x:10,y:20,w:600,h:400};let rect=start;
 for(const delta of [10,20,40,80]){history.record({rect,generated:{img:image}},'缩放','resize');rect=resizeFromCorner(start,'se',delta,delta);}
 history.endGroup();assert.equal(history.size,1);const restored=history.undo().state;sameRect(restored.rect,start);assert.equal(restored.generated.img,image);
});
