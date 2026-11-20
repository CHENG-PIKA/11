import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root = new URL('../', import.meta.url);
test('bundled models and runtime resolve inside a Pages subdirectory with matching bytes and hashes', () => {
  for (const name of ['lama.json', 'model.json', 'runtime.json']) {
    const manifest = JSON.parse(readFileSync(new URL(name, root)));
    let total = 0;
    for (const part of manifest.parts) {
      const resolved = new URL(part.path, 'https://example.org/repository/worker.js');
      assert.equal(resolved.origin, 'https://example.org');
      assert.ok(resolved.pathname.startsWith('/repository/'));
      const bytes = readFileSync(new URL(part.path, root));
      assert.equal(bytes.length, part.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), part.sha256);
      total += bytes.length;
    }
    assert.equal(total, manifest.bytes);
  }
});
test('static entry and local modules resolve without root-only asset paths or server APIs', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  assert.match(html, /id="canvasEmpty"/);
  assert.doesNotMatch(html, /使用校招示例|assets\/master|assets\/logo|assets\/title/);
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
    assert.ok(existsSync(new URL(match[1], root)), match[1]);
  }
  for (const name of ['studio.js','client.js','worker.js','moebius-pipeline.js']) {
    const source = readFileSync(new URL(name, root), 'utf8');
    assert.doesNotMatch(source, /['"]\/api\//);
    for (const match of source.matchAll(/from ['"](\.\/[^'"]+)['"]/g)) {
      assert.ok(existsSync(new URL(match[1], root)), `${name}: ${match[1]}`);
    }
  }
});
