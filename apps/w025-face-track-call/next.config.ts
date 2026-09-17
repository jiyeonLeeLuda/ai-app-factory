import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 내부망 실기기(폰) 접속 시 dev 리소스(/_next/hmr·JS chunk)를 IP origin에서 로드 허용.
  // 없으면 Next가 cross-origin으로 차단 → 폰에서 JS(hydration)가 안 붙어 폼이 네이티브 제출됨(2026-09-17 실측).
  allowedDevOrigins: ["172.10.102.176"],
  // three는 ESM. three/addons/ 경로 resolve는 Turbopack/webpack 모두 기본 동작이라
  // transpilePackages는 기본 불필요(스펙 S4). resolve 실패가 관측되면 그때 추가.
};

export default nextConfig;
