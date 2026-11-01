// fern/openapi.json 이 실제 운영 API 와 갈렸는지 본다.
//
// 이 파일은 제품 저장소 스펙의 **사본**이다. sync-openapi 워크플로가 갱신 PR 을 올리지만
// 머지는 사람이 하므로 그 전까지는 뒤처진다 — 실제로 이메일 API 5개가 공개된 지 한참 뒤까지
// 여기에만 없었고, `info.version` 이 양쪽 다 1.3.2 라 눈으로는 갈린 걸 알 수 없었다.
//
// 그래서 버전이 아니라 **경로 집합**을 본다. 비교 대상은 운영 API 가 스스로 내보내는
// /openapi.json 이다 — 배포된 것이 정본이고, 토큰 없이 받을 수 있다.
//
// 배포 순서상 제품이 먼저 나가고 문서가 뒤따르므로, 그 사이 이 검사는 빨간불이 된다.
// 그게 의도다: "문서가 아직 안 따라왔다" 를 사람이 아니라 CI 가 알려 준다.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

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

const LIVE = process.env.OPENAPI_URL ?? 'https://api.claw-ops.com/openapi.json';
const LOCAL = new URL('../fern/openapi.json', import.meta.url);

const res = await fetch(LIVE, { signal: AbortSignal.timeout(20_000) });
if (!res.ok) {
  // 운영 API 가 잠깐 안 잡히는 것으로 문서 PR 을 막지는 않는다 — 이 검사의 목적은
  // 드리프트 감지이지 가용성 감시가 아니다.
  console.warn(`⚠ 운영 스펙을 받지 못했습니다 (HTTP ${res.status}) — 검사를 건너뜁니다.`);
  process.exit(0);
}

const live = await res.json();
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

const livePaths = new Set(Object.keys(live.paths ?? {}));
const localPaths = new Set(Object.keys(local.paths ?? {}));

const missing = [...livePaths].filter((p) => !localPaths.has(p)).sort();
const stale = [...localPaths].filter((p) => !livePaths.has(p)).sort();

if (missing.length === 0 && stale.length === 0) {
  console.log(`✓ OpenAPI 동기화됨 — ${livePaths.size}개 경로`);
  process.exit(0);
}

console.error('✗ fern/openapi.json 이 운영 API 와 갈렸습니다.\n');
if (missing.length) {
  console.error(`문서에 없는 엔드포인트 ${missing.length}개 (운영에는 있음):`);
  for (const p of missing) console.error(`  + ${p}`);
}
if (stale.length) {
  console.error(`\n운영에 없는 엔드포인트 ${stale.length}개 (문서에만 남음):`);
  for (const p of stale) console.error(`  - ${p}`);
}
console.error(
  '\n고치는 법: sync-openapi 워크플로가 올린 PR 을 머지하세요. PR 이 없으면 Actions 에서\n' +
    '  sync-openapi 를 수동으로 실행하세요.',
);
process.exit(1);
