// 운영 OpenAPI와 Fern 사본의 내용 차이를 검사한다. 경로가 그대로여도 설명과 예시는 달라질 수 있다.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { PRODUCTION_OPENAPI_URL, summarize, validateSpec } from './sync-openapi.mjs';

// ── 0. 파일이 YAML 파서로 읽히는가 ──
// Fern 은 `.json` 도 YAML 파서로 읽는다. YAML 은 **중복 매핑 키를 거부**하는데 JSON 파서는
// 뒤엣것으로 조용히 덮으므로, JSON.parse 로는 멀쩡해 보이는 파일이 Fern 에서만 터진다.
//
// 실제로 그 일이 있었다(2026-09-16): 이 파일에 `429` 를 손으로 추가한 PR 과 제품 스펙 번들로
// 통째 교체한 PR 이 **머지되며 텍스트로 합쳐져** 같은 responses 에 `"429"` 가 두 번 생겼다.
// git 은 충돌로 잡지 않았고, `fern generate` 는 "Skipping API" 를 찍고도 **exit 0** 이라
// 배포가 초록불인 채 API 레퍼런스만 통째로 옛 버전에 머물렀다.
const require_ = createRequire(import.meta.url);
let yaml;
try {
  yaml = require_('js-yaml');
} catch {
  yaml = null; // 개발 환경에 없으면 이 검사만 건너뛴다(드리프트 검사는 계속한다).
}

const LIVE = process.env.OPENAPI_URL ?? PRODUCTION_OPENAPI_URL;
const LOCAL = new URL('../fern/openapi.json', import.meta.url);

const res = await fetch(LIVE, { signal: AbortSignal.timeout(20_000) });
if (!res.ok) {
  // 운영 API 가 잠깐 안 잡히는 것으로 문서 PR 을 막지는 않는다 — 이 검사의 목적은
  // 드리프트 감지이지 가용성 감시가 아니다.
  console.warn(`⚠ 운영 스펙을 받지 못했습니다 (HTTP ${res.status}) — 검사를 건너뜁니다.`);
  process.exit(0);
}

const live = await res.json();
validateSpec(live);
const localText = readFileSync(LOCAL, 'utf8');

if (yaml) {
  try {
    yaml.load(localText);
  } catch (e) {
    console.error('✗ fern/openapi.json 을 YAML 파서가 거부합니다 — Fern 이 API 를 통째로 건너뜁니다.');
    console.error(`  ${e.reason ?? e.message}`);
    if (e.mark?.line != null) console.error(`  위치: ${e.mark.line + 1}행`);
    console.error(
      '\n  JSON.parse 로는 통과하는 파일이라 눈으로는 안 보입니다. 대개 머지가 같은 키를\n' +
        '  두 번 남긴 경우입니다 — 제품 스펙 번들로 이 파일을 통째로 덮어쓰세요.',
    );
    process.exit(1);
  }
}

const local = JSON.parse(localText);

if (isDeepStrictEqual(local, live)) {
  console.log(`✓ OpenAPI 동기화됨 — ${Object.keys(live.paths).length}개 경로`);
  process.exit(0);
}

const changes = summarize(local, live);
console.error('✗ fern/openapi.json 내용이 운영 API와 다릅니다.');
for (const [label, group] of [['작업', changes.operations], ['스키마', changes.schemas]]) {
  for (const [kind, entries] of [['추가', group.added], ['삭제', group.removed], ['수정', group.changed]]) {
    if (entries.length) console.error(`${label} ${kind}: ${entries.join(', ')}`);
  }
}
if (changes.others.length) console.error(`기타 수정: ${changes.others.join(', ')}`);
console.error('node scripts/sync-openapi.mjs 로 운영 사본을 갱신하세요.');
process.exit(1);
