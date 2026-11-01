import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { renderBody, renderSpec, summarize, validateSpec } from './sync-openapi.mjs';

const spec = (paths, schemas = {}) => ({ openapi: '3.0.3', info: { version: '1' }, paths, components: { schemas } });
const op = (description) => ({ description });

describe('validateSpec', () => {
  it('OpenAPI 3 문서를 받는다', () => {
    assert.doesNotThrow(() => validateSpec(spec({ '/a': { get: op('a') } })));
  });

  it('스펙이 아닌 응답을 거부한다', () => {
    assert.throws(() => validateSpec({ error: 'nope' }));
    assert.throws(() => validateSpec({ openapi: '2.0', paths: { '/a': {} } }));
    assert.throws(() => validateSpec(spec({})));
  });
});

describe('renderSpec', () => {
  it('들여쓰기 2칸, 끝 줄바꿈 없음, 한글은 그대로', () => {
    assert.equal(renderSpec({ a: '한글' }), '{\n  "a": "한글"\n}');
  });
});

describe('summarize', () => {
  const diff = summarize(
    spec({ '/kept': { get: op('old') }, '/gone': { get: op('x') } }, { Same: { type: 'string' }, Old: { type: 'string' } }),
    spec({ '/kept': { get: op('new'), post: op('y') }, '/fresh': { get: op('z') } }, { Same: { type: 'string' }, Fresh: { type: 'string' } }),
  );

  it('작업 단위로 추가·삭제·변경을 가른다', () => {
    assert.deepEqual(diff.operations, {
      added: ['GET /fresh', 'POST /kept'],
      removed: ['GET /gone'],
      changed: ['GET /kept'],
    });
  });

  it('스키마 추가·삭제를 가르고 같은 것은 뺀다', () => {
    assert.deepEqual(diff.schemas, { added: ['Fresh'], removed: ['Old'], changed: [] });
  });
});

describe('renderBody', () => {
  const empty = { added: [], removed: [], changed: [] };

  it('자동 머지가 아님을 알리고 빈 절은 뺀다', () => {
    const body = renderBody({ operations: { ...empty, removed: ['GET /gone'] }, schemas: empty });
    assert.match(body, /자동으로 머지되지 않으니/);
    assert.match(body, /### ⚠️ 삭제된 작업 \(1\)/);
    assert.doesNotMatch(body, /추가된 작업/);
  });

  it('긴 목록은 잘라서 개수만 남긴다', () => {
    const added = Array.from({ length: 53 }, (_, i) => `GET /p${i}`);
    const body = renderBody({ operations: { ...empty, added }, schemas: empty });
    assert.match(body, /### 추가된 작업 \(53\)/);
    assert.match(body, /- 외 3개/);
    assert.doesNotMatch(body, /\/p50`/);
  });
});

describe('CLI', () => {
  const live = spec({ '/a': { get: op('a') } });
  let response = { status: 200, body: JSON.stringify(live) };
  let server;
  let url;

  before(async () => {
    server = createServer((_, res) => res.writeHead(response.status).end(response.body));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}/openapi.json`;
  });
  after(() => server.close());

  const run = (current) =>
    new Promise((resolve) => {
      const dir = mkdtempSync(join(tmpdir(), 'sync-openapi-'));
      const paths = { target: join(dir, 'openapi.json'), body: join(dir, 'body.md'), output: join(dir, 'output') };
      writeFileSync(paths.target, current);
      writeFileSync(paths.output, '');
      const script = fileURLToPath(new URL('./sync-openapi.mjs', import.meta.url));
      execFile(
        process.execPath,
        [script],
        {
          env: {
            ...process.env,
            OPENAPI_URL: url,
            OPENAPI_SYNC_TARGET: paths.target,
            OPENAPI_SYNC_BODY: paths.body,
            GITHUB_OUTPUT: paths.output,
          },
        },
        (error) => resolve({ error, ...paths, output: readFileSync(paths.output, 'utf8') }),
      );
    });

  it('운영과 같으면 파일을 건드리지 않는다', async () => {
    response = { status: 200, body: JSON.stringify(live) };
    const r = await run(renderSpec(live));
    assert.equal(r.error, null);
    assert.equal(r.output, 'status=in-sync\n');
  });

  it('다르면 사본을 덮어쓰고 PR 본문을 남긴다', async () => {
    response = { status: 200, body: JSON.stringify(live) };
    const r = await run(renderSpec(spec({ '/old': { get: op('x') } })));
    assert.equal(r.error, null);
    assert.equal(r.output, 'status=changed\n');
    assert.equal(readFileSync(r.target, 'utf8'), renderSpec(live));
    assert.match(readFileSync(r.body, 'utf8'), /GET \/old/);
  });

  it('5xx 는 건너뛰고 사본을 건드리지 않는다', async () => {
    response = { status: 503, body: 'down' };
    const current = renderSpec(spec({ '/old': { get: op('x') } }));
    const r = await run(current);
    assert.equal(r.error, null);
    assert.equal(r.output, 'status=unavailable\n');
    assert.equal(readFileSync(r.target, 'utf8'), current);
  });

  for (const [name, res] of [
    ['4xx', { status: 403, body: 'blocked' }],
    ['스펙이 아닌 200', { status: 200, body: JSON.stringify({ error: 'nope' }) }],
    ['JSON 이 아닌 200', { status: 200, body: '<html>' }],
  ]) {
    it(`${name} 는 실패로 끝나고 사본을 건드리지 않는다`, async () => {
      response = res;
      const current = renderSpec(spec({ '/old': { get: op('x') } }));
      const r = await run(current);
      assert.notEqual(r.error, null);
      assert.equal(r.output, '');
      assert.equal(readFileSync(r.target, 'utf8'), current);
    });
  }
});
