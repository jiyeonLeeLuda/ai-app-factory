# W3 pre-spec 씨앗 — AI 아바타 영상통화 (미디어서버 불필요 결론)

> 성격: **다음 세션(W3) 자산.** 이번 W2.5 스펙과 섞지 않는다(측정선 오염 금지).
> 출처: 다른 세션 기술검토(2026-09-17). 아래 원문은 지연 검토 결과 — 자산으로 원문 보존.
> W2.5 세션에서 첨부됨 → W3 진입 시 이 문서로 부팅.

## 이 문서가 W2.5에 준 함의 (이번 세션에서 정리)

- **미디어 서버가 라인업에서 빠진다.** W3 = 3D 전부 클라이언트 렌더, 서버는 API 키 프록시 하나. → 애초 "W2.5 P2P 연습 → W3 미디어서버 연습" 루트의 **후반부 소멸**.
- **진짜 이어받기 자산 = VRM 렌더/expression 파이프라인.** 구동 소스만 바뀜:
  - W2.5 = **웹캠 얼굴 트래킹**(MediaPipe 52 blendshape → VRM 16 expression 매핑 + head pose)
  - W3 = **AI 오디오 진폭 → 입(`aa`) + LLM emotion → 표정**
  - 렌더 수신부(`vrm.expressionManager.setValue`)는 동일 → W2.5에서 만든 매핑/렌더 로직 재사용.
- W2.5의 WebRTC P2P는 W3로 직접 안 이어짐(W3는 클라↔프록시). W2.5 P2P 명분은 **JD 키워드(WebRTC 리얼타임) + 사람↔사람 시나리오** 독립 자산으로 유지.

## W3 핵심 결론 (검토 확정 사항)

- 상대는 AI. **사람 얼굴 트래킹 없음** — 아바타는 AI 오디오+emotion으로 구동.
- 파이프라인: STT → LLM(JSON `{text, emotion}` 구조화 출력) → TTS 오디오 스트림 → 클라에서 오디오 진폭으로 입 벌림 + emotion으로 표정 전환.
- 서버 = LLM/TTS 키 숨기는 프록시만(Cloudflare Workers 또는 Vercel 함수). 미디어서버·서버사이드 렌더 없음.
- 제외 옵션: Ready Player Me(2026-01 종료), Apple Memoji(export API 없음), 서버 렌더 픽셀스트리밍(GPU 비용·지연·과잉).

## 원문 (지연 다른 세션 기술검토 — 보존)

```
## 프로젝트: AI 아바타 영상통화 앱

3D 캐릭터가 AI와의 대화 내용을 TTS로 말하며, 오디오에 맞춰 입을 움직이고 감정에 따라 표정을 짓는 앱. 영상통화 UI지만 상대는 AI이며, 사람 얼굴 트래킹은 하지 않는다. 웹으로 먼저 완성한 뒤 React Native 웹뷰로 포팅할 예정이다.

## 아키텍처 (확정)

- 3D 렌더링은 전부 클라이언트(브라우저/웹뷰 WebGL)에서 수행한다. 미디어 서버, 서버 사이드 렌더링은 사용하지 않는다.
- 서버는 LLM/TTS API 키를 숨기는 프록시 하나만 둔다 (Cloudflare Workers 또는 Vercel 함수).
- 파이프라인: STT → LLM(JSON `{ "text": string, "emotion": string }` 구조화 출력) → TTS 오디오 스트림 → 클라이언트에서 오디오 진폭으로 입 벌림, emotion 값으로 표정 전환.

## 기술 스택 (확정)

- 모델: VRoid Studio에서 직접 제작한 VRM 1.0 파일. 표정 `aa, ih, ou, ee, oh, blink, happy, angry, sad, relaxed, surprised, neutral` 내장. 라이선스 문제 없음.
- 렌더: three.js + `@pixiv/three-vrm`. `vrm.expressionManager.setValue(name, value)`로 블렌드셰이프 제어.
- 입모양: Web Audio API `AnalyserNode`로 실시간 볼륨 추출 → `aa`에 대입, lerp 스무딩. 정밀한 비짐 타임스탬프 동기화는 하지 않는다("적당히 오물오물" 수준이 목표).
- 표정: emotion → VRM 표정 1:1 매핑, 약 0.3초 lerp로 전환.
- 대기 상태: 응답을 기다리는 동안 눈 깜빡임·미세한 호흡 애니메이션을 유지한다.
- 지연 대책: LLM 스트리밍 응답 + 문장 단위로 TTS 분할 요청.

## RN 웹뷰 포팅 시 고려사항

- 마이크 권한은 iOS/Android 각각 네이티브 설정 필요. `AudioContext`는 사용자 터치 이후 `resume()` 호출.
- STT는 웹뷰 내 Web Speech API가 불안정하므로 RN 네이티브 STT 모듈을 사용하고 결과 텍스트를 `postMessage`로 웹뷰에 전달한다. 웹 코드는 STT/오디오 권한이 외부에서 주입될 수 있게 설계한다.
- 모델 경량화(텍스처 1K, 파일 10MB 이하), `devicePixelRatio` 1 고정, WebGL 실패 시 2D 스프라이트 폴백.

## 검토 후 제외한 옵션

- Ready Player Me: 2026년 1월 서비스 종료로 사용 불가.
- Apple Memoji: 3D 데이터 export API가 없어 사용 불가.
- 서버 렌더링(픽셀 스트리밍): 동시 접속자 비례 GPU 비용, 추가 지연, 1:1 애니풍 모델에는 과도함.

## 현재 진행 상태

VRoid Studio에서 캐릭터 제작 및 VRM 1.0 export 완료.

## 다음 마일스톤

VRM 로드 + 로컬 mp3 파일 재생에 맞춰 입 벌리기 구현 (LLM/TTS API 없이 렌더 파이프라인만 검증).
```

## W3 진입 시 확인거리 (미해결)

- STT 경로: 웹 Web Speech API vs 서버 STT(W2 자산: OpenAI `/audio/transcriptions`) — RN 포팅 고려하면 외부 주입 설계.
- 프록시 위치: Cloudflare Workers vs Vercel 함수 vs W2 custom server 연장 — W2 자산 정합성 검토.
- W2.5에서 만든 웹캠→expression 매핑 로직이 오디오/emotion 구동으로 얼마나 재사용되나(공통 파이프라인 실측).
