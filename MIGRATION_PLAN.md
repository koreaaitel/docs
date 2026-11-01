# ClawOps Docs 전환 계획

## 목표

- `docs.claw-ops.com`에서 공개 개발자 문서를 독립적으로 운영한다.
- 가이드와 OpenAPI 기반 API Reference를 같은 정보 구조 안에서 제공한다.
- 제품 코드 배포와 문서 배포를 분리하되 API 변경으로 인한 문서 누락은 자동으로 감지한다.

## 1단계 — 기반 구축

- Fern 스타터 구조와 ClawOps 브랜딩
- Quickstart, Voice Agent, VoiceML, Webhook, Network 골격
- 현재 번들 OpenAPI 기반 API Reference
- PR 검증, preview, `main` 배포 GitHub Actions
- `docs.claw-ops.com` 커스텀 도메인 선언

## 2단계 — 공개 문서 마이그레이션

기존 `clawops/web/content/docs`에서 고객 공개가 확정된 문서를 순서대로 옮깁니다.

1. 시작하기와 SDK
2. Voice Agent와 provider별 연동
3. VoiceML, Stream, AMD
4. Webhook 이벤트와 서명 검증
5. SIP trunk, WebRTC와 통화 클라이언트
6. 배치 발신과 고급 API 개념

기존 MDX의 `Callout`, `ApiTable` 같은 프로젝트 전용 컴포넌트는 Fern 내장 컴포넌트 또는 Markdown 표로 변환합니다.

## 3단계 — 자동화

- 제품 저장소에서 OpenAPI bundle 생성 및 검증
- 운영 API의 OpenAPI가 바뀌면 이 저장소에 자동 PR 생성 (`sync-openapi` 워크플로)
- 깨진 내부 링크와 MDX 문법 검사
- 코드 예제 smoke test
- 문서 소유자 CODEOWNERS 지정

## 4단계 — 공개

- 콘텐츠 및 보안 검토
- Fern production 배포
- DNS CNAME/TXT 설정과 SSL 확인
- 기존 `/docs` URL이 있다면 301 redirect
- 검색, `/llms.txt`, 모바일과 다크모드 검증

## 완료 기준

- 신규 사용자가 문서만 보고 번호 발급부터 첫 통화까지 완료할 수 있다.
- 공개 API가 OpenAPI Reference에서 빠짐없이 검색된다.
- API 스펙과 문서 저장소의 차이가 CI에서 감지된다.
- PR마다 공유 가능한 문서 preview가 생성된다.
