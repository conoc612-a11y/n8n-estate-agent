# PRD — 관심지역 부동산 브리핑 에이전트 (n8n + OpenAI)

## 1. 문제 정의
부동산 매수·임장 타이밍을 잡으려면 매번 실거래가(data.go.kr)·경매/공매(온비드)를
뒤져 표를 만들고 해석해야 한다. 반복 업무다.
이 에이전트는 **관심 지역 + 기간 입력을 받아, 실거래 수집 → AI 분석 →
초안 저장 → 사람 승인 → 확정 리포트**까지 끝내준다.

- 입력: {lawd_cd(지역코드), deal_ymd(연월), apt(단지명, 선택), memo}
- 결과물: 확정 리포트 1건 (평균가·거래건수·전월 대비·주목 매물 + AI 코멘트)

## 2. 타겟 유저
- 나 (1인 운영): 매주 관심 지역 시세를 정리하는 사람.
- 확장: 같은 형식 리포트를 구독하는 지인 (승인자는 나로 고정).

## 3. 워크플로 설계 (WF1 수집·분석 / WF2 승인·확정)

| # | 단계 | 에이전트 판단 | 도구 처리 |
|---|---|---|---|
| 1 | 트리거 | — | Webhook 접수 or 매주 월 09:00 Schedule |
| 2 | 수집 | 지역코드 유효? 기간 빠짐? | HTTP: RTMS 아파트매매 실거래 조회 (실패 시 2회 재시도 → 빈손이면 "자료 없음" 기록 후 중단) |
| 3 | 분석 | 무엇을 강조할지 (급등·급매·거래절벽) | AI Agent(OpenAI gpt-4o-mini) + 도구 2종 호출 |
| 4 | 초안 저장 | — | Supabase agent_reports(status=pending) + runs 지표 기록 |
| 5 | 사람 승인 | 승인/수정/거절은 사람 | WF2 Webhook (?token=, approve/reject+수정문) |
| 6 | 확정 | — | status=approved + final 저장, 결과 HTML 응답 |
| 7 | 종료조건 | — | 최대 반복 12회·trial 25분·월 OpenAI $5 상한 초과 시 중단 |

## 4. 도구 계획 (에이전트 tools)

1. **apt_trade_lookup** (HTTP Request tool, 읽기전용)
   - IN: {lawd_cd, deal_ymd, numOfRows≤100} / OUT: [{apt, area, price, date, floor}]
   - 실패: 2회 재시도 → 그래도 실패면 수집 단계로 폴백(빈 배열 + 사유).
2. **report_memory** (Supabase HTTP tool, agent_reports·agent_runs만)
   - IN: {action: recall(keys)|save_draft(...)} / OUT: 과거 리포트 요약 or 저장 id.
   - 권한 최소화: service_role 키는 n8n 크리덴셜(서버)에만. anon 키 노출 없음.
3. **calc_stats** (Code tool, 로컬 계산 — 토큰 절약용)
   - IN: rows / OUT: {건수, 평균가, 중앙값, 전월대비(과거 리포트 있을 때)}.

## 5. 사람 개입 지점
- **승인 1곳 (필수)**: 초안→확정 전. 거절 시 사유 필수, 수정문 있으면 반영 후
  재승인 없이 확정 (수정 500자 제한).
- 발송(메일/메신저)은 이번 MVP에서 제외 → 위험 도구 없음. 승인 URL은
  실행별 토큰 (?token=run_id) 으로 남용 방지.

## 6. MVP 기능·화면
- MUST: Webhook 트리거, 수집, AI 분석, pending 저장, 승인/거절, 확정 HTML,
  runs 지표 기록, n8n Executions trace.
- 화면: ① n8n 캔버스 ② Executions (trace) ③ Supabase Table (runs/reports)
  ④ 승인 링크 결과 페이지. 별도 프론트 없음 (응답 HTML).
- WONT: 자동 발송, 다중 승인자, 스케줄 외 트리거.

## 7. 평가·수용 기준
- 평가 5시나리오 (정상 3: 강남/송파/마포 실거래, 경계 1: 거래 0건 달,
  예외 1: 잘못된 지역코드) × 프롬프트 2종(기준/개선) = 10회 실행 표.
- 수용: 5개 중 승인단계 도달 4개 이상 + 승인→확정 100% + 평균 비용
  $0.05/건 이하.
