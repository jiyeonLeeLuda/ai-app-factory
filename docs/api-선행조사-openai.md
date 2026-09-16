# OpenAI API 선행조사 (P1용)

조사일: 2026-09-16. 출처: OpenAI 공식 문서(developers.openai.com). 각 항목에 확인 URL 첨부.
목적: P1 스펙(S4) 확정값을 근거와 함께 고정. **모델명·규격은 기억이 아니라 이 문서(문서 확인)를 따른다.**

---

## 1. 사용할 API — Responses API

`client.responses.create({ model, instructions, input, stream })` 형태. 멀티턴 입력은 `input` 배열에 `{role, content}` 객체를 넣는다.
- 출처: https://developers.openai.com/api/docs/guides/conversation-state?api-mode=responses
- 출처: https://developers.openai.com/api/docs/guides/text?api-mode=responses

## 2. 역할(role) 어휘 — **`system` 없음, `developer`가 대체**

문서에 명시된 역할 3종:
- `developer` — "개발자가 준 지시. user 메시지보다 우선." (기존 system 역할의 기능)
- `user` — 최종 사용자 입력. developer보다 후순위.
- `assistant` — 모델이 생성한 메시지.

→ **`system` role은 문서에 없다.** 우리 대화 턴은 `user`/`assistant`뿐이므로 `Message.role { user, assistant }` enum은 그대로 유효.
- 출처: https://developers.openai.com/api/docs/guides/text?api-mode=responses

## 3. 페르소나 주입 — `instructions` 파라미터 (권장)

두 가지 방법:
1. **`instructions` 파라미터 (권장)**: 요청에 `instructions: "..."` 로 톤·목표·행동 지시를 준다.
   문서: "instructions 파라미터는 모델에게 톤·목표·올바른 응답 예시 등 고수준 지시를 준다."
2. **`developer` role 메시지**: `input` 배열 맨 앞에 `{role:"developer", content:"..."}`.

→ P1은 **`instructions` 파라미터에 `Artist.systemPrompt` 값을 주입**한다. (DB 필드명은 `systemPrompt`지만 의미는 OpenAI `instructions`.)
- 출처: https://developers.openai.com/api/docs/guides/text?api-mode=responses

## 4. 스트리밍 규격

- 옵션: `stream: true`.
- 소비: `for await (const event of stream) { ... }`.
- 이벤트 타입: `response.created`, `response.output_text.delta`, `response.completed`, `error`.
- **텍스트 토큰**: `response.output_text.delta` 이벤트의 **`event.delta`** 필드.
- **종료**: `response.completed` 이벤트.
- 예: `if (event.type === "response.output_text.delta") process.stdout.write(event.delta);`
- 출처: https://developers.openai.com/api/docs/guides/streaming-responses?api-mode=responses

## 5. 모델 (2026-09-16 문서 기준)

| 모델 id | 컨텍스트 | 입력/출력 (1M 토큰당) | 성격 |
|---|---|---|---|
| `gpt-6-astra` | 1.05M | $10 / $50 | 최상위, 가장 어려운 작업 |
| `gpt-5.6-sol` | — | $4 / $20 | |
| `gpt-5.6-terra` | 1.05M | **$2 / $12** | 지능·비용 균형(권장 기본) |
| `gpt-5.6-luna` | 1.05M | **$0.20 / $1.20** | 비용 민감·고volume |
| `gpt-5-mini` | — | $0.25 / $2 | 소형 |
| `gpt-5-nano` | — | $0.05 / $0.40 | 초소형 |
| `gpt-4o-mini` | — | $0.15 / $0.60 | 구형 소형 |

→ **P1 확정**: 기본 `gpt-5-nano`(최저비용 $0.05/$0.40). 이번 주는 시연이 아니라 학습/측정용 원샷을 여러 번 돌리므로 비용 최소화 우선. 톤 품질이 필요하면 `gpt-5.6-luna`로 상향 가능(환경변수 교체). 최종 목표는 자체 모델이라 OpenAI는 임시 백엔드.
- 출처: https://developers.openai.com/api/docs/models , https://developers.openai.com/api/docs/pricing

## 6. 인증·환경변수

- `OPENAI_API_KEY` 환경변수. 클라이언트로 절대 노출 금지 — 스트림은 서버(Route Handler) 경유.

## 7. 미확인 (코드 작성 시 재확인)

- **최대 출력 토큰 파라미터명**: `max_output_tokens` (Responses API). 모델 스펙 페이지의 "max output tokens" 표기와 일치 확인. P1 설정값 = 1000(모델 천장 16,384 중 채팅용으로 축소).
- Node SDK 패키지명(`openai`)·정확한 import 형태: 문서 예시 기준 `client.responses.create` 사용. quickstart 페이지 미확인.

---

## 스펙 S4에 넣을 확정값 (요약)

- **API**: OpenAI Responses API (`responses.create`)
- **모델**: 기본 `gpt-5-nano`(최저비용), 톤 필요 시 `gpt-5.6-luna`로 상향
- **역할**: `user` / `assistant` (system 없음, 지시는 `developer`)
- **페르소나 주입**: `instructions` 파라미터 = `Artist.systemPrompt`
- **스트리밍**: `stream:true`, `response.output_text.delta`의 `delta`에서 토큰, `response.completed`로 종료
- **환경변수**: `OPENAI_API_KEY`
- **출력 상한**: `max_output_tokens: 1000` (모델 천장 16,384 중 채팅용으로 축소)
