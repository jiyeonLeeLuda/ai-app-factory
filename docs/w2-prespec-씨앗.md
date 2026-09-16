# W2 pre-spec 씨앗 (버릴 초안 — 다음 세션 재료)

> ⚠️ **확정 스펙 아님.** 방식 검증 세션(2026-09-16)에서 떨어진 W2 제품 초안 + 선행조사 결과.
> 다음 세션은 이걸 갖고 **Step 0(축 tilt) → pre-spec 게이트(3축 감산) → SPEC_TEMPLATE** 순으로 시작.
> 방식·팩토리 공정 결정은 `docs/회고/2026-09-16-팩토리-스펙작성방식-결정.md` 참조(이 파일은 제품 내용, 저건 공정).

## 0. Step 0 — 목적·축 tilt·승리조건 (확정 2026-09-16)

- **목적 한 줄**: W1(채팅) 위에 음성 왕복(STT→LLM→TTS)을 얹어 "전화 거는" 장면을 실현하고, 실시간 음성 파이프라인을 실제로 엮어본다.
- **축 tilt** (기본 Y>X>Z 유지):
  - **Y 팩토리** = 1순위. 감산 게이트 첫 실전 — W1보다 개량된 팩토리 검증 자리.
  - **X JYP** = 2순위, 이번 주 유난히 실함 ("2020 vs 2026 전화걸기" 비교문서 = P2 전용 특이점 자산).
  - **Z 배움** = 3순위, 중간 (2020 안드로이드 네이티브 STT/TTS → 클라우드+ws는 부분 신규).
- **승리조건**:
  - **X-승**: JD 키워드 WebSocket 커버 + "2020 vs 2026" 비교문서 재료 확보.
  - **Y-승**: 감산 게이트가 격차 1개로 좁힘 + 원샷 first-pass(개입 0·자동검증 통과), 수렴 라운드 유지/감소.
  - **Z-승**: 클라우드 STT→LLM→TTS 왕복 + VAD/턴 + WebSocket 릴레이 실제 구현.

## 1. 거친 스케치 (지연 brain-dump, 날것)

- W1 채팅 위에 얹음. 채팅방 햄버거 버튼 → 메뉴 "전화걸기"(메신저 앱처럼).
- 전화 → 신호음(음악) → 연결. 아티스트가 보통 사람처럼 "여보세요? / hello?" **먼저** 시작(외국 출신이라 hello 자연스러움).
- 사용자가 음성으로 말하면 그 내용이 LLM으로 전달.

## 2. 이 세션에서 굳힌 방향

- **격차 = 음성 왕복 STT→LLM→TTS** (엉킨 조각 5개[STT/TTS/왕복/오디오전송/전화UX]에서 1개로 감산).
- **전송 배정: W2 = WebSocket / P2.5 = WebRTC** — JD 키워드 2개를 프로젝트마다 하나씩, 겹침 없음.
- **벤더 = OpenAI 단일** (W1 `OPENAI_API_KEY` 셋업 재사용). 스택짱 무료서비스 후보 탈락.
- **discrete(직접 오케스트레이션) 지향** — 통짜 speech-to-speech 블랙박스 회피로 배움(Z) 보존.

## 3. 선행조사 핵심 (2026, OpenAI 공식문서 근거)

- 🔴 **gpt-4o-mini-transcribe = HTTP `/audio/transcriptions` 전용. Realtime WebSocket 실시간 전사 불가.** → 지목 모델과 "ws 실시간 전사" 의도가 어긋남 (종이 위에서 잡힘).
- **Realtime API**(`gpt-realtime-2.1`) = speech-to-speech 통짜. 전송 WebSocket(서버 권장)/WebRTC(브라우저) 둘 다. 단 gpt-4o-mini-transcribe 교체 불가.
- OpenAI 공식 가이드: **입문자는 Chained**(STT→LLM→TTS 분리) 권장.
- **TTS**: `gpt-4o-mini-tts` (`/audio/speech`), 스트리밍 출력 O.
- **Vercel WebSocket**: 5분(Hobby)/~13분(Pro) 세션 한계. 학습·데모 PoC엔 충분, 상용 지속연결은 상주 서버(Railway/Fly.io) 권장.
- **비용**: transcribe $0.003/분 · tts 오디오출력 $12/1M · Realtime 오디오 $10(in)/$20(out) per 1M. 무료 크레딧은 공식문서 미확인.

## 4. 열린 결정 → 다음 세션 Step 0에서 축 점수로 끊기

| | **A. Chained + 내 WebSocket 릴레이** | **B. Realtime API (speech-to-speech)** |
|---|---|---|
| 전화느낌(X/장면) | 턴제(녹음→침묵VAD→STT→LLM→TTS). 2020 모델. 자연스러움 제한 | 진짜 양방향·barge-in. 강함 |
| 배움(Z) | STT→LLM→TTS 왕복 + VAD/턴감지 **직접** = 격차 그대로 | Realtime 통합 배움. 왕복은 블랙박스 |
| gpt-4o-mini-transcribe | 사용 O | 사용 X (gpt-realtime-2.1 전용) |
| 원샷·비용(Y) | 가벼움·저렴 | 무거움·비쌈 |
| 비교문서 서사(X) | "손으로 풀던 걸 새 도구로 다시 푼다"(슬로건 정합) | "이젠 API가 통째로 해준다"(특이점 아이러니) |

**Step 0 승리조건으로 채점 → A 확정.**
- **Y-승**: A가 가벼움·저렴 → 원샷 first-pass 유리. (B는 무겁고 비쌈)
- **Z-승**: A만 STT→LLM→TTS 왕복을 **실제로 엮음**. B는 왕복이 블랙박스 → Z-승 조건 미달.
- **X-승**: A가 WebSocket 커버 + "손으로 다시 푼다" 슬로건 정합. gpt-4o-mini-transcribe도 A에서만 사용 가능.
- B가 이기는 건 "진짜 양방향 전화느낌" 하나뿐인데, tilt상 그 장면 완성도는 **W2.5/W3 몫**이라 W2 감점 아님.

> **남은 실측 항목(Acceptance로)**: 턴제(VAD 침묵감지)가 통화로 충분히 자연스러운지 — 선택을 막진 않되 원샷 후 사람이 체크(run1 "타이핑≠말풍선" 교훈 — 자연스러움은 실측).

## 5. 원샷 함정 (A안 기준, 조사에서)

- 오디오 포맷: 브라우저 MediaRecorder = WebM/Opus. `/audio/transcriptions`는 파일/청크 기준(진짜 실시간 아님).
- **VAD·턴종료 감지 직접 구현**(언제 녹음 끊고 STT 호출할지 — 침묵 감지).
- Vercel WS 5분 한계 — W2 학습용은 OK.
- 지연: Chained 3단 순차 호출 체감 지연.

## 7. 놓친 것 / 다음 세션 채울 것 (완결성 체크 2026-09-16, `스펙-작성-체크리스트.md` 대조)

**🟢 auth → 미룸 확정 (2026-09-16):**
- W2 = 음성 왕복 **단일 격차** 유지(격차 하나 원칙). 금요일 1차 시연에 auth 불필요.
- auth는 **W4(RAG·개인화 — 사용자 식별 선행 필요) 직전 전용 슬롯**으로(위치 미정). W1 auth-ready 스키마(email 앵커·nullable 칸)는 그때까지 대기, 그 주에 p1-spec S2c 5규칙(userId 재발급 금지·현재유저 판별 모듈 격리·zod email 등) 적용.

**🟢 S2 데이터 모델 (결정됨):**
- **통화는 휘발 — DB 미저장** (전사 텍스트도 오디오 blob도 저장 안 함). 통화 내 턴 히스토리는 세션 메모리로만. → W1 텍스트채팅=영속 / W2 통화=휘발, 결이 다름.
- **첫 턴은 assistant** ("여보세요/hello" 아티스트 선턴). W1(user 선턴)과 바뀜 — 명시.

**🟡 S3 음성 엣지케이스 (아직 0개):** STT 빈 결과·침묵 타임아웃, mic 권한 거부, 통화 중 새로고침·네트워크 끊김, TTS 실패, 긴 응답=비싼 오디오.

**🟡 S4 제약값:**
- `max_output_tokens` = **1000 확정**(W1과 동일). 단 1000토큰 음성은 긴 독백 → 필립 페르소나가 **짧게 끊어 말하게**(W1 톤) 받쳐야 함.
- STT/TTS 파라미터: 언어(ko/en 혼용 — "hello"), TTS voice(필립용), 오디오 포맷(입력 WebM/Opus, 출력 mp3).
- 의존성 핀: OpenAI SDK·ws 라이브러리 버전.
- **Realtime API 의도적 미사용** 명시(데이터 소유·비용·배움 근거).

**🟢 사람 준비물:** 새 prereq 없음(`OPENAI_API_KEY`가 STT/TTS 커버) — 확인만.

**Out of Scope 명시:** 립싱크·영상(W3), 서버 아바타 렌더(W3), 진짜 양방향 barge-in(W2.5/W3).

## 6. 선행조사 원문 (다음 세션 PRE-SPEC S4 근거로)

- https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe
- https://developers.openai.com/api/docs/models/gpt-4o-mini-tts
- https://developers.openai.com/api/docs/guides/realtime-websocket
- https://developers.openai.com/api/docs/guides/voice-agents
- https://developers.openai.com/api/docs/guides/text-to-speech
- https://developers.openai.com/api/docs/pricing
- https://ably.com/vercel/websockets-on-vercel
- https://github.com/vercel/next.js/discussions/95514
- https://developers.openai.com/cookbook/examples/speech_transcription_methods
