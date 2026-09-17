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

## 이번 주 목표 (W2.5) — 얼굴 트래킹 영상통화

음성통화(W2) 다음, WebRTC로 사람↔사람 **양방향 영상통화**를 만들고 받는쪽 얼굴을 실시간으로 **3D 캐릭터**에 트래킹한다.

- **앱**: 얼굴 트래킹 영상통화(페르소나 "luda"). 폴더 `apps/w025-face-track-call/`.
- **장면**: 팬이 영상통화를 걸면, 받는쪽(아티스트 luda)이 자기 웹캠 표정을 따라 하는 **3D 캐릭터**로 보인다. 팬은 생얼, 큰 화면=상대·우측상단 PIP=자기.
- **격차**: 웹캠 얼굴 트래킹 → **3D VRM 캐릭터 실시간 구동** + WebRTC P2P 전송(**B안** = DataChannel로 표정 숫자만 보내고 수신측이 직접 렌더).
- **스펙**: [docs/w2.5-spec.md](./docs/w2.5-spec.md) — **2부 구조**(1부 = [p1-spec.md](./docs/p1-spec.md) 얇은 재현, 2부 = 영상통화). 설계회고 [캐릭터 전송 A/B 트레이드오프](./docs/회고/2026-09-17-w2.5-캐릭터전송-A영상-vs-B데이터-트레이드오프.md), 다음 주 씨앗 [w3-prespec-씨앗.md](./docs/w3-prespec-씨앗.md).
- **준비물**: W1 기본 + **신규 2개** — `factory/luda.vrm`(VRoid VRM 1.0 모델), `factory/certs/*.pem`(mkcert 내부망 HTTPS). DB는 원샷이 `w025_face_track_call`로 생성. (영상통화는 휘발 — 저장 없음)
- **이번 주 방식**: 감산형 pre-spec 게이트 + **grilling 압박 검증**(Q1~Q12) 통과 후 2부 원샷. 측정은 **1부=회귀 게이트 / 2부=격차 점수**로 분리.

> **W1·W2 완료** — W1(P1 페르소나 채팅) 앱 `apps/w01-persona-chat/`, 로그 [logs/w01.md](./logs/w01.md); W2(P2 음성통화) 앱 `apps/w02-voice-call/`, 스펙 [w2-spec.md](./docs/w2-spec.md), first-pass 성공(2026-09-17). (p1-spec은 W2 grilling 함정 5개 예방책으로 개정됨)

## 라인업 (Season 1)

**현재 방향 = JYP 대응 P-라인업** ([docs/계획-jyp-특이점-라인업.md](./docs/계획-jyp-특이점-라인업.md)). 하나의 AI 아티스트 서비스로 합쳐지는 앱들.

| 주 | 앱 | 장면 | 채우는 격차 |
|---|---|---|---|
| **W1 (완료)** | **P1 AI 페르소나 채팅** | 팬이 가상 아티스트와 실시간 대화, 토큰 스트리밍 | **LLM 토큰 스트리밍** |
| **W2 (완료)** | P2 AI 음성 통화 | AI 아티스트에게 전화 (STT→LLM→TTS) | STT/TTS, WebSocket 오디오 릴레이 |
| **W2.5 (현재)** | 얼굴 트래킹 영상통화 | 양방향 영상통화에서 받는쪽 얼굴을 트래킹해 3D 캐릭터로 구동(팬은 생얼) | WebRTC P2P + 얼굴 랜드마크 트래킹 + VRM 3D 렌더 |
| **W2.9** | RN 앱 포팅 | W1~W2.5를 React Native로 iOS/Android 포팅 (옛 P3 흡수) | React Native, react-native-webrtc |
| **W3 (도전과제)** | AI 영상통화 | AI 아티스트와 영상통화 — 음성에 맞춰 입모양(립싱크)까지 따라온다 | **STT/TTS 지연 최소화 + TTS 구동 립싱크 아바타 렌더** |
| W4 | P6 페르소나 장기기억 (RAG) | 아티스트가 팬의 과거 대화·세계관을 기억하고 꺼내 씀 | 임베딩·pgvector 검색·재순위 (RAG 파이프라인) |
| W5 | P4 발화 승인 게이트 | AI 발화를 사람이 검수·승인, 위험 발화 플래그 | function calling, HITL |
| W6 | P5 실시간 관제판 | W1~W3의 지연·비용·오류 대시보드 + Sentry | feedback loop, 운영 계측 |
| W7 | 버퍼 / 지원 레이더 | 공고 구조화 + 이력서 대조 | 실사용 dogfooding |

> 순서·구성은 진행하며 조정한다. 옛 W-라인업(리뷰→필터 등)은 P-라인업으로 교체됨.
> **영상통화 난이도를 3단으로 분해**: 음성 왕복(W2, WebSocket) → 양방향 영상 + 얼굴 표정 트래킹 3D 캐릭터(W2.5, WebRTC P2P — 미디어서버 없이 DataChannel B안) → **AI 영상통화(W3, 도전과제 — 클라 렌더, 미디어서버 없음)**. W3가 핵심 어필 라인 — **STT/TTS 지연 최소화 + 음성 구동 립싱크 아바타**가 JYP 공고의 "AI 생성 영상 스트리밍 + 리얼타임 백엔드 + 고성능 API"에 직결. JD 키워드는 WebSocket(W2)·WebRTC(W2.5)로 분산. RN 포팅은 W2.9로 앞당겨(옛 P3 흡수) 이후를 RN 위에서 쌓는다. 발화 승인 게이트는 W5.
> **auth(계정·인증)는 W2에서 분리** — JD 헤드라인이 아니고 1차 시연에도 불필요. 제품상 사용자 식별이 필요해지는 **W4(RAG·개인화) 직전 전용 슬롯**으로 미룸(위치 미정). W1이 깔아둔 auth-ready 스키마가 그때 쓰인다.

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
- **W2 준비물 = W1과 동일** (새 prereq 없음): 위 셋(Postgres·`factory` role·`.env.shared`)이면 충분. `OPENAI_API_KEY` 하나가 STT·LLM·TTS를 모두 커버하고, DB(`w02_voice_call`)는 원샷이 생성한다. (음성 통화는 휘발 — 통화 내용 DB 저장 없음)

## 구조

```
factory/          템플릿, 지표 (공장 본체)
  SPEC_TEMPLATE.md
  LOG_TEMPLATE.md
  metrics.csv
  .env.shared      공유 시크릿 원본 (gitignore, 사람이 관리)
docs/             스펙·계획·조사·회고
  p1-spec.md               P1 스펙 (원샷 입력)
  p1-원샷-킥오프.md         새 세션 투입용 지시문
  스펙-작성-체크리스트.md    스펙 작성 공정 규칙
  api-선행조사-openai.md    API 선행조사 근거
  회고/                     AI 협업 회고
apps/             매주 산출물 (w01-persona-chat, ...)
logs/             주간 로그 (w01.md, ...)
CONTEXT.md        용어집 — 측정 정의의 단일 원천
```
