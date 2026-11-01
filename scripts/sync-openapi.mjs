// 운영 API 가 내보내는 /openapi.json 으로 fern/openapi.json 을 갱신한다.
//
// `.github/workflows/sync-openapi.yml` 이 매시간 부른다. 제품 저장소의 `main` 이 아니라 운영
// API 를 읽는 이유는 시점 때문이다 — 문서는 머지하면 바로 게시되므로, 아직 배포되지 않은
// 스펙으로 PR 을 만들면 없는 API 를 공개하게 된다. 운영을 읽으면 배포가 실패했을 때 PR 이
// 생기지 않고, 롤백하면 PR 도 따라 되돌아간다.
//
// 결과는 GITHUB_OUTPUT 의 status 로 알린다.
//   in-sync     사본이 운영과 같다
//   changed     사본을 덮어쓰고 PR 본문을 OPENAPI_SYNC_BODY 에 썼다
//   unavailable 운영 API 가 일시적으로 안 잡힌다 — 다음 실행에 다시 본다
// 4xx 나 스펙이 아닌 응답은 저절로 낫지 않으므로 실패로 끝낸다.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const LIST_LIMIT = 50;

export function validateSpec(spec) {
  if (typeof spec?.openapi !== 'string' || !spec.openapi.startsWith('3.')) {
    throw new Error('openapi 버전 필드가 없습니다');
  }
  if (Object.keys(spec.paths ?? {}).length === 0) throw new Error('paths 가 비어 있습니다');
}

// 사본과 같은 형식이어야 내용이 그대로일 때 diff 가 생기지 않는다.
export function renderSpec(spec) {
  return JSON.stringify(spec, null, 2);
}

function operations(spec) {
  const ops = new Map();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      if (item[method]) ops.set(`${method.toUpperCase()} ${path}`, item[method]);
    }
  }
  return ops;
}

function diffMaps(before, after) {
  const added = [...after.keys()].filter((k) => !before.has(k)).sort();
  const removed = [...before.keys()].filter((k) => !after.has(k)).sort();
  const changed = [...after.keys()]
    .filter((k) => before.has(k) && JSON.stringify(before.get(k)) !== JSON.stringify(after.get(k)))
    .sort();
  return { added, removed, changed };
}

// 작업과 스키마 밖의 부분. 이것만 바뀌어도 PR 본문이 비지 않게 한다.
function otherSections(spec) {
  const sections = new Map();
  for (const [key, value] of Object.entries(spec)) {
    if (key !== 'paths' && key !== 'components') sections.set(key, value);
  }
  for (const [key, value] of Object.entries(spec.components ?? {})) {
    if (key !== 'schemas') sections.set(`components.${key}`, value);
  }
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const [key, value] of Object.entries(item)) {
      if (!METHODS.includes(key)) sections.set(`paths.${path}.${key}`, value);
    }
  }
  return sections;
}

export function summarize(before, after) {
  const schemas = (spec) => new Map(Object.entries(spec.components?.schemas ?? {}));
  const others = diffMaps(otherSections(before), otherSections(after));
  return {
    operations: diffMaps(operations(before), operations(after)),
    schemas: diffMaps(schemas(before), schemas(after)),
    others: [...others.added, ...others.removed, ...others.changed].sort(),
  };
}

function section(title, items) {
  if (items.length === 0) return [];
  const shown = items.slice(0, LIST_LIMIT).map((item) => `- \`${item}\``);
  if (items.length > LIST_LIMIT) shown.push(`- 외 ${items.length - LIST_LIMIT}개`);
  return [`### ${title} (${items.length})`, '', ...shown, ''];
}

export function renderBody({ operations: ops, schemas, others = [] }) {
  return [
    '운영 API 의 `/openapi.json` 이 `fern/openapi.json` 과 달라져 자동으로 올린 PR 입니다.',
    '',
    '**머지하면 바로 게시됩니다.** 자동으로 머지되지 않으니 프리뷰를 확인한 뒤 머지해 주세요.',
    '문구를 고치려면 이 파일이 아니라 제품 저장소의 `app/spec` 을 고쳐 주세요. 이 파일의 손수정은 다음 동기화에 덮입니다.',
    '',
    ...section('⚠️ 삭제된 작업', ops.removed),
    ...section('추가된 작업', ops.added),
    ...section('바뀐 작업', ops.changed),
    ...section('⚠️ 삭제된 스키마', schemas.removed),
    ...section('추가된 스키마', schemas.added),
    ...section('바뀐 스키마', schemas.changed),
    ...section('그 밖의 변경', others),
  ].join('\n');
}

async function main() {
  const url = process.env.OPENAPI_URL ?? 'https://api.claw-ops.com/openapi.json';
  const target = process.env.OPENAPI_SYNC_TARGET ?? new URL('../fern/openapi.json', import.meta.url);
  const report = (status) => {
    console.log(`status=${status}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `status=${status}\n`);
  };

  let res;
  let text;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    text = await res.text();
  } catch (e) {
    console.warn(`⚠ 운영 스펙을 받지 못했습니다 (${e.message})`);
    return report('unavailable');
  }
  if (res.status >= 500) {
    console.warn(`⚠ 운영 스펙을 받지 못했습니다 (HTTP ${res.status})`);
    return report('unavailable');
  }
  if (!res.ok) throw new Error(`운영 스펙 요청이 거부됐습니다 (HTTP ${res.status})`);

  const live = JSON.parse(text);
  validateSpec(live);

  const currentText = readFileSync(target, 'utf8');
  const liveText = renderSpec(live);
  if (currentText === liveText) return report('in-sync');

  writeFileSync(target, liveText);
  if (process.env.OPENAPI_SYNC_BODY) {
    writeFileSync(process.env.OPENAPI_SYNC_BODY, renderBody(summarize(JSON.parse(currentText), live)));
  }
  report('changed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
