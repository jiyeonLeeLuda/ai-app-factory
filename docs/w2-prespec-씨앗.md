# W2 pre-spec 씨앗 (버릴 초안 — 다음 세션 재료)

> ⚠️ **확정 스펙 아님.** 방식 검증 세션(2026-09-16)에서 떨어진 W2 제품 초안 + 선행조사 결과.
> 다음 세션은 이걸 갖고 **Step 0(축 tilt) → pre-spec 게이트(3축 감산) → SPEC_TEMPLATE** 순으로 시작.
> 방식·팩토리 공정 결정은 `docs/회고/2026-09-16-팩토리-스펙작성방식-결정.md` 참조(이 파일은 제품 내용, 저건 공정).

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

**기록자 lean = A** (Y 팩토리 우선 + Z 왕복배움 + X 비교문서 슬로건이 다 A로 모임, 2020 baseline도 턴제라 비교가 사과 대 사과). **미확정** — 포기하는 "진짜 양방향 전화느낌"이 W2에 필요한지는 지연 값 판단 + 실측(턴제 자연스러움) 대상.

## 5. 원샷 함정 (A안 기준, 조사에서)

- 오디오 포맷: 브라우저 MediaRecorder = WebM/Opus. `/audio/transcriptions`는 파일/청크 기준(진짜 실시간 아님).
- **VAD·턴종료 감지 직접 구현**(언제 녹음 끊고 STT 호출할지 — 침묵 감지).
- Vercel WS 5분 한계 — W2 학습용은 OK.
- 지연: Chained 3단 순차 호출 체감 지연.

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
