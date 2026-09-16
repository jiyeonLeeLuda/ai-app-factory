# SPEC — AI 페르소나 채팅 (P1)

> 작성: 2026-09-16. 격차 A(LLM 토큰 스트리밍) 확정본 기준.
> 이 파일 하나만 **새 세션**에 투입해 one-shot 실행한다. 출발선 = **완전 빈 폴더**.
> spec_variant: S1+S2+S3+S4+S5
>
> **사람 준비물 (원샷 시작 전)** — 인프라 경계 옵션 **C**(계정·공유시크릿은 사람, DB 이름·생성부터는 원샷):
> ① Postgres 기동 (`pg_isready -h 127.0.0.1 -p 5432`로 확인),
> ② **`CREATEDB` 권한 role** (사람이 생성 — 예: role `factory`),
> ③ **`factory/.env.shared`** 에 `OPENAI_API_KEY` + `CREATE_DB_URL`(베이스 접속, `.../postgres`) 채우기,
> ④ Node 런타임.
> 이 넷이면 끝. 앱 폴더·앱 `.env`·DB 생성·마이그레이션·시드·구현은 **전부 원샷**이 한다. (`.env*`는 `.gitignore` 처리됨 — 비번·키 커밋 안 됨. 원샷 실행 규칙은 아래 S6, 경계는 README "원샷 경계" 참고)

## S0. 장면 (필수)

팬이 가상 아티스트에게 말을 걸면, 답이 실시간으로 "타이핑되듯" 한 글자씩 흘러나오는 채팅 화면.

## S0. 격차 (필수)

OpenAI API 스트리밍 → 서버(Route Handler) → 클라이언트 SSE 토큰 릴레이. 곁들여 페르소나(OpenAI `instructions`) 설계.

## S1. 사용자 경험 서술

0. **가입/재방문**: 쿠키에 `userId`가 없으면 **가입 페이지**(닉네임+이메일 입력)로 보낸다. 제출하면 User를 만들고 `userId`를 쿠키에 저장 → 리스트로. 쿠키가 있으면 가입을 건너뛰고 바로 리스트. (비밀번호·로그인 없음 — 쿠키가 세션)
1. **첫 화면**: 아티스트 리스트 페이지 -&gt; 리스트 아이템으로 프로필(이름·한 줄 소개·아바타 플레이스홀더)이 노출된다. 클릭하면  채팅방으로 이동. **[대화 시작하기]** 클릭 시 서버가 `(userId, artistId)` 방을 조회해 — 있으면 그 방으로(기존 메시지 로드), 없으면 빈 방에 `[대화를 시작해보세요]` 시스템 안내만 표시(DB 미저장, Conversation 미생성 — 첫 메시지 때 upsert 생성).
2. 채팅방: 메신저 앱 처럼 대화가 쌓인다. 이전 대화가 있으면 위로 드래그 해서 볼 수 있다.  없으면 빈 채팅방에서 시작한다. 첫 메시지는 사용자가 시작한다. (별도 **대화방 목록** 화면: 내 `userId`의 이미 생성된 방만 나열 → 방 id로 바로 이동, 생성 로직 없음. 아티스트명·마지막 메시지 미리보기 정도.)
3. **메시지 전송**: 하단 입력창에 쓰고 Enter(또는 전송 버튼). 내 말풍선이 즉시 오른쪽에 뜬다.
4. **응답 스트리밍**: 아티스트 말풍선이 왼쪽에 빈 채로 생기고, 답이 **한 토큰씩 실시간으로 채워진다**. 스트리밍 중에는 "생각 중" 커서/점멸 표시.
5. **중단**: 스트리밍 중 "중지" 버튼을 누르면 그 시점까지 받은 텍스트로 말풍선이 확정된다.
6. **영속**: 새로고침해도 대화가 그대로 남아 있다(쿠키의 `userId` + 아티스트로 방을 복원).

## S2. 데이터 모델

Prisma / Postgres. **회원 개념은 W1에 포함**(auth 기술은 W2). 아티스트·페르소나는 **DB로 관리**한다(코드 하드코딩 아님).

```prisma
model User {
  id            String         @id @default(cuid())
  email         String         @unique   // 미래 계정 승격 앵커. W1엔 미검증(저장만).
  nickName      String                   // 닉네임 (표시용)
  passwordHash  String?                  // W2에서 채움 (W1은 null)
  emailVerified DateTime?                // W2에서 채움 (W1은 null)
  createdAt     DateTime       @default(now())
  conversations Conversation[]
}

model Artist {
  id            String         @id @default(cuid())
  slug          String         @unique   // URL·조회용 안정 키 ("philip")
  name          String
  tagline       String                   // 한 줄 소개
  avatarUrl     String?                  // 없으면 플레이스홀더
  systemPrompt  String                   // 페르소나 프롬프트. OpenAI `instructions` 파라미터로 주입 (system role 없음)
  createdAt     DateTime       @default(now())
  conversations Conversation[]
}

model Conversation {
  id        String    @id @default(cuid())
  userId    String                       // FK → User (방의 주인)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  artistId  String                       // FK → Artist
  artist    Artist    @relation(fields: [artistId], references: [id], onDelete: Cascade)
  createdAt DateTime  @default(now())
  messages  Message[]

  @@unique([userId, artistId])           // 한 사용자 × 한 아티스트 = 방 하나
  @@index([userId, artistId])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           Role         // user | assistant
  content        String       // 스트리밍 완료 후 최종 텍스트만 저장
  createdAt      DateTime     @default(now())

  @@index([conversationId, createdAt])
}

enum Role {
  user
  assistant
}
```

- **User**: 이번 주 "회원"은 **비밀번호 없는 이름표**. 가입 때 `email`+`nickName`을 받아 생성하고 `id`를 쿠키에 보관. `email`은 **미래 계정 승격 앵커**로 저장만 하고 W1에선 로그인/본인확인에 쓰지 않는다(미검증). `passwordHash`·`emailVerified`는 W2에서 채운다.
- **Artist**: 페르소나가 여기 산다. `systemPrompt`를 읽어 API 호출의 `instructions` 파라미터에 넣는다(OpenAI엔 system role 없음). 아티스트 추가 = DB row 추가.
- **Conversation**: **(User, Artist) 쌍당 방 1개** (`@@unique([userId, artistId])`). 방 입장만으로는 생성하지 않는다 — 조회만. **첫 메시지 전송 시 `(userId, artistId)`로 upsert** 생성(S3). 이 관계 테이블이 개인화 메모리가 살 자리.
- **Message 주인**: `Message`에 사용자 정보를 복제하지 않는다. 말풍선 정체성은 관계에서 파생 — assistant는 `Conversation.artist`에서 이름·아바타, user는 `Conversation.user.nickName`에서. (복제하면 이름 변경 시 낡음(stale) 버그)
- **role**: user/assistant는 **LLM API가 강제하는 규격**(이름 못 바꿈). UI 좌우 정렬도 이 값으로 하되, 존재 이유는 히스토리 재전송 시 화자 구분이다.
- **시드**: 빈 폴더 출발이라 최초 아티스트가 0명. `prisma/seed.ts`로 페르소나(S2b)를 최소 1명 심는다. `package.json`의 `prisma.seed`에 등록해 `npx prisma db seed`로 실행.

### S2c. W2 auth 승격 시 유의점 (지금 지킬 것)

B(auth-ready 스키마 + 쿠키 세션)로 가되, 아래를 지켜야 W2에서 **마이그레이션 없이** 진짜 auth를 얹는다.

1. **이메일 앵커 필수**: `email @unique`를 W1에 넣는다. 이게 없으면 W2가 기존 유저를 계정으로 못 잇는다(고아 유저).
2. **W1에선 이메일로 로그인/인증 금지**: 이메일은 저장만. "누구냐"는 쿠키의 `userId`. (이메일 입력=계정 탈취 구멍 방지)
3. **nullable 미래 칸**: `passwordHash?`·`emailVerified?`를 미리 두되 W1 코드는 non-null 가정 금지.
4. **현재 사용자 판별을 한 모듈에 격리**: W2에서 쿠키→진짜 세션 교체를 한 곳만 고치게. **`userId` 재발급 절대 금지**(기존 대화가 주인을 잃음).
5. **이메일 형식 검증(zod)**: 더러운 앵커 데이터가 쌓이면 W2가 아프다.

## S2b. 페르소나

가상 솔로 아티스트. 실존 인물 아님.

- **이름**: 필립 (Philip)
- **한 줄 소개**: 인기 아이돌 그룹의 비주얼 센터. 호주 출신.
- **톤**: 다정하고 나른한 반말·존댓말 중간체. 팬을 편하게 대하되 과하게 들뜨지 않음. 이모지는 한 메시지에 최대 1개.
- **경계**: 실존 인물·정치·의료/법률 조언은 부드럽게 회피. 자신이 AI임을 굳이 부정하지 않되 캐릭터(필립)를 유지. 부적절한 요청은 캐릭터 톤으로 정중히 거절.
- **페르소나 프롬프트**는 위 4개를 문장으로 풀어 `Artist.systemPrompt`(DB)에 넣고, API 호출 시 `instructions` 파라미터로 준다. `prisma/seed.ts`에서 이 값으로 필립 1명을 심는다.

## S3. 엣지 케이스

- **빈 대화**:  사용자가 첫 말을 보내야 Conversation 생성 + 스트림 시작. 방 생성은 **upsert(멱등)** — `(userId, artistId)`로 있으면 찾고 없으면 생성. (동시요청·중복 전송에도 `@@unique` 위반으로 죽지 않게)
- **스트리밍 중 실패**: OpenAI API 에러/네트워크 끊김 시 말풍선에 에러 아이콘 + 재시도 버튼. 부분 텍스트는 저장하지 않음(실패한 assistant 메시지는 DB에 남기지 않음). 재시도는 **이미 저장된 user 메시지를 재사용**(새로 만들지 않음 — 중복 방지).
- **사용자 중단**: AbortController로 서버 스트림 취소. 그때까지 받은 텍스트를 assistant 메시지로 저장하되, `content` 끝에 `…(사용자가 중단함)`을 덧붙여 저장(별도 스키마 칸 없이). 이 꼬리표는 **말풍선에도 그대로 노출**(의도적 — 사용자가 끊었음을 화면에서 보이게). 다음 요청 히스토리에도 실려 모델이 중단 맥락을 안다.
- **쿠키 분실**: 쿠키의 `userId`를 잃으면 다음 방문 시 새 회원으로 가입돼 **이전 대화는 복구 불가**. W1의 의도된 한계 — W2에서 이메일로 계정 승격 시 해결(버그 아님).
- **빈/공백 입력**: 전송 막음.
- **긴 입력**: 사용자 메시지 2,000자 상한(초과 시 전송 막고 안내). 히스토리는 최근 N턴(기본 20)만 API에 실어 토큰 폭주 방지.
- **동시 전송**: 스트리밍 진행 중에는 입력창 비활성 — 한 번에 한 스트림만.

## S4. 비기능 제약

- 스택 고정: Next.js App Router + TypeScript + Prisma + Postgres, Vercel 배포. (pgvector 불필요 — 이번 주 RAG 없음)
- API: **OpenAI Responses API** (`client.responses.create`). 상세 근거는 `docs/api-선행조사-openai.md`.
- 모델: 기본 **`gpt-5-nano`**(최저비용 $0.05/$0.40 — 이번 주는 시연 아닌 학습/측정용이라 비용 최소화). 톤 품질이 필요하면 `gpt-5.6-luna`($0.20/$1.20)로 상향. 환경변수로 주입, 하드코딩 금지. 키는 `OPENAI_API_KEY`. (최종 목표는 자체 모델 — 이 값은 임시 백엔드일 뿐)
- 스트리밍: 서버 Route Handler에서 `responses.create({stream:true})`로 받아 **SSE(text/event-stream)** 로 클라 릴레이. 토큰은 `response.output_text.delta` 이벤트의 `delta`, 종료는 `response.completed`. Edge 아님, Node 런타임.
- 역할·페르소나: 대화 턴은 `user`/`assistant` (OpenAI엔 `system` 없음, 지시는 `developer`). 페르소나는 **`instructions` 파라미터**에 `Artist.systemPrompt` 주입.
- 히스토리 관리: **수동 재전송**. 우리 DB(`Message`)의 최근 20턴을 매 요청 `input` 배열에 실어보낸다. OpenAI 서버 상태(`previous_response_id`·`conversation.id`)는 **미사용** — 데이터 소유·벤더 독립.
- 출력 상한: 파라미터명 `max_output_tokens` (Responses API). 모델 스펙의 "max output tokens" 표기와 일치. 값은 위 예산 줄대로 1000.
- 예산: 히스토리 최근 20턴 상한 + `max_output_tokens: 1000`으로 호출당 비용·길이 방어(짧은 채팅 답변용. 모델 천장은 16,384지만 그대로 쓰지 않음).
- 응답 시간 기대: 첫 토큰 2초 내 도착이 목표(TTFT). 지연되면 로딩 표시가 커버.
- 시크릿·환경변수: 공유 원본 `factory/.env.shared`(사람: `OPENAI_API_KEY`+`CREATE_DB_URL`) → 원샷이 앱 `.env` 생성(`OPENAI_API_KEY`, 앱별 `DATABASE_URL`)(S6). `.env*`는 `.gitignore` 처리, 값 비운 `.env.example`을 커밋용으로 둔다. API 키를 클라이언트로 절대 노출 금지(스트림은 서버 경유). (배포 시 Vercel 환경변수에 별도 주입)

## S6. 원샷 실행 규칙 (부트스트랩)

원샷이 시작할 때 스스로 하는 것 (사람 준비물 위에서):

1. **폴더 리셋**: 대상은 `apps/w01-persona-chat/`. **이 폴더가 있으면 삭제 후 재생성** — 단 삭제는 **정확히 이 경로로만** 한정(상위 디렉터리·다른 앱 폴더 절대 금지). 매 실행이 깨끗한 빈 폴더에서 시작하도록.
2. **스캐폴드**: 이 폴더 안에 Next.js(App Router)+TS 프로젝트 생성.
3. **앱 `.env` 생성**: 저장소 루트의 `factory/.env.shared`를 읽어 —
   - `OPENAI_API_KEY`는 그대로 복사,
   - DB 이름을 앱 슬러그에서 생성(`w01-persona-chat` → `w01_persona_chat`, 하이픈→언더바),
   - `CREATE_DB_URL`의 끝 `/postgres`를 `/<앱DB>`로 치환한 값을 `DATABASE_URL`로 기록,
   - 값 비운 `.env.example`도 함께 생성.
4. **DB·스키마**: `prisma migrate dev`가 그 DB를 생성(factory의 `CREATEDB`)하고 테이블 생성 → `prisma db seed`로 필립 시드.
5. 이후 S2~S4 구현 → S5 검증.

## S5. 검증 명령

AI가 one-shot 안에서 스스로 실행해 통과를 확인한다.

- `npm run typecheck` (tsc --noEmit) — 타입 에러 0
- `npm run lint` — 린트 에러 0
- `npm run build` — 프로덕션 빌드 성공
- `npx prisma validate` — 스키마 유효
- `npx prisma migrate dev` — 마이그레이션 성공(테이블 생성). `DATABASE_URL` 필요(사람 준비물).
- `npx prisma db seed` — 아티스트(필립) 시드 성공 (아티스트 0명이면 리스트가 비어 스트리밍을 탈 수 없음)
- (수동 확인용) `npm run dev` 후 채팅 1왕복 스트리밍 육안 확인 — 이건 사람 몫으로 Acceptance에 둠

## Acceptance Criteria (필수)

완료 선언 직후 사람이 체크한다.

- [ ] (사람 준비물 충족 전제: Postgres 기동 + `DATABASE_URL`·`OPENAI_API_KEY`) 빈 폴더에서 `npm install` → `prisma migrate` → `prisma db seed` → `npm run dev`로 앱이 뜬다.
- [ ] 쿠키가 없으면 가입 페이지로 가고, 닉네임+이메일 제출 시 User가 생기고 리스트로 이동한다. 재방문 시 가입을 건너뛴다.
- [ ] 서로 다른 사용자(다른 쿠키)의 대화가 섞이지 않는다(각자 자기 방).
- [ ] 시드가 반영돼 아티스트(필립)가 리스트에 뜨고, 그 방에서 대화를 시작할 수 있다.
- [ ] 같은 아티스트로 빠르게 두 번(또는 두 탭 동시) 전송해도 500 없이 방이 하나만 생긴다(upsert 멱등).
- [ ] 메시지를 보내면 아티스트 답이 **한 토큰씩** 실시간으로 채워진다(한 번에 뭉텅이로 뜨지 않음).
- [ ] 스트리밍 중 "중지"를 누르면 그 시점 텍스트로 말풍선이 확정된다.
- [ ] 새로고침해도 이전 대화가 그대로 남아 있다.
- [ ] API 키를 비우거나 네트워크를 끊으면 인라인 에러 + 재시도가 뜨고, 실패한 답은 대화에 남지 않는다.
- [ ] 페르소나(필립) 톤이 답변에 일관되게 유지된다.
- [ ] `typecheck` / `lint` / `build` / `prisma validate` 모두 통과.

## Out of Scope

- **auth 기술** (비밀번호·로그인·세션 보안·이메일 본인확인) — W2 격차. 이번 주는 회원 *식별*만(쿠키 세션).
- 음성/오디오 (P2)
- WebSocket 양방향 (P2에서 진짜 필요할 때)
- 페르소나 관리 UI(어드민 CMS) — 추가는 seed/DB 직접, 화면은 W2 이후
- 아바타 이미지 생성 (플레이스홀더로 충분)
- RAG·기억(장기 메모리) — (스트레치) 최근 20턴 초과 요약은 다음 주 후보

## 다음 라운드 후보 (이번 주 아님 — 메모)

지금은 MVP. 아래는 후속 라운드에서 설계할 것으로 기록만 해둔다.

- **개인화 장기 메모리**: 팬↔아티스트 사이에 나눈 대화에서 사실·취향을 추출해 저장하고, 이후 대화에 다시 실어 "나를 기억하는" 경험을 만든다. → 사용자 식별(인증)이 선행 필요.
- **RAG**: 아티스트 세계관·프로필·과거 발화를 벡터로 검색해 답변 근거로 주입 (pgvector). 페르소나가 "설정을 아는" 수준으로 깊어짐.
- **개인화 이벤트**: 생일·기념일·최근 활동 등 컨텍스트성 트리거로 아티스트가 먼저 말을 걸거나 답을 맞춤화.
- 전제: 위 셋 모두 "누가 말하는지"를 아는 사용자 모델이 있어야 성립 → 인증(W2 격차)과 시간축이 맞물림.
- **자체 대화 상태 모델**: 지금은 수동 재전송이지만, 후속 라운드에서 우리만의 대화 스레드 모델을 구축할 때 OpenAI의 `conversation.id`/`previous_response_id`처럼 **스레드 id로 상태를 참조하는** 설계를 채택한다. (수동 조립 → 상태 참조로 진화)

