"use client";

import dynamic from "next/dynamic";

// three.js·getUserMedia·AudioContext는 브라우저 전용 → SSR 비활성 (w3-spec S4 three SSR 크래시 함정).
// dynamic({ssr:false})는 client component 안에서만 허용되므로 이 래퍼가 필요하다.
const CallScreen = dynamic(() => import("./CallScreen"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-black text-sm text-white/50">
      통화 화면을 불러오는 중…
    </div>
  ),
});

export default function CallScreenLoader(props: {
  artistId: string;
  artistName: string;
  artistSlug: string;
}) {
  return <CallScreen {...props} />;
}
