import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// 대화방 목록: 내 userId의 이미 생성된 방만 나열 (생성 로직 없음, p1-spec S1.2)
export default async function RoomsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signup");

  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id },
    include: {
      artist: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">내 대화방</h1>
        <Link
          href="/"
          className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          아티스트 목록
        </Link>
      </header>

      {conversations.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          아직 시작한 대화가 없어요. 아티스트 목록에서 먼저 말을 걸어보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {conversations.map((c) => {
            const preview = c.messages[0]?.content ?? "대화를 시작해보세요";
            return (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.artist.slug}`}
                  className="flex items-center gap-4 rounded-xl border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  <div
                    aria-hidden
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/10 font-semibold dark:bg-white/15"
                  >
                    {c.artist.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.artist.name}</p>
                    <p className="truncate text-sm text-black/55 dark:text-white/55">
                      {preview}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
