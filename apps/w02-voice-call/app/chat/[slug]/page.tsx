import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import ChatRoom, { type InitialMessage } from "@/components/ChatRoom";

export const dynamic = "force-dynamic";

// 채팅방 (p1-spec S1.1/S1.2): (userId, artistId) 방을 "조회만" 한다 — 입장으로 생성하지 않음.
// 있으면 기존 메시지 로드, 없으면 빈 방(첫 메시지 때 upsert 생성).
export default async function ChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/signup");

  const artist = await prisma.artist.findUnique({ where: { slug } });
  if (!artist) notFound();

  const conversation = await prisma.conversation.findUnique({
    where: { userId_artistId: { userId: user.id, artistId: artist.id } },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  const initialMessages: InitialMessage[] =
    conversation?.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    })) ?? [];

  return (
    <div className="mx-auto flex h-dvh w-full max-w-lg flex-col">
      <header className="flex items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/15">
        <Link
          href="/"
          aria-label="뒤로"
          className="rounded-md px-2 py-1 text-lg hover:bg-black/5 dark:hover:bg-white/10"
        >
          ‹
        </Link>
        <div
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-sm font-semibold dark:bg-white/15"
        >
          {artist.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-tight">{artist.name}</p>
          <p className="truncate text-xs text-black/50 dark:text-white/50">
            {artist.tagline}
          </p>
        </div>
        {/* W2 2부 진입점: 채팅방 → 통화 화면 (w2-spec S1.1) */}
        <Link
          href={`/call/${artist.id}`}
          aria-label="전화 걸기"
          title="전화 걸기"
          className="shrink-0 rounded-full border border-black/15 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          📞
        </Link>
      </header>

      <ChatRoom
        artistId={artist.id}
        artistName={artist.name}
        initialMessages={initialMessages}
      />
    </div>
  );
}
