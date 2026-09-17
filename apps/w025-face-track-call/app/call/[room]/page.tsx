import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import CallScreenLoader from "@/components/CallScreenLoader";
import type { DesiredRole } from "@/lib/signaling/protocol";

export const dynamic = "force-dynamic";

// 통화 화면 (W2.5 S1). 로그인 없이 채팅방에서 바로 걸지만 회원 식별(쿠키)은 유지 — 없으면 가입으로.
// 역할(as)은 입장 시 선택 — ?as=fan(생얼) | character(캐릭터). 미지정이면 fan 기본.
export default async function CallPage({
  params,
  searchParams,
}: {
  params: Promise<{ room: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { room } = await params;
  const { as } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/signup");

  const role: DesiredRole = as === "character" ? "character" : "fan";
  return <CallScreenLoader room={decodeURIComponent(room)} as={role} />;
}
