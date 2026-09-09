# 제출용 (구글폼 https://forms.gle/ZHdKgApqf79YswNKA)

## 1. GitHub 저장소 URL (폼에 붙여넣기)

```
https://github.com/conoc612-a11y/n8n-estate-agent
```

## 2. 공개 URL (폼·본문에 함께 적기)

```
https://n8n.vibemakers.kr/webhook/estate-report   (POST, 호스티드 — 상시)
https://york-appliance-bill-seeking.trycloudflare.com   (로컬 터널 — PC 켜져 있을 때만)
```

살아있는지 확인 (둘 다 200이어야 함):

```bash
curl -o NUL -w "%{http_code}\n" https://york-appliance-bill-seeking.trycloudflare.com/
curl -X POST "https://york-appliance-bill-seeking.trycloudflare.com/webhook/e1a2b3c4-0000-4000-8000-000000000001/webhookin/estate-report" \
  -H "Content-Type: application/json" \
  -d '{"lawd_cd":"11680","deal_ymd":"202508","prompt_version":"v2"}'
```

## 3. 캡처본 (폼 첨부 — `eval/shots/`)

| 파일 | 무엇이 보이나 |
|---|---|
| `eval/shots/approve.png` | 터널 경유 승인 결과 `확정됨` + 확정 리포트 본문 (report 16, 강남 100건) |
| `eval/shots/live.png` | 공개 URL 접속 시 n8n Sign in (배포 실가동 + 에디터 잠금 증거) |

원본 데이터: `eval/run_*.json` 10회 + `eval/approve_3.html`·`eval/reject_8.html`·
`eval/approve_tunnel.html` (같은 repo에 포함).

## 4. 평가 요약 (폼 서술칸용)

- 5 시나리오(강남·송파·마포·0건 경계·잘못된 지역코드) × 프롬프트 v1/v2 = 10회.
- 승인 도달 10/10 (기준 4/5 이상), 승인→확정 전이 100%, 평균 0.18원/건 (기준 $0.05 이하).
- v1은 단위 환각 2건 → v2 구조화 지시 후 0건, v2 채택. 상세 `EVAL.md` §1–§5.

## 5. 주의 (URL 수명)

터널 URL은 cloudflared 재시작 시 바뀐다. 바뀌면 README `한계와 배포` 절
절차대로 `PUBLIC_BASE` 교체 → n8n 재시작 → POST+승인 재실측 후,
이 파일 §2의 URL 두 곳과 캡처를 갈아끼운다.
