import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // [선택·모바일 실측] 내부망 실기기(폰)가 IP origin으로 접속할 때 dev 리소스(HMR·JS chunk)를
  // 그 origin에서 로드하도록 허용. 없으면 Next가 cross-origin으로 차단 → 폰에서 hydration이 안 붙는다
  // (W2.5 실측 자산). 노트북 localhost 기본 실측엔 무영향.
  allowedDevOrigins: ["172.10.102.176"],
  // three는 ESM. three/addons/ resolve는 Turbopack/webpack 기본 동작 → transpilePackages 기본 불필요(S4).
  // resolve 실패가 관측되면 그때 transpilePackages:["three"] 추가.
};

export default nextConfig;
