# AI App Factory

7주(2026-09-14 ~ 10-31) 동안 매주 앱 1개를 AI one-shot 파이프라인으로 만들고,
매주의 실패 데이터로 파이프라인 자체를 개선하는 실험 로그.

- 앱이 아니라 **공장을 개선하는 기록**이 산출물: "7주 동안 앱 7개"가 아니라
  "매주 실패 데이터로 개발 시스템을 개선했다".
- 각 앱은 **학습 격차 하나 + 장면 하나**(누가 뭘 하는 화면인지)를 가진다.
- 측정 정의는 [CONTEXT.md](./CONTEXT.md), 실행 기록은 [metrics.csv](./factory/metrics.csv).

## 원칙

- 회사 코드와 데이터는 사용하지 않는다. 도메인 지식(이커머스 운영)만 쓴다.
- 표준 스택 고정: Next.js App Router + TypeScript + Prisma + Postgres(+pgvector), Vercel 배포.
- 실험의 최소 단위는 앱 완성이 아니라 **로그 한 페이지 완성**.

## 라인업 (Season 1)

| 주 | 앱 | 장면 | 채우는 격차 |
|---|---|---|---|
| W1 | 리뷰→필터 UI 생성기 | 상품 리뷰 뭉치를 넣으면 필터 UI가 자라나는 화면 | structured output, RSC |
| W2 | 환불 승인 인박스 | CS가 AI의 환불 판정 제안을 근거와 함께 승인/반려 | function calling, HITL, auth |
| W3 | RAG 디버거 | 청킹·검색·답변 3칸, 설정 바꿔 전/후 비교 | RAG, pgvector |
| W4 | 채점판 | W1~W3 출력의 golden set + LLM judge 회귀 채점 | evaluation |
| W5 | Factory 자체 개선 | 실패 로그를 다음 스펙에 자동 삽입 | feedback loop |
| W6 | 지원 레이더 | 공고 구조화 + 이력서 대조 격차 리포트 | 실사용 dogfooding |
| W7 | 버퍼 | — | — |

## 구조

```
factory/          템플릿, 지표 (공장 본체)
  SPEC_TEMPLATE.md
  LOG_TEMPLATE.md
  metrics.csv
apps/             매주 산출물 (w01-review-filter, ...)
logs/             주간 로그 (w01.md, ...)
CONTEXT.md        용어집 — 측정 정의의 단일 원천
```
