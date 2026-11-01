#!/usr/bin/env bash
# sync-openapi.mjs 의 결과를 PR 로 옮긴다. PR 은 고정 브랜치 하나로만 유지한다.
#
# STATUS=changed 이면 작업 트리의 fern/openapi.json 이 운영 스펙으로 덮여 있다.
set -euo pipefail

SPEC=fern/openapi.json
: "${BRANCH:?}" "${STATUS:?}" "${REVIEWER:?}" "${BODY_FILE:=}"

git fetch --quiet origin main
branch_exists=false
if git fetch --quiet origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>/dev/null; then
  branch_exists=true
fi

open_pr=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')

if [ "$STATUS" = in-sync ]; then
  # 사람이 먼저 맞췄거나 배포가 롤백됐으면 열린 PR 은 할 일이 없다.
  if [ -n "$open_pr" ]; then
    gh pr close "$open_pr" --comment "운영 스펙이 main 과 같아져 닫습니다."
  fi
  if [ "$branch_exists" = true ]; then
    git push --quiet origin --delete "$BRANCH"
  fi
  exit 0
fi

# 내용도 기준도 그대로면 아무것도 안 한다. push 하면 리뷰와 프리뷰가 처음으로 돌아간다.
up_to_date=false
if [ "$branch_exists" = true ] &&
  git diff --quiet "origin/$BRANCH" -- "$SPEC" &&
  git diff --quiet "$(git merge-base origin/main "origin/$BRANCH")" origin/main -- "$SPEC"; then
  up_to_date=true
fi

if [ "$up_to_date" = false ]; then
  git switch --quiet -C "$BRANCH"
  git add "$SPEC"
  git commit --quiet -m "docs(api): OpenAPI 사본을 운영 API 명세로 맞춘다"
  # 이 브랜치의 주인은 이 스크립트뿐이다.
  git push --quiet --force origin "HEAD:refs/heads/$BRANCH"
fi

if [ -n "$open_pr" ]; then
  if [ "$up_to_date" = false ]; then
    gh pr edit "$open_pr" --body-file "$BODY_FILE"
  fi
  exit 0
fi

# 사람이 닫은 PR 을 매시간 되살리지 않는다. 스펙이 또 바뀌면 커밋이 달라져 새로 열린다.
head_sha=$(git rev-parse "$([ "$up_to_date" = true ] && echo "origin/$BRANCH" || echo HEAD)")
closed=$(gh pr list --head "$BRANCH" --state closed --json headRefOid --jq "[.[] | select(.headRefOid == \"$head_sha\")] | length")
if [ "$closed" != 0 ]; then
  echo "이 커밋의 PR 은 이미 닫혔습니다 — 다시 열지 않습니다."
  exit 0
fi

gh pr create \
  --base main \
  --head "$BRANCH" \
  --title "docs(api): OpenAPI 사본을 운영 API 명세로 맞춘다" \
  --body-file "$BODY_FILE" \
  --reviewer "$REVIEWER"
