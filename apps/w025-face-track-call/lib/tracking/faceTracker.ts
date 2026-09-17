// MediaPipe FaceLandmarker 웹 어댑터 (W2.5 S4). 브라우저 전용 — 동적 import로만 로드.
// 모델·wasm은 /public/mediapipe 에 self-host (CDN 의존 제거 → 내부망/오프라인 안전, S4).
// (v1.2 — 팔 트래킹은 실측 후 철회: 팔이 어색하게 분리돼 얼굴 전용으로 되돌림. 상반신은 프레이밍만.)

import type { FaceTracker, TrackingFrame } from "./types";
import { NEUTRAL_FRAME } from "./types";
import {
  mapBlendshapesToExpr,
  mapMatrixToHead,
  categoriesToScores,
} from "./mapping";

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/face_landmarker.task";

export function createFaceTracker(): FaceTracker {
  let landmarker: import("@mediapipe/tasks-vision").FaceLandmarker | null = null;
  let raf = 0;
  let running = false;
  let lastVideoTs = -1;
  let lastFrame: TrackingFrame = NEUTRAL_FRAME;

  async function start(
    video: HTMLVideoElement,
    onFrame: (frame: TrackingFrame) => void,
  ): Promise<void> {
    const { FilesetResolver, FaceLandmarker } = await import(
      "@mediapipe/tasks-vision"
    );
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });

    running = true;
    const loop = () => {
      if (!running || !landmarker) return;
      raf = requestAnimationFrame(loop);

      if (video.readyState < 2 || video.videoWidth === 0) return;
      const ts = performance.now();
      // 같은 프레임 중복 detect 방지
      if (video.currentTime === lastVideoTs) {
        onFrame(lastFrame);
        return;
      }
      lastVideoTs = video.currentTime;

      let result;
      try {
        result = landmarker.detectForVideo(video, ts);
      } catch {
        // 일시적 detect 실패 — 마지막 프레임 유지 (S3 크래시 없이 지속)
        onFrame(lastFrame);
        return;
      }

      const bs = result.faceBlendshapes?.[0]?.categories;
      const mtx = result.facialTransformationMatrixes?.[0]?.data;

      if (!bs || bs.length === 0) {
        // 얼굴 유실 → neutral 복귀 (S3)
        lastFrame = NEUTRAL_FRAME;
        onFrame(lastFrame);
        return;
      }

      const frame: TrackingFrame = {
        expr: mapBlendshapesToExpr(categoriesToScores(bs)),
        head: mapMatrixToHead(mtx),
      };
      lastFrame = frame;
      onFrame(frame);
    };
    raf = requestAnimationFrame(loop);
  }

  function stop(): void {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    landmarker?.close();
    landmarker = null;
  }

  return { start, stop };
}
