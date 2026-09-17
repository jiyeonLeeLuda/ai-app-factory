// 매핑 룰 단위 테스트 (W2.5 S5). 순수 함수라 자동화 가능.
// 실행: npx tsx scripts/mapping-test.ts  (실패 시 exit 1)

import {
  mapBlendshapesToExpr,
  mapMatrixToHead,
  categoriesToScores,
} from "../lib/tracking/mapping";
import { NEUTRAL_EXPR } from "../lib/tracking/types";

let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    console.error(`  FAIL ${name}`);
    failed += 1;
  }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

console.log("[mapping-test]");

// 1. jawOpen:0.8 → aa≈0.8
const e1 = mapBlendshapesToExpr({ jawOpen: 0.8 });
check("jawOpen 0.8 → aa≈0.8", near(e1.aa, 0.8));
check("jawOpen만 → blink 0", near(e1.blink, 0));

// 2. eyeBlink 좌우 평균 → blink
const e2 = mapBlendshapesToExpr({ eyeBlinkLeft: 1.0, eyeBlinkRight: 0.6 });
check("eyeBlink (1.0+0.6)/2 → blink≈0.8", near(e2.blink, 0.8));

// 3. mouthSmile 좌우 평균 → happy
const e3 = mapBlendshapesToExpr({ mouthSmileLeft: 0.4, mouthSmileRight: 0.4 });
check("mouthSmile → happy≈0.4", near(e3.happy, 0.4));

// 4. browInnerUp → surprised
const e4 = mapBlendshapesToExpr({ browInnerUp: 0.5 });
check("browInnerUp → surprised≈0.5", near(e4.surprised, 0.5));

// 5. 범위 클램프 (0..1)
const e5 = mapBlendshapesToExpr({ jawOpen: 1.7 });
check("clamp: jawOpen 1.7 → aa=1", near(e5.aa, 1));

// 6. 빈 입력(얼굴 유실) → neutral (S3)
const e6 = mapBlendshapesToExpr({});
check(
  "empty → neutral",
  near(e6.aa, NEUTRAL_EXPR.aa) &&
    near(e6.blink, NEUTRAL_EXPR.blink) &&
    near(e6.happy, NEUTRAL_EXPR.happy) &&
    near(e6.surprised, NEUTRAL_EXPR.surprised),
);
const e6b = mapBlendshapesToExpr(null);
check("null → neutral", near(e6b.aa, 0) && near(e6b.blink, 0));

// 7. categories 배열 정규화
const scores = categoriesToScores([
  { categoryName: "jawOpen", score: 0.3 },
  { categoryName: "mouthSmileLeft", score: 0.2 },
]);
check("categoriesToScores 맵핑", scores.jawOpen === 0.3 && scores.mouthSmileLeft === 0.2);

// 8. head: identity matrix → neutral head
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const h1 = mapMatrixToHead(identity);
check(
  "identity matrix → head 0,0,0",
  near(h1.yaw, 0) && near(h1.pitch, 0) && near(h1.roll, 0),
);

// 9. head: 잘못된 입력 → neutral
const h2 = mapMatrixToHead(null);
check("null matrix → neutral head", near(h2.yaw, 0) && near(h2.pitch, 0));

// 10. head: Y축 90도 회전 (column-major) → yaw≈±π/2
// Ry(90°): m13(=data[8]) = sin, m33(=data[10]) = cos
const ry90 = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
const h3 = mapMatrixToHead(ry90);
check("Y 90° 회전 → |yaw|≈π/2", near(Math.abs(h3.yaw), Math.PI / 2, 1e-4));

if (failed > 0) {
  console.error(`\n[mapping-test] ${failed} 개 실패`);
  process.exit(1);
}
console.log("\n[mapping-test] 전부 통과");
