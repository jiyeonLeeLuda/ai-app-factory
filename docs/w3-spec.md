# SPEC — AI 아바타 음성통화 (W3)

> 작성 2026-09-17 (v1.0, 오토모드). 재료: `docs/w3-0단계-점수표.md`(감산)·`docs/w3-선행조사.md`(증거)·`docs/w3-기획.md`(설계판단+grilling)·씨앗 `docs/w3-prespec-씨앗.md`. spec_variant: S1+S2+S3+S4+S5
>
> **이 파일 하나만 새 세션에 투입해 one-shot 실행한다. 원샷은 2부 구조다:**
> - **1부** — 빈 `apps/w03-ai-avatar-call/` 폴더에서 **W1 SPEC(`docs/p1-spec.md` 개정본)을 그대로 실행**해 검증된 채팅 앱을 세운다(W1 재현 = 팩토리 회귀 게이트). 얇게 — 채팅 스트리밍까지 재현, 측정은 회귀 통과/실패 이진.
> - **2부** — 그 위에 이번 격차 **AI 아바타 음성통화**를 얹는다. 이 SPEC 본문은 **2부만** 상세 규정, 1부는 p1-spec.md에 위임.
>
> **W3는 W2·W2.5보다 단순하다 — 1인 사용(팬↔서버).** WebRTC·P2P·시그널링·룸·역할·2번째 기기가 **전부 불필요**. 브라우저↔서버 ws(오디오 릴레이)만. → **W2.5의 `lib/rtc`·`lib/signaling` 재사용 금지**, W2의 `lib/voice`·`lib/audio`·`lib/ws` 재사용.
>
> **재사용 지도 (핵심 — 격차는 "구동 소스 교체" 하나):**
> | 계층 | 출처 | W3에서 |
> |---|---|---|
> | 채팅(가입·리스트·스트리밍) | W1 `p1-spec.md` | 1부 그대로 |
> | STT→LLM→TTS 왕복·문장단위 mp3·ws 릴레이·mic 캡처/VAD·오디오 재생 | **W2** `lib/voice`·`lib/audio`·`lib/ws`·`lib/sentence` | 재사용 + emotion 구분자 파서만 추가 |
> | VRM 렌더(three-vrm·expressionManager·얼굴 클로즈업·A포즈 팔) | **W2.5** `lib/render/characterRenderer.ts` | 재사용, **구동 소스만 교체**(웹캠→오디오/emotion) |
> | 오디오 진폭→입(`aa`) 립싱크 | **신규** `lib/lipsync/` | 이번 격차 ① |
> | LLM emotion→표정 lerp | **신규**(구분자 프로토콜) | 이번 격차 ② |
> | WebRTC·시그널링·룸·역할·트래킹(MediaPipe) | — | **없음**(W2.5 P2P·트래킹 전부 제외) |
>
> **사람 준비물 (원샷 시작 전)** — W1 기본 + W3 신규:
> ① Postgres 기동(`pg_isready`), ② `CREATEDB` 권한 role(예: `factory`), ③ `factory/.env.shared`에 `CREATE_DB_URL`+`OPENAI_API_KEY`(STT·LLM·TTS 전부 이 키 하나), ④ Node 런타임,
> ⑤ **[W3 필수] VRM 파일** — `factory/luda.vrm`(VRoid VRM 1.0, 표정 `aa/ih/ou/ee/oh/blink/happy/angry/sad/relaxed/surprised/neutral` 내장). 원샷이 `public/models/luda.vrm`로 복사.
> ⑥ **[선택] mkcert 인증서** `factory/certs/*.pem` — **모바일/내부망 실측 시에만.** 노트북 localhost 자동검증·기본 실측은 **불필요**(localhost는 secure context라 http로도 mic 열림). 폰 UX 확인을 원할 때만 https로 서빙(W2.5 자산 계승).

## S0. 장면 (필수)

팬이 luda와의 채팅방에서 **📞 통화 버튼**을 누르면 통화 화면이 열리고, **luda가 3D 아바타(얼굴 클로즈업)로 먼저 "여보세요"라고 말을 건다.** 팬이 마이크로 말하면 luda가 알아듣고 **자기 목소리(TTS)에 맞춰 입을 움직이며** 대답하고, **대화 감정에 따라 표정(웃음·슬픔·놀람 등)이 바뀐다.** 화면은 luda 아바타가 꽉 채우고(팬 자기 영상 없음), 하단에 통화 상태·마이크 인디케이터·음소거/끊기 컨트롤이 있다.

## S0. 격차 (필수)

**이미 만든 VRM 렌더러를 웹캠이 아니라 AI 출력으로 구동한다: ① TTS 오디오 진폭 → 입(`aa`) 립싱크, ② LLM emotion → 표정 전환.**
경로: 팬 mic → (W2 왕복) STT→LLM→TTS mp3 → 클라 재생 **+ 재생 오디오 진폭을 `AnalyserNode`로 뽑아 `aa` 구동** / LLM 응답 선두 **`[[emotion]]` 태그**를 파싱해 **VRM 표정 1:1 lerp**. 렌더 수신부(`vrm.expressionManager.setValue`)는 W2.5 그대로 = 재사용. **구동 계층만 신규.**

## S1. 사용자 경험 서술

W1 흐름(가입/리스트/채팅방/스트리밍)은 **1부에서 그대로 산다**(p1-spec.md S1). 2부가 더하는 것만 서술한다.

1. **통화 진입**: 채팅방(luda 방) 우상단 **📞 통화 버튼** → 통화 화면(`/call/[artistId]`)으로 이동. 방번호·역할 선택 **없음**(1인 사용 — W2.5의 룸/역할 UI 제거).
2. **통화 시작(권한+unlock)**: 통화 화면에 **"📞 통화 시작" 버튼**이 오버레이로 뜬다. 누르면 그 **한 제스처**에서 ①마이크 권한 요청(`getUserMedia({audio:true})`) ②무음 `<audio>` unlock ③`audioContext.resume()`를 **모두** 수행(오디오·립싱크 잠금 동시 해제). 마운트 자동요청 금지(iOS 제스처 정책·dev 재마운트 레이스).
3. **아바타 로드·대기**: luda.vrm이 로드돼 **얼굴 클로즈업**으로 화면을 채운다. 로드 중엔 로딩 표시. 대기 중엔 **눈 깜빡임 + 미세한 호흡**으로 살아있게(정지 화면 금지).
4. **첫 턴 = luda 선턴**: 연결되면 팬 입력 없이 **luda가 먼저** "여보세요"를 TTS로 말한다(W2 패턴). 그 목소리에 맞춰 **입이 움직이고**, 선두 emotion 태그(예 `[[relaxed]]`)대로 표정을 짓는다.
5. **팬 발화**: 팬이 말한다 → mic 캡처 → 침묵(VAD)으로 턴 종료 감지 → 서버가 STT→LLM→TTS. 화면 상태 "듣는 중 → 생각 중 → 말하는 중".
6. **luda 응답(격차 코어)**: 서버가 LLM 응답을 스트리밍으로 받아 **선두 `[[emotion]]` 태그를 즉시 파싱→클라에 emotion 전송**(표정 lerp 시작), 태그 뗀 텍스트를 **문장 경계로 잘라 문장마다 TTS(mp3) 생성→도착 순 재생**(W2). 클라는 재생 중 오디오 진폭으로 **입(`aa`)을 구동** → luda가 말하며 입을 움직인다.
7. **표정**: emotion 값(happy/angry/sad/relaxed/surprised/neutral) → VRM 표정 1:1, **~0.3s lerp**로 부드럽게 전환. 1응답=1 emotion(first-pass).
8. **마이크 인디케이터**: 팬이 말할 때 하단에 **입력 음량 바**가 반응(자기 영상 대신 "들리고 있음" 피드백). 자기 웹캠 영상·PIP **없음**.
9. **음소거·종료**: **음소거** 버튼(mic 트랙 enabled 토글), **끊기**로 통화 종료→채팅방 복귀. **통화·오디오·전사값은 저장 안 함**(휘발, 개발 로그는 stderr만). 새로고침·이탈 시에도 종료.

## S2. 데이터 모델

**W3은 새 테이블을 추가하지 않는다.** W1 스키마(User/Artist/Conversation/Message)는 1부에서 그대로 생기고(p1-spec.md S2), 2부는 그 위에 얹힌다.

- **아티스트 = luda(여성 페르소나)**: seed 아티스트를 **luda**로(`Artist.name="luda"`, `Artist.systemPrompt`에 luda 페르소나 + "전화 통화 중, 짧고 자연스러운 구어체" 맥락 + **emotion 태그 규약**). 통화는 이 아티스트 방에서만.
- **통화는 휘발 — DB 미저장.** 오디오·전사·LLM응답·emotion·립싱크값 무엇도 저장 안 함. 통화 세션 히스토리는 **ws 연결별 메모리 배열**(`[{role,content}]`)로만 유지, 끊기면 소멸(W2와 동일).
- **auth 미룸**: W1 쿠키 세션(`userId`)만. 통화는 로그인 없이 채팅방에서 바로. (진짜 auth = W4 직전 슬롯)
- **VRM은 에셋(정적 파일)**: DB 아님. `public/models/luda.vrm` 서빙.

## S3. 엣지 케이스

W1 엣지는 1부 커버(p1-spec.md S3). 2부만:

- **비어 있음(STT 빈 결과)**: 전사가 비었거나 노이즈뿐이면 그 턴을 **버리고 "듣는 중"으로 복귀**(luda가 지어내지 않음). 필요 시 "잘 안 들렸어" 짧은 재청(W2).
- **emotion 태그 누락/무효**: 선두 ~24자에 유효 `[[emotion]]`이 없거나 값이 enum 밖(`[[excited]]` 등)이면 **`neutral`로 폴백**, 전체를 발화로 처리(크래시·무음 금지). (grilling G2)
- **발화 중간 `[[…]]`**: 파서는 **선두 태그 1개만** 제거. 문장→TTS 직전 **stray `[[...]]` 정규식 제거(sanitize)** 로 TTS가 대괄호를 읽지 않게. instructions에 "태그는 맨 앞 한 번만" 명시. (grilling G1)
- **립싱크 무음/throw**: `createMediaElementSource`는 element당 1회(재호출 throw) → 오디오 엘리먼트·소스노드 **앱 수명 1개 재사용**. analyser 물리면 **destination에도 반드시 connect**(안 하면 무음). cross-origin 오디오는 analyser가 0 반환 → **same-origin/blob mp3만**. (선행조사 §2)
- **재생 정지/문장 사이**: 오디오 `paused||ended`면 **`aa`→0**(입 다물기). 문장 교체 중 잠깐 입 닫힘 = 자연스러운 호흡으로 허용.
- **LLM/STT/TTS API 실패**: 해당 턴 실패 처리 + 짧은 오류 상태 후 "듣는 중" 복귀(통화 유지). 부분 오디오·더러운 데이터 안 남김.
- **긴 응답 = 비싼 오디오**: `max_output_tokens:1000` 상한 + 페르소나가 짧게 끊어 말해 방어(W2).
- **권한 거부**: 진짜 거부(`NotAllowedError`)면 명확한 안내+재시도. 중단류(`AbortError`/`InvalidStateError`)는 사용자 거부 아니므로 **조용히 무시**(오탐 방지). 권한 허용 후에만 통화 시작(빈 통화 금지).
- **secure context 미충족**: `window.isSecureContext=false`(내부망 IP인데 http)면 mic 불가 → "HTTPS로 접속해야 마이크를 쓸 수 있어요" 안내(팬텀 준비물 방지). ※ localhost는 secure context라 http로도 OK.
- **아바타 로드 실패/지연**: VRM 로드 전엔 로딩 표시(빈 캔버스 금지). 로드 실패 시 오류 안내(통화 오디오는 유지 가능).
- **새로고침·언로드**: PeerConnection 없음 → ws 닫고 서버 세션 메모리 제거. 재진입은 새 통화.
- **팬이 luda 말 도중 끼어듦(barge-in)**: first-pass는 **턴제**(끼어들기 미지원, Out). 현재 응답 재생이 끝난 뒤 팬 턴을 받는다.

## S4. 비기능 제약

- **스택 고정**: Next.js App Router + TypeScript + Prisma + Postgres, Node 런타임. **pgvector 불필요**. 배포 = 로컬 PoC(+ 선택적 내부망 HTTPS).
- **전송 = 브라우저↔서버 WebSocket(오디오 릴레이) — W2 패턴.** 미디어서버·**WebRTC·P2P·시그널링·룸 전부 없음**(1인 사용). Next App Router는 ws를 못 여므로 **custom `server.ts` 필수**(W2). 발화 오디오 blob 업 / 문장 mp3 다운.
- **오디오 파이프라인 = W2 재사용 (STT→LLM→TTS Chained)**:
  - **STT**: `gpt-4o-mini-transcribe`, HTTP `/audio/transcriptions`, 발화단위 webm 파일 전사(25MB 상한). 입력 = 브라우저 MediaRecorder **WebM/Opus**(ffmpeg 변환 불필요, `.webm` 파일명+`multipart` `file` 필드).
  - **LLM**: OpenAI Responses API, `gpt-5-nano`(env), **`reasoning:{effort:"minimal"}` 필수**(안 주면 추론토큰이 max_output_tokens 다 먹어 무응답 — W2 실측), `stream:true`, `instructions`=`Artist.systemPrompt`+통화맥락+emotion 규약, `max_output_tokens:1000`, 히스토리는 세션 메모리 배열.
  - **TTS**: `gpt-4o-mini-tts`, HTTP `/audio/speech`, **mp3**(`response_format:"mp3"`), voice는 env 상수 하나(후보 `marin`/`cedar`, luda 톤은 실측 선택). 문장단위 생성→순차 재생.
  - **재생 = 문장단위 오디오 스트리밍**(W2): 응답을 문장 경계(`. ! ? 。 ~ …`/줄바꿈)로 분할, 문장마다 mp3 → 브라우저 큐 순차 재생. **단일 `<audio>` 재사용**(문장마다 `src` 교체, `new Audio()` 금지 = iOS gesture 유지). 각 `play()`는 `.catch()`로 "탭하여 계속" 폴백.
- **★ emotion 획득 = 구분자 프로토콜 (strict JSON 폐기 — 선행조사 §1)**:
  - `instructions`에 규약: **"응답 맨 앞에 감정 태그 하나를 `[[happy]]` 형식으로(happy|angry|sad|relaxed|surprised|neutral 중 하나) 붙이고, 그 뒤 자연스럽게 말해라. 태그는 맨 앞 한 번만."**
  - 서버: 스트리밍 토큰을 받되 **선두 `[[...]]`가 닫힐 때까지만 버퍼**(첫 몇 토큰) → emotion 파싱 → 클라에 `{type:"emotion",value}` 전송 → 태그 뗀 나머지를 **W2 문장분할→TTS에 그대로** 흘림(지연 트릭 보존). 무효/누락 → `neutral`, 전체 발화 처리.
  - **왜 JSON 아닌가**: Responses API는 stream+json_schema여도 **필드단위로 안 오고**(raw 토큰 조각) 통짜 대기라 W2 첫문장 지연트릭이 깨짐(선행조사). 구분자는 순수 instruction-following이라 스트리밍·reasoning.effort와 무관.
  - **first-pass = 1응답 1 emotion.** 문장별 emotion = 스트레치.
- **★ 립싱크 = Web Audio 진폭 (신규 — 선행조사 §2)**:
  - 그래프: `AudioContext` → `createMediaElementSource(audioEl)`(**최초 1회**) → `AnalyserNode` → **`audioContext.destination`**(연결 필수, 안 하면 무음).
  - rAF: `analyser.getByteTimeDomainData(buf)` → **RMS** → `aa = clamp(rms*GAIN,0,1)`(GAIN≈3~5 튜닝 노브) → **lerp 스무딩**(`aa += (target-aa)*0.3`). `paused||ended` → target 0.
  - **same-origin/blob mp3만**(cross-origin이면 analyser 0 — W3C 보안). TTS mp3는 서버가 ws로 보내 클라가 Blob→objectURL 재생 → same-origin/blob 충족.
  - `AudioContext.resume()`는 "통화 시작" 클릭 제스처에서(오디오 unlock과 한 묶음).
- **VRM 렌더 = W2.5 `characterRenderer.ts` 재사용, 구동 계층만 교체**:
  - three.js + `@pixiv/three-vrm`, `expressionManager.setValue`+head bone, **얼굴 클로즈업**(`CAM_DIST≈0.55` 머리 겨냥), **A포즈 팔 로드 시 1회 고정**(이후 안 건드림), VRoid VRM1이라 `VRMUtils.rotateVRM0` 불필요.
  - **구동 입력 변경**: (W2.5) 웹캠→MediaPipe→매핑 **제거**. (W3) `aa`=립싱크 진폭, 표정=emotion lerp, `blink`=idle 타이머, head=idle 미세 sway. 렌더러 인터페이스: `setMouthOpen(v)`(매 프레임 aa), `setEmotion(name)`(lerp 목표), 내부 idle(blink·breathe).
  - **head 트래킹 없음** — 좌우반전(거울)·MediaPipe·`HEAD_MIRROR` 트래킹 로직 제거. idle sway만.
- **대기(idle) 애니메이션**: 말 안 할 때 **주기적 blink**(2~5s 랜덤, 0.1s 감음) + **미세 호흡**(head/chest 저진폭 sine). 시간 기반, 트래킹 불필요. 화려한 idle = 스트레치.
- **오디오/립싱크/렌더 계층 분리 (RN 포팅 대비, 과분리 금지)**: 브라우저 종속 API(`getUserMedia`·`MediaRecorder`·`<audio>`·`AudioContext`·three canvas)를 통화 로직과 얇은 인터페이스로 분리(W2 `AudioCapture`/`AudioPlayer` + 신규 `LipSync{ attach(audioEl); read():number }` + W2.5 `CharacterRenderer`). 상위 통화 로직은 인터페이스만 의존 → RN(W2.9) 때 어댑터만 교체. **경계만 긋고 추상화는 최소**(격차가 구동 계층이라).
- **시크릿**: `OPENAI_API_KEY`는 서버에서만(STT/LLM/TTS 전부 서버 경유, 오디오도 ws로 중계). 클라 노출 금지.
- **개발 로그(휘발 보완)**: 통화 DB 미저장이라 왕복 성립 흔적이 없다 → 각 턴 **전사 텍스트·LLM응답·파싱된 emotion을 서버 stderr에** 남긴다(DB 아님=휘발 유지, 화면 자막 없음). STT 오작동·emotion 파싱을 로그로 잡는 용도.
- **Next.js/three-vrm 함정(W2.5 확정)**: 렌더 컴포넌트 = `next/dynamic {ssr:false}` + `'use client'` + `useEffect` 초기화(canvas ref 타이밍). three는 ESM → `useEffect` 안에서 `import`(`require` 금지, `ERR_REQUIRE_ESM`). 로더 = `three/addons/loaders/GLTFLoader.js`. `transpilePackages:['three']`는 필수 아님(resolve 실패 시에만).
- **custom server**: `server.ts`가 문지기 — 일반 요청→Next handler, `/ws` 업그레이드→오디오 릴레이 핸들러. `dev:"tsx watch server.ts"`/`start:"NODE_ENV=production tsx server.ts"`, `output:"standalone"` 금지(W2 제약). **localhost는 http로 충분**(secure context). 선택적 https(모바일): `https.createServer({cert,key})` + ws가 같은 서버 attach(자동 wss), cert 경로 env(`HTTPS_CERT_PATH`/`HTTPS_KEY_PATH`), 이때만 쿠키 `secure:true`·`allowedDevOrigins`에 내부망 IP(W2.5 자산).
- **의존성 핀**: `next@16.3.5`, `prisma@6`+`@prisma/client@6`, `ws`, `tsx`(W2). **`three@0.180.0`**+**`@pixiv/three-vrm@3.5.5`**+**`@types/three@0.180.0`**(W2.5 실측 조합, `^` 없이 정확 고정). **`@mediapipe/tasks-vision` 불필요**(트래킹 없음 — W2.5에서 제거). `latest`/RC/canary 금지.
- **실행 환경**: 자동검증·기본 실측 = 노트북 `localhost`(http OK). 선택 모바일 실측 = 내부망 https(W2.5 절차).

## S6. 원샷 실행 규칙 (2부 부트스트랩)

**폴더 구조 (2부 완성형)** — 단일 Next 앱을 custom Node server로 감싼다.

```
apps/w03-ai-avatar-call/
  server.ts              # custom 시동 = 문지기 (http localhost / 선택 https)
                         #   - 일반 요청 → Next handler
                         #   - 'upgrade'(/ws) → 오디오 릴레이(STT→LLM→TTS 파이프라인)
  app/
    (chat)/…             # 1부: W1 채팅 화면 그대로 (p1-spec.md S1)
    call/[artistId]/     # 2부: 통화 화면 (클라: mic 캡처·VAD·오디오 재생·립싱크·아바타 렌더)
  lib/
    voice/               # STT→LLM→TTS 파이프라인 + emotion 구분자 파서 (W2 재사용+태그파서 추가)
    audio/               # AudioCapture/AudioPlayer 인터페이스 + 웹 어댑터 (W2 재사용)
    ws/                  # ws 오디오 릴레이 연결 (W2 재사용)
    lipsync/             # [신규] AnalyserNode → aa (LipSync 인터페이스 + 웹 어댑터)
    render/              # CharacterRenderer (W2.5 재사용, 구동 계층 교체: setMouthOpen/setEmotion/idle)
    sentence.ts          # 문장 분할 (W2 재사용)
    …                    # W1 lib (prisma, openai, session) 재사용
  public/
    models/luda.vrm      # 사람 준비물(factory/luda.vrm)에서 복사
  prisma/                # 1부 스키마·seed(luda) 그대로 (새 테이블 없음)
  package.json           # dev/start가 반드시 server.ts를 타게
```
**※ `lib/rtc`·`lib/signaling`·`lib/tracking`·`public/mediapipe` 없음** (W2.5 P2P·트래킹 제외 — grilling G3).

**0. 프리체크**: `CREATE_DB_URL`로 Postgres+`factory` role **실제 명령으로** 확인(실패 시 멈추고 안내, 슈퍼유저 자가승격 금지). **추가**: `factory/luda.vrm` 존재 확인 — 없으면 멈추고 안내(팬텀 준비물 방지). cert는 선택(모바일 시).

**1. 폴더 리셋**: 대상 = `apps/w03-ai-avatar-call/`만(상위·타 앱 금지). 있으면 삭제 후 재생성. **이전 dev 서버 좀비 정리**(`lsof -ti :3000 | xargs -r kill -9`).

**2. 1부 — W1 재현(얇게)**: `docs/p1-spec.md` 개정본 S6·S2~S4를 이 폴더에서. 슬러그 `w03-ai-avatar-call`→DB `w03_ai_avatar_call`. seed 아티스트=**luda**. 채팅 스트리밍까지 재현 후 **p1-spec.md S5 먼저 통과**(1부 깨지면 2부 진입 금지). 상속 함정 5개(next 핀·`reasoning.effort:minimal`·`.env` 따옴표 제거·프리체크 실행·dev 포트 정리) 확인.

**3. 2부 — AI 아바타 음성통화 얹기**:
- **custom server**: `/ws` 오디오 릴레이 라우팅(W2). localhost http 기본, 모바일 시 https 전환(cert·secure 쿠키·allowedDevOrigins).
- **에셋**: `factory/luda.vrm`→`public/models/luda.vrm`.
- **통화 진입**: 채팅방 📞 버튼 → `/call/[artistId]`(방번호·역할 없음).
- **통화 시작(권한)**: "통화 시작" 오버레이 클릭 한 제스처에서 mic 권한+오디오 unlock+`audioContext.resume()`. video/canvas는 항상 마운트(오버레이, early-return 금지).
- **파이프라인**: mic→VAD 발화단위→ws→STT→LLM(스트리밍,emotion 태그 규약)→**선두 태그 파싱→클라 emotion**→문장분할→TTS mp3→ws→클라 큐 재생.
- **립싱크**: 재생 오디오 엘리먼트에 AnalyserNode(1회) 부착→rAF RMS→aa→`renderer.setMouthOpen`.
- **표정**: 수신 emotion→`renderer.setEmotion`(lerp).
- **렌더**: luda.vrm 로드→얼굴 클로즈업→idle(blink·breathe)→구동 입력 반영.
- **첫 턴**: 연결 직후 luda 선턴("여보세요") TTS+립싱크+선두 emotion.

**4. 검증**: S5 실행.

⚠️ **원샷 함정 (조사·grilling에서)**:
- **secure context**: mic은 https 또는 localhost에서만. localhost는 http OK, 내부망 IP는 https 필수.
- **emotion strict JSON 금지**: 구분자 `[[emotion]]` 선두 태그 + sanitize + neutral 폴백(선행조사·G1·G2).
- **립싱크 3함정**: `createMediaElementSource` 1회·destination connect 필수·same-origin/blob(선행조사 §2).
- **2제스처 unlock**: 오디오 unlock + `audioContext.resume()`를 시작 클릭에서 함께(G4).
- **P2P 끌고오기 금지**: WebRTC/시그널링/룸/역할/트래킹 없음. W2.5 rtc·signaling·tracking 재사용 금지(G3).
- **three SSR 크래시**: `dynamic({ssr:false})`+`'use client'`+`useEffect` 초기화.
- **reasoning.effort minimal**: 안 주면 무응답(W2 상속 함정).
- **단일 `<audio>` 재사용**: 문장마다 `new Audio()` 금지(iOS gesture·소스노드 1회).

## S5. 검증 명령

AI가 one-shot 안에서 스스로 실행해 통과를 확인한다.

- **(1부)** p1-spec.md S5 전부: `typecheck`/`lint`/`build`/`prisma validate`/`migrate dev`/`db seed`(luda) 통과.
- **(2부)** `npm run typecheck`/`npm run lint`/`npm run build` — 2부 코드 포함 통과.
- **custom server 기동**: `npm run dev`로 서버가 뜨고 `http://localhost:3000` 응답 + `/ws` 업그레이드(101) 응답.
- **[신규] 립싱크 매핑 단위테스트**(순수함수): 샘플 파형 버퍼 입력 → RMS→`aa` 출력이 기대 범위(무음→0, 큰 진폭→clamp 1)인지. lerp 스무딩·정지 시 0 복귀 검증.
- **[신규] emotion 파서 단위테스트**(순수함수): `"[[happy]] 안녕"`→`{emotion:"happy", text:"안녕"}`, `"[[excited]] hi"`→`neutral` 폴백, 태그 없음→neutral+전체 발화, 중간 `[[x]]` stray 제거 확인.
- **[신규] emotion→expression 매핑 단위테스트**: 6개 emotion → 기대 VRM 표정 키. 무효→neutral.
- **파이프라인 통합테스트(개입 0, W2식)**: 샘플 발화 오디오 파일 → STT 결과 **비어있지 않음** → LLM 응답 텍스트 존재 + **선두 태그 파싱 성공**(emotion∈enum) → 문장 분할(≥1) → 각 문장 TTS mp3 **바이트 반환**. (실제 입 움직임·표정 변화·음성 자연스러움 = 자동화 불가 → 사람 Acceptance. 렌더 rAF는 headless서 멈추므로 자동검증은 순수함수·파이프라인까지.)

## Acceptance Criteria (필수)

완료 선언 직후 사람이 체크한다. **1부(재현)·2부(격차) 분리 채점**(1부=회귀 게이트 이진, `metrics.csv` `w03` 행은 2부 기준).

**1부 — W1 재현(회귀):**
- [ ] `apps/w03-ai-avatar-call/`에서 W1 채팅 앱이 그대로 뜬다(가입·리스트·채팅 스트리밍, 아티스트 luda). p1-spec.md Acceptance 통과.

**2부 — AI 아바타 음성통화(이번 격차):**
- [ ] 채팅방 📞 버튼 → 통화 화면 진입(방번호·역할 선택 없음).
- [ ] "통화 시작" 클릭 후에야 마이크 권한을 요청하고, 허용하면 통화가 시작된다(선택 전 실패 없음).
- [ ] luda가 **얼굴 클로즈업 아바타로 먼저 "여보세요"라고 말한다**(선턴).
- [ ] (실측·격차 핵심 ①) luda가 말할 때 **목소리에 맞춰 입이 움직인다**(오물오물 립싱크). 말 멈추면 입이 닫힌다.
- [ ] (실측·격차 핵심 ②) 대화 감정에 따라 **표정이 눈에 띄게 바뀐다**(웃음·슬픔·놀람 등, ~0.3s 부드러운 전환). — 사람이 확인.
- [ ] 팬이 마이크로 말하면 luda가 알아듣고(STT) 자연스럽게 대답한다(소통 성립). 마이크 인디케이터가 반응한다.
- [ ] 대기 중 아바타가 **눈을 깜빡이고 미세하게 호흡**한다(정지 화면 아님).
- [ ] 팬 **자기 영상·PIP가 없고**, 화면을 luda 아바타가 채운다.
- [ ] **음소거·끊기**가 동작하고, 끊으면 채팅방으로 돌아온다. **통화·오디오·전사는 저장되지 않는다**(휘발).
- [ ] STT 빈 결과·API 실패·권한 거부에서 크래시 없이 안내/복귀한다. emotion 태그 누락 시 neutral로 정상 동작한다.
- [ ] 새로고침·이탈에서 500 없이 종료 처리된다.
- [ ] **(선택·모바일 UX)** mkcert https로 폰이 `https://<내부망IP>:3000` 접속 시 통화·립싱크·표정이 성립한다(모바일 렌더·오디오 확인). — 원할 때만.

## Out of Scope

- **strict JSON 구조화 출력** — 스트리밍 지연트릭과 충돌(선행조사). 구분자 프로토콜로 확정.
- **문장별 emotion 전환·감정 강도(intensity)·정밀 비짐(viseme) 타임스탬프 립싱크** — POC "오물오물"까지. (스트레치)
- **팬 웹캠 영상·자기 PIP·얼굴 트래킹(MediaPipe)** — W3는 AI 구동만. 팬은 mic만. (웹캠 트래킹=W2.5 격차)
- **WebRTC·P2P·미디어서버·시그널링·룸·역할·2번째 기기** — 1인 사용(팬↔서버 ws). W2.5 P2P 자산은 그쪽 독립.
- **팔·손·상반신 트래킹, 상반신/전신 프레이밍** — 얼굴 클로즈업·A포즈 고정. (신체 트래킹=별도)
- **barge-in(끼어들기)·연속 대화(턴 겹침)** — first-pass 턴제.
- **Realtime API(speech-to-speech 통짜)** — Chained 왕복이 배움(W2 근거 계승).
- **통화 녹화·VOD·자막 저장** — 휘발 확정.
- **auth 기술**(비밀번호·로그인) — W4 직전 슬롯.
- **인터넷 배포(공개 도메인·프로덕션 상주)** — 로컬 PoC + 선택 내부망 https.
- **RN 웹뷰 포팅** — W2.9(오디오/립싱크/렌더 계층은 인터페이스로 분리해 대비 — S4).
- **(스트레치)** 화려한 idle(표정 변주·시선 추적), 문장별 emotion, TTS voice 튜닝, 웹캠 PIP 복원 — first-pass 통과 후 여유 시.
