# SPEC — {앱 이름} (W{N})

> 작성 절차: 아래 인터뷰 프롬프트로 AI와 인터뷰 → 이 템플릿을 채움 → 사람이 승인
> → **새 세션**에 이 파일만 투입해 one-shot 실행.
>
> 인터뷰 킥오프 프롬프트:
> "I want to build [X]. Interview me in detail using the AskUserQuestion tool.
> Ask about technical implementation, UI/UX, edge cases, concerns, tradeoffs.
> Don't ask obvious questions, dig into the hard parts. Then write a complete
> spec following factory/SPEC_TEMPLATE.md."
>
> 섹션 S1~S5는 실험 변수다. 이번 주 스펙에 어떤 섹션을 포함했는지 로그의
> `spec_variant`에 기록한다 (예: S1+S2+S4).

## S0. 장면 (필수)

누가, 무엇을 하는 화면인가 — 한 문장.

## S0. 격차 (필수)

이 앱이 채우는 학습 항목 하나.

## S1. 사용자 경험 서술

사용자가 겪는 흐름을 화면 단위로 서술한다. 구현 방법은 쓰지 않는다.

## S2. 데이터 모델

엔티티, 관계, 핵심 필드. Prisma schema 수준의 정밀도면 충분하다.

## S3. 엣지 케이스

비어 있을 때 / 실패할 때 / 큰 입력일 때 / 동시에 일어날 때.

## S4. 비기능 제약

- 스택 고정: Next.js App Router + TypeScript + Prisma + Postgres(+pgvector), Vercel 배포
- 예산: LLM 호출 상한, 응답 시간 기대치
- 멱등성, row limit 등 원샷 실패 사례에서 배운 제약

## S5. 검증 명령

AI가 스스로 실행해 확인할 수 있는 명령들 (typecheck, lint, test, build).

## Acceptance Criteria (필수)

first-pass 판정 기준. 완료 선언 직후 사람이 체크한다.

- [ ] ...
- [ ] ...

## Out of Scope

이번 주에 하지 않는 것. 스트레치 목표는 여기에 "(스트레치)"로 표기.
