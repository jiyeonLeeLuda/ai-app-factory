import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// 첫 화면: 아티스트 리스트 (p1-spec S1.1). 쿠키 없으면 가입으로.
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signup");

  const artists = await prisma.artist.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">아티스트</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {user.nickName}님, 누구와 이야기해볼까요?
          </p>
        </div>
        <Link
          href="/rooms"
          className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          내 대화방
        </Link>
      </header>

      {artists.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          아직 아티스트가 없어요. 시드를 실행해주세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {artists.map((artist) => (
            <li key={artist.id}>
              <div className="flex items-center gap-4 rounded-xl border border-black/10 p-4 dark:border-white/15">
                <div
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/10 text-lg font-semibold dark:bg-white/15"
                >
                  {artist.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{artist.name}</p>
                  <p className="truncate text-sm text-black/55 dark:text-white/55">
                    {artist.tagline}
                  </p>
                </div>
                <Link
                  href={`/chat/${artist.slug}`}
                  className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"
                >
                  대화 시작하기
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
