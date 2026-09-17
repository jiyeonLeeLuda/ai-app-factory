import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";
import {
  openai,
  OPENAI_MODEL,
  MAX_OUTPUT_TOKENS,
  REASONING_EFFORT,
  HISTORY_TURNS,
  USER_MESSAGE_MAX_CHARS,
} from "@/lib/openai";
import { SentenceSplitter } from "@/lib/sentence";
import { Prisma, type Role } from "@prisma/client";

export const runtime = "nodejs"; // Edge 아님 (p1-spec S4)
export const dynamic = "force-dynamic";

const ABORT_TAG = "…(사용자가 중단함)";

type ChatBody = {
  artistId?: string;
  content?: string;
  retry?: boolean;
};

// (userId, artistId) 방을 멱등하게 확보 — 동시요청에도 @@unique 위반으로 죽지 않게 (p1-spec S3)
async function getOrCreateConversation(userId: string, artistId: string) {
  try {
    return await prisma.conversation.upsert({
      where: { userId_artistId: { userId, artistId } },
      update: {},
      create: { userId, artistId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const found = await prisma.conversation.findUnique({
        where: { userId_artistId: { userId, artistId } },
      });
      if (found) return found;
    }
    throw e;
  }
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  };
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return jsonError("로그인이 필요해요.", 401);

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return jsonError("잘못된 요청입니다.", 400);
  }

  const artistId = body.artistId?.trim();
  if (!artistId) return jsonError("아티스트가 지정되지 않았어요.", 400);

  // 사용자·아티스트 유효성
  const [user, artist] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.artist.findUnique({ where: { id: artistId } }),
  ]);
  if (!user) return jsonError("세션이 만료됐어요. 다시 가입해주세요.", 401);
  if (!artist) return jsonError("아티스트를 찾을 수 없어요.", 404);

  const conversation = await getOrCreateConversation(userId, artistId);

  // 새 전송이면 user 메시지 생성, 재시도면 이미 저장된 마지막 user 메시지를 재사용 (p1-spec S3)
  if (body.retry) {
    const last = await prisma.message.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
    });
    if (!last || last.role !== "user") {
      return jsonError("재시도할 메시지가 없어요.", 400);
    }
  } else {
    const content = body.content?.trim();
    if (!content) return jsonError("메시지를 입력해주세요.", 400);
    if (content.length > USER_MESSAGE_MAX_CHARS) {
      return jsonError(`메시지는 ${USER_MESSAGE_MAX_CHARS}자를 넘을 수 없어요.`, 400);
    }
    await prisma.message.create({
      data: { conversationId: conversation.id, role: "user", content },
    });
  }

  // 최근 20턴만 API에 실어 토큰 폭주 방지 (p1-spec S4). DB가 진실의 원천 — 수동 재전송.
  const recent = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TURNS,
  });
  const history = recent.reverse().map((m) => ({
    role: m.role as Role,
    content: m.content,
  }));

  const encoder = new TextEncoder();
  const splitter = new SentenceSplitter();
  const sentences: string[] = [];
  let aborted = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // 클라이언트가 이미 끊긴 경우 — 무시
        }
      };

      // assistant 문장들을 한 행씩 저장 (완료/중단 시에만 — 실패 시 저장 안 함, p1-spec S3)
      const persist = async (finalSentences: string[]) => {
        if (finalSentences.length === 0) return;
        await prisma.$transaction(
          finalSentences.map((text) =>
            prisma.message.create({
              data: {
                conversationId: conversation.id,
                role: "assistant",
                content: text,
              },
            }),
          ),
        );
      };

      const upstreamAbort = new AbortController();
      const onClientAbort = () => {
        aborted = true;
        upstreamAbort.abort();
      };
      request.signal.addEventListener("abort", onClientAbort);

      try {
        const oaStream = await openai.responses.create(
          {
            model: OPENAI_MODEL,
            instructions: artist.systemPrompt, // 페르소나는 instructions로 (system role 없음)
            input: history,
            max_output_tokens: MAX_OUTPUT_TOKENS,
            reasoning: { effort: REASONING_EFFORT },
            stream: true,
          },
          { signal: upstreamAbort.signal },
        );

        for await (const event of oaStream) {
          if (event.type === "response.output_text.delta") {
            for (const s of splitter.push(event.delta)) {
              sentences.push(s);
              send("sentence", { text: s });
            }
          } else if (event.type === "response.completed") {
            break;
          }
        }

        // 정상 완료: 남은 버퍼 flush 후 전부 저장
        const tail = splitter.flush();
        if (tail) {
          sentences.push(tail);
          send("sentence", { text: tail });
        }
        if (sentences.length === 0) {
          // 완료됐지만 출력이 비었음(예: 토큰 예산 소진). 빈 말풍선 대신 재시도 유도.
          send("error", { message: "응답이 비어서 도착했어요. 다시 시도해주세요." });
          controller.close();
          return;
        }
        await persist(sentences);
        send("done", { ok: true });
        controller.close();
      } catch (err) {
        if (aborted) {
          // 사용자 중단: 남은 버퍼 flush + 마지막 문장에 꼬리표 붙여 저장 (p1-spec S1b/S3)
          const tail = splitter.flush();
          if (tail) sentences.push(tail);
          if (sentences.length > 0) {
            sentences[sentences.length - 1] = `${sentences[sentences.length - 1]} ${ABORT_TAG}`;
          }
          try {
            await persist(sentences);
          } catch (persistErr) {
            console.error("중단 저장 실패:", persistErr);
          }
          send("aborted", { tag: ABORT_TAG });
          controller.close();
        } else {
          // API/네트워크 실패: 부분 텍스트 저장하지 않음 (p1-spec S3)
          console.error("스트리밍 실패:", err);
          send("error", { message: "응답 생성에 실패했어요. 다시 시도해주세요." });
          controller.close();
        }
      } finally {
        request.signal.removeEventListener("abort", onClientAbort);
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
