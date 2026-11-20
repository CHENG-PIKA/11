import test from 'node:test';
import assert from 'node:assert/strict';
import {createUndoHistory} from '../undo-history.js';
test('one continuous drag is one undo and separate drags retain their boundaries',()=>{
 const h=createUndoHistory();h.record({x:10},'移动','drag');h.record({x:20},'移动','drag');h.endGroup();h.record({x:30},'移动','drag');
 assert.equal(h.size,2);assert.equal(h.undo().state.x,30);assert.equal(h.undo().state.x,10);assert.equal(h.undo(),null);
});
test('undo restores the previous generated image by reference, including independent branding',()=>{
 const h=createUndoHistory(),original={width:100,height:100},generated={width:200,height:200},logo={width:20,height:20};
 h.record({generated:{img:original},logo:{img:logo},settings:{sourceX:63}},'AI 补景');
 h.record({generated:{img:generated},logo:{img:logo},settings:{sourceX:50}},'移动');
 assert.equal(h.undo().state.generated.img,generated);const old=h.undo().state;assert.equal(old.generated.img,original);assert.equal(old.settings.sourceX,63);assert.equal(old.logo.img,logo);
});
test('history limits unique image memory without charging each transform for the same image',()=>{
 const h=createUndoHistory({limit:5,maxBytes:1000}),img={width:10,height:10};
 for(let i=0;i<5;i++)h.record({source:{img},x:i},'移动');assert.equal(h.size,5);
 h.record({source:{img:{width:20,height:20}}},'上传');assert.equal(h.size,1);assert.ok(h.undo());
});
