"use client";

import dynamic from "next/dynamic";
import type { DesiredRole } from "@/lib/signaling/protocol";

// three.js·MediaPipe·getUserMedia는 브라우저 전용 → SSR 비활성 (S4 함정: window 접근 크래시).
// dynamic({ssr:false})는 client component 안에서만 허용되므로 이 래퍼가 필요하다.
const CallScreen = dynamic(() => import("./CallScreen"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center text-sm text-black/50 dark:text-white/50">
      통화 화면을 불러오는 중…
    </div>
  ),
});

export default function CallScreenLoader({
  room,
  as,
}: {
  room: string;
  as: DesiredRole;
}) {
  return <CallScreen room={room} as={as} />;
}
