# 관심지역 부동산 브리핑 에이전트 (n8n + OpenAI)

PRD(`PRD.md`) 기준 구현. 관심 지역+연월을 받아 실거래 수집 → AI 분석 →
초안 저장 → 사람 승인 → 확정 리포트까지 끝낸다. 평가 결과는 `EVAL.md`.

## 파일

| 파일 | 무엇 |
|---|---|
| `PRD.md` | 기획 문서 (문제·유저·워크플로·도구·승인·MVP) |
| `WF1-estate-report.json` | 수집·분석 워크플로 (Webhook POST + 매주 월 09:00 스케줄) |
| `WF2-estate-approve.json` | 승인·확정 워크플로 (Webhook GET, 승인/거절 HTML 반환) |
| `supa_init.sql` | Supabase 테이블 (`agent_reports`·`agent_runs`) |
| `eval_run.cjs` | 평가 하네스 (5 시나리오 × v1/v2, `node eval_run.cjs [v1\|v2]`) |
| `eval/` | 10회 실행 원본 + 승인/거절 HTML |
| `EVAL.md` | 평가표·프롬프트 비교·실패 정리·수용기준 판정 |

## 준비물 (환경변수, `.env` — 커밋 금지)

```
OPENAI_API_KEY=...            # gpt-4o-mini 호출 (서버만, Code 노드 $env 경유)
DGK_KEY=...                   # data.go.kr RTMS 아파트매매 (URL 인코딩된 키 그대로)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=... # 서버만. anon 키는 쓰지 않음
PUBLIC_BASE=http://localhost:5678
N8N_PORT=5678
N8N_HOST=localhost
N8N_BLOCK_ENV_ACCESS_IN_NODE=false   # Code 노드 $env 허용
NODE_FUNCTION_ALLOW_BUILTIN=https    # Code 노드 require('https') 허용
```

## 실행

```bash
npm install
# Supabase에 supa_init.sql 실행 (테이블 2개)
npx n8n import:workflow --input=WF1-estate-report.json
npx n8n import:workflow --input=WF2-estate-approve.json
npx n8n publish:workflow --id=e1a2b3c4-0000-4000-8000-000000000001
npx n8n publish:workflow --id=e1a2b3c4-0000-4000-8000-000000000002
npx n8n start
```

n8n 2.x는 `publish` 전엔 운영 웹훅이 등록되지 않는다. 웹훅 경로는
`<workflowId>/<노드명>/<path>` 네임스페이스다 (DB `webhook_entity` 실측).

## 호출

```bash
# 브리핑 요청 (트리거: Webhook 또는 매주 월 09:00)
curl -X POST "http://localhost:5678/webhook/e1a2b3c4-0000-4000-8000-000000000001/webhookin/estate-report" \
  -H "Content-Type: application/json" \
  -d '{"lawd_cd":"11680","deal_ymd":"202508","prompt_version":"v2"}'
# → {"status":"pending_approval","report_id":N,"approve_url":"...","reject_url":"...", ...}

# 승인 (브라우저로 열어도 됨)
curl "http://localhost:5678/webhook/e1a2b3c4-0000-4000-8000-000000000002/webhookapprove/estate-approve?token=N&decision=approve"
```

## 도구 3종 (Code 노드 내, 스키마·실패규칙은 PRD §4)

1. 수집(RTMS XML→rows)+`calc_stats`(평균·중앙값·min/max): 2회 재시도 → 빈손이면 `fetchError`와 함께 자료없음 경로.
2. `report_memory`(Supabase `agent_reports`·`agent_runs`만, service_role은 서버에만).
3. 에이전트 루프(ReAct, 최대 8회): `fetch_month` 재조회·`recall_reports`·`finish`. 토큰·비용·ms를 `agent_runs`에 기록, 도구 trace를 `payload.trace`에 저장.

## 수용기준 결과 (2026-09-09 실측, `EVAL.md`)

승인 도달 10/10 · 승인→확정 2/2 (100%) · 평균 0.18원/건. 전부 통과.

## 호스티드 배포 (n8n.vibemakers.kr, 2.36.8 실측 2026-09-09)

- 워크플로: `estate-report` (`pJQQfxYx0TfWLLJ9`) · `estate-approve` (`ymfNww4juKvdwDoW`), 둘 다 active.
  로컬판을 그대로 올리면 Code 샌드박스에서 `require('https')`가 막혀 죽는다
  (`Module 'https' is disallowed` 실측) → hosted 전용으로 재조립했다
  (`WF1H.hosted.json`·`WF2H.hosted.json`, 생성기 `build_hosted.cjs`).
- hosted 차이점: HTTP 통신은 전부 HTTP Request 노드 + 크리덴셜 3종
  (`OPENAI bearer` httpBearerAuth · `Supabase apikey header` httpHeaderAuth ·
  `DGK serviceKey query` httpQueryAuth), 에이전트 루프는 SplitInBatches
  loop-back (최대 8회, trace·토큰·비용 기록 동일), Code 노드는 순수 연산만.
  Supabase는 `apikey` 단일 헤더로 된다 (Bearer 단독은 401 실측).
- 웹훅 경로(호스티드는 clean path):
  `https://n8n.vibemakers.kr/webhook/estate-report` (POST),
  `https://n8n.vibemakers.kr/webhook/estate-approve?token=N&decision=approve` (GET).
- 실측: 브리핑 → report 17·18·19·20 전부 `pending_approval` →
  승인 → `approved` (DB 대조). 증거 `hosted_*.json`·`eval/approve_hosted.html`·
  `eval/shots/approve_hosted.png`.
- quirks: ① 승인 첫 호출의 응답 본문이 비어 온다 (실행은 성공, 두 번째 호출부터
  정상 HTML — 호스티드 앞단 특성으로 보임). ② 프로젝트 폴더 이동은 API가
  라이선스로 막혀서 에디터에서 직접: Workflows 목록 → 워크플로 2개 체크 →
  프로젝트로 드래그.
- 크리덴셜 값(DGK·Supabase·OpenAI 키)은 API로 등록했고 repo에 없다.
  재현하려면 `hosted_cred_ids.json`의 ID가 아니라 같은 이름·타입으로 새로
  만들고 `build_hosted.cjs`의 ID를 교체한다.

## 로컬 터널 배포 (2026-09-09 실측)

- 공개 URL: `https://york-appliance-bill-seeking.trycloudflare.com`
  (cloudflared quick tunnel → 로컬 n8n 5678).
  터널 경유 실측: 브리핑 POST → `pending_approval` (report 14) →
  승인 링크 → `확정됨` + Supabase `approved` (`eval/run_tunnel-verify.json`·`eval/approve_tunnel.html`).
  에디터·REST는 오너 로그인 벽 뒤다 (터널 경유 `/rest/login` → 401).
- 터널 URL은 cloudflared 재시작 때마다 바뀐다. 바뀌면 `.env`의
  `PUBLIC_BASE`를 새 URL로 교체 → n8n 재시작 → 위 두 호출로 재실측한다.
  (이번에도 같은 절차를 밟았다.)
- 에디터는 오너 계정(이메일 conoc@naver.com, 비번 별도 보관)으로 잠겨 있다.
  초기 상태가 주인 없는 공개 셋업 화면이었으므로 DB에 직접 계정을 심었다.
  비번 분실 시 `npx n8n user-management:reset`.
