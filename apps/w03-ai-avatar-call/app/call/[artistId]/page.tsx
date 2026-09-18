import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import CallScreenLoader from "@/components/CallScreenLoader";

export const dynamic = "force-dynamic";

// 통화 화면 (w3-spec S1). 채팅방 📞에서 진입. artistId로 아티스트 로드. 방번호·역할 없음(1인 사용).
export default async function CallPage({
  params,
}: {
  params: Promise<{ artistId: string }>;
}) {
  const { artistId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/signup");

  const artist = await prisma.artist.findUnique({ where: { id: artistId } });
  if (!artist) notFound();

  return (
    <CallScreenLoader
      artistId={artist.id}
      artistName={artist.name}
      artistSlug={artist.slug}
    />
  );
}
