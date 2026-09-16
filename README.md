# AI App Factory

7주(2026-09-14 ~ 10-31) 동안 AI와 개발에 대한 빈 지식을 채우기 위해
풀스택 앱을 직접 만들고, 그 과정에서 반복 가능한 개발 방식을 쌓아 가는 실험 로그.

이 문서는 Season 1의 초안 기록이다. 7주 계획을 고정된 로드맵으로 따르기보다,
매일 직접 진행하면서 더 나은 방식이 보이면 계획과 공장 규칙을 함께 고친다.
처음부터 공장을 완성해 두고 앱을 찍어내는 것이 아니라, 앱을 만들며 배운 것을
템플릿, 체크리스트, 실행 규칙으로 남기면서 공장을 지어 간다.

- 앱이 아니라 **학습과 공장 개선의 기록**이 산출물: "계획한 앱을 모두 만들었다"가 아니라
  "앱을 만들며 빈 지식을 채우고 개발 시스템을 개선했다".
- 각 앱은 **학습 격차 하나 + 장면 하나**(누가 뭘 하는 화면인지)를 가진다.
- 측정 정의는 [CONTEXT.md](./CONTEXT.md), 실행 기록은 [metrics.csv](./factory/metrics.csv).

## 원칙

- 회사 코드와 데이터는 사용하지 않는다. 도메인 지식(이커머스 운영)만 쓴다.
- 표준 스택 고정: Next.js App Router + TypeScript + Prisma + Postgres(+pgvector), Vercel 배포.
- 실험의 최소 단위는 앱 완성이 아니라 **로그 한 페이지 완성**.

## 이번 주 목표 (W1)

2026-09-18 금요일까지 배포 가능한 풀스택 앱을 하나 만든다.

앱 주제, 장면, 학습 격차는 이번 주 진행 중에 확정한다. 이번 주의 우선순위는
아이디어의 정교함보다 **배포 가능한 end-to-end 결과물**이다.

## 라인업 초안 (Season 1)

아래 라인업은 시작점일 뿐이다. 매일/매주 실행하면서 더 나은 방향이 보이면 바꾼다.

| 주 | 앱 | 장면 | 채우는 격차 |
|---|---|---|---|
| W1 | 리뷰→필터 UI 생성기 | 상품 리뷰 뭉치를 넣으면 필터 UI가 자라나는 화면 | structured output, RSC |
| W2 | 환불 승인 인박스 | CS가 AI의 환불 판정 제안을 근거와 함께 승인/반려 | function calling, HITL, auth |
| W3 | RAG 디버거 | 청킹·검색·답변 3칸, 설정 바꿔 전/후 비교 | RAG, pgvector |
| W4 | 채점판 | W1~W3 출력의 golden set + LLM judge 회귀 채점 | evaluation |
| W5 | Factory 자체 개선 | 실패 로그를 다음 스펙에 자동 삽입 | feedback loop |
| W6 | 지원 레이더 | 공고 구조화 + 이력서 대조 격차 리포트 | 실사용 dogfooding |
| W7 | 버퍼 | — | — |

## 원샷 경계: 사람이 준비할 것 vs AI(원샷)가 하는 것

원샷을 돌리기 전에 **사람이 인프라를 준비**해야 하고, 그 위에서 **AI가 코드를 짓는다.**
경계 원칙: **바깥 세계의 상태(서버·계정·시크릿)는 사람, 코드·파일·명령은 AI.**
AI는 시크릿을 발급하거나 외부 서비스를 프로비저닝하지 않는다.

| 구분 | 누가 | 예시 |
|---|---|---|
| 실행 환경·공유 시크릿 | **사람** (원샷 전, 한 번) | DB 서버 기동, **`CREATEDB` 권한 role 생성**, `factory/.env.shared`에 `OPENAI_API_KEY`+`CREATE_DB_URL`, Node 런타임, (배포 시) Vercel 프로젝트·환경변수 |
| 폴더·앱 `.env`·**DB 생성**·코드 | **AI** (원샷) | 앱 폴더 리셋(해당 폴더만), 프로젝트 생성, `factory/.env.shared`로 앱 `.env` 생성(DB 이름은 앱 슬러그), **DB 생성**+`prisma migrate`+`db seed`, 앱 구현, typecheck/lint/build, 로컬 실행 |

> 시크릿은 `factory/.env.shared`·앱 `.env`에만 두고 `.env*`는 `.gitignore` 처리 — 비번·API 키를 git에 커밋하지 않는다. 공유 원본(`factory/.env.shared`)은 사람이, 앱별 `.env`는 원샷이 생성한다.

- 원칙: 원샷은 "접속 정보만 있으면 되는 안쪽 일"만 한다. DB를 *띄우는* 건 사람, DB에 *테이블을 만들고 채우는* 건 AI.
- 각 주 SPEC은 상단에 **"사람 준비물(Prerequisites)"**을 명시해, 원샷 시작 전 체크 가능하게 한다.
- 예 (W1/P1, 옵션 C): 사람 = 로컬 Postgres 기동 + `CREATEDB` 권한 role 생성 + `factory/.env.shared`(공유 키·베이스 접속). AI = 폴더 리셋·앱 `.env` 생성·DB 이름/생성·테이블(migrate)·시드·구현 등 나머지 전부.

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
