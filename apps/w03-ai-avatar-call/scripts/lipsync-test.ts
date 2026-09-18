// 립싱크 매핑 단위테스트 (w3-spec S5 [신규]). 순수함수 — 브라우저 없이 검증.
// 샘플 파형 버퍼 → RMS → aa 출력이 기대 범위인지(무음→0, 큰 진폭→clamp 1), lerp·정지 시 0 복귀.

import {
  rmsFromTimeDomain,
  rmsToAa,
  lerpAa,
  clamp01,
  AA_GAIN,
} from "../lib/lipsync/aa";

let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log("=== 립싱크 aa 단위테스트 ===");

// 1) 무음(모두 128) → rms 0 → aa 0
const silent = new Uint8Array(1024).fill(128);
ok(near(rmsFromTimeDomain(silent), 0), "무음 버퍼 → rms 0");
ok(rmsToAa(rmsFromTimeDomain(silent)) === 0, "무음 → aa 0");

// 2) 큰 진폭(0↔255 교대) → rms≈1 → aa clamp 1
const loud = new Uint8Array(1024);
for (let i = 0; i < loud.length; i += 1) loud[i] = i % 2 === 0 ? 0 : 255;
const loudRms = rmsFromTimeDomain(loud);
ok(loudRms > 0.9, `큰 진폭 → rms≈1 (got ${loudRms.toFixed(3)})`);
ok(rmsToAa(loudRms) === 1, "큰 진폭 → aa clamp 1");

// 3) 중간 진폭(128±16) → aa 중간값(포화 안 함)
const mid = new Uint8Array(1024);
for (let i = 0; i < mid.length; i += 1) mid[i] = i % 2 === 0 ? 112 : 144; // ±16
const midRms = rmsFromTimeDomain(mid);
ok(near(midRms, 16 / 128, 1e-3), `중간 진폭 rms ≈ 0.125 (got ${midRms.toFixed(3)})`);
ok(near(rmsToAa(midRms), 0.125 * AA_GAIN, 1e-3), "중간 진폭 → aa 중간값(포화 X)");

// 4) lerp: 0→목표 1로 한 스텝 = factor만큼 접근, 반복하면 1로 수렴
let cur = 0;
cur = lerpAa(cur, 1, 0.3);
ok(near(cur, 0.3), "lerp 한 스텝(0→1, f=0.3) = 0.3");
for (let i = 0; i < 60; i += 1) cur = lerpAa(cur, 1, 0.3);
ok(cur > 0.99, "lerp 반복 → 1로 수렴");

// 5) 정지: 목표 0을 주면 입이 서서히 닫혀 0으로 복귀
let closing = 0.8;
for (let i = 0; i < 60; i += 1) closing = lerpAa(closing, 0, 0.3);
ok(closing < 0.01, "정지(target 0) → aa 0 복귀");

// 6) clamp 경계
ok(clamp01(-1) === 0 && clamp01(2) === 1 && clamp01(0.5) === 0.5, "clamp01 경계");

if (failed) {
  console.error(`\n❌ FAIL: ${failed}개`);
  process.exit(1);
}
console.log("\n✅ PASS (립싱크)");
