# ClawOps Documentation

ClawOps의 공개 개발자 문서 저장소입니다. [Fern Docs](https://buildwithfern.com/learn/docs/getting-started/overview/)로 가이드와 OpenAPI 기반 API Reference를 함께 제공합니다.

## 로컬 실행

Node.js 22 이상이 필요합니다.

```bash
npm install
npm run check
npm run dev
```

로컬 미리보기는 기본적으로 `http://localhost:3000`에서 열립니다.

## 저장소 구조

```text
fern/
├── docs.yml              # 내비게이션, 테마, 도메인
├── fern.config.json      # Fern 조직과 CLI 버전
├── generators.yml        # OpenAPI 입력 설정
├── openapi.json          # 배포용 번들 OpenAPI
├── styles.css
└── docs/
    ├── assets/
    └── pages/
```

## 콘텐츠 원칙

- 이 저장소에는 고객에게 공개해도 되는 개발자 문서만 둡니다.
- 내부 설계 문서, 운영 Runbook, 인프라 상세와 미출시 기능은 제품 저장소에 유지합니다.
- API Reference의 원본은 `clawops/app/spec`이며, 이 저장소에는 검증된 번들 결과만 동기화합니다.
- 문서 변경은 Pull Request에서 Fern preview를 확인한 뒤 병합합니다.

## 배포

1. [Fern Dashboard](https://dashboard.buildwithfern.com)에서 `clawops` 조직과 이 GitHub 저장소를 연결합니다.
2. Fern API 키를 GitHub Actions secret `FERN_TOKEN`으로 등록합니다.
3. `main` 브랜치에 병합하면 `.github/workflows/publish-docs.yml`이 문서를 배포합니다.
4. PR에서는 `.github/workflows/preview-docs.yml`이 preview URL을 생성합니다.

## 커스텀 도메인

`fern/docs.yml`에는 다음 값이 미리 설정되어 있습니다.

```yaml
instances:
  - url: clawops.docs.buildwithfern.com
    custom-domain: docs.claw-ops.com
```

Fern Dashboard에서 커스텀 도메인을 등록한 뒤 Fern이 제공하는 CNAME과 TXT 값을 `claw-ops.com` DNS에 추가합니다. Cloudflare를 사용한다면 CNAME은 DNS only로 설정합니다.

## OpenAPI 동기화

`fern/openapi.json`은 운영 API의 `/openapi.json` 사본입니다. `sync-openapi` 워크플로가 매시간 운영 API와 비교해, 다르면 `bot/openapi-sync` 브랜치로 PR을 올립니다. 배포된 스펙을 읽으므로 아직 배포되지 않은 API는 PR에 들어가지 않습니다.

- PR은 자동으로 머지되지 않습니다. 머지하면 바로 게시되므로 프리뷰를 확인한 뒤 머지합니다.
- 이 파일을 직접 고치면 다음 동기화에 덮입니다. 문구는 제품 저장소의 `app/spec`에서 고칩니다.
- 바로 돌리려면 Actions에서 `sync-openapi`를 수동으로 실행합니다.
- 닫은 PR은 스펙이 또 바뀔 때까지 다시 열리지 않습니다. 필요하면 그 PR을 직접 다시 엽니다.

## 라이선스

이 문서는 [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) 라이선스를 따릅니다. 출처를 밝히면 자유롭게 공유·개작할 수 있습니다. 전문은 [LICENSE](./LICENSE)를 참고하세요.
