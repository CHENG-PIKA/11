import test from 'node:test';
import assert from 'node:assert/strict';
import {encodePng} from '../canvas-png.js';

test('normal canvas encoding returns the original blob', async () => {
  const expected = new Blob(['png'], {type:'image/png'});
  const actual = await encodePng({toBlob:fn=>fn(expected),toDataURL:()=>{throw Error('unexpected fallback');}});
  assert.equal(actual,expected);
});
test('stalled or null encoding falls back and ignores a late callback', async () => {
  let late;
  const result = await encodePng({toBlob:fn=>{late=fn;},toDataURL:()=> 'data:image/png;base64,cG5n'}, {timeoutMs:5});
  assert.equal(await result.text(),'png');
  late(new Blob(['late']));
  assert.equal(await result.text(),'png');
  assert.equal(await (await encodePng({toBlob:fn=>fn(null),toDataURL:()=> 'data:image/png;base64,cG5n'})).text(),'png');
});
test('failed fallback rejects instead of leaving the editor busy', async () => {
  await assert.rejects(encodePng({toBlob:()=>{},toDataURL:()=> 'data:,'},{timeoutMs:5}),/图片导出失败/);
});
