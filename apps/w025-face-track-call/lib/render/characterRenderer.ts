// CharacterRenderer — three.js + @pixiv/three-vrm 어댑터 (W2.5 S4). 양쪽 클라 공유:
// 받는쪽은 자기 PIP에 로컬 렌더, 거는쪽은 큰 화면에 수신 숫자로 렌더.
// 브라우저 전용 — three는 ESM이라 useEffect 안에서 동적 import (require 금지, S4).

import type { CharacterRenderer, TrackingFrame } from "../tracking/types";
import { NEUTRAL_FRAME } from "../tracking/types";

// VRM expression 이름과 우리 Expr 키 매핑 (핵심 최소셋)
const EXPR_KEYS = ["aa", "blink", "happy", "surprised"] as const;

// ── 차렷(A포즈) 상수 — 팔은 트래킹하지 않고 로드 시 1회 고정 (v1.2) ──
const ARM_REST_DOWN = 1.2; // 위팔 내림 각도(z, 라디안). 1.3~1.4=완전 차렷, 1.0=A포즈
const ELBOW_REST = 0.2; // 팔꿈치 기본 굽힘(y)

// 머리 좌우반전(거울, v1.5): -1 = 미러(사용자가 볼 때 자연스러움), 1 = 실제 방향
const HEAD_MIRROR = -1;

export function createCharacterRenderer(): CharacterRenderer {
  let target: TrackingFrame = NEUTRAL_FRAME;
  let running = false;
  let raf = 0;
  let disposed = false;

  // three 리소스 (동적 import 후 채워짐)
  let THREE: typeof import("three") | null = null;
  let renderer: import("three").WebGLRenderer | null = null;
  let scene: import("three").Scene | null = null;
  let camera: import("three").PerspectiveCamera | null = null;
  let vrm: import("@pixiv/three-vrm").VRM | null = null;
  let clock: import("three").Clock | null = null;
  let resizeObs: ResizeObserver | null = null;
  let headRestX = 0;
  let headRestY = 0;
  let headRestZ = 0;

  async function load(canvas: HTMLCanvasElement, url: string): Promise<void> {
    THREE = await import("three");
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");

    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 320;

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
    camera.position.set(0, 1.35, 1.1); // 얼굴 클로즈업

    const light = new THREE.DirectionalLight(0xffffff, 2.0);
    light.position.set(1, 1, 1);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const gltf = await loader.loadAsync(url);
    if (disposed) return;
    const loaded = gltf.userData.vrm as import("@pixiv/three-vrm").VRM;
    vrm = loaded;
    // 렌더 최적화 + 안 보이는 조인트 정리
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    scene.add(vrm.scene);

    // VRoid VRM1 export = 이미 +Z(카메라 쪽) 정면 → 추가 회전 불필요.
    // 실측(2026-09-17): rotation.y=Math.PI를 넣었더니 등을 돌려 "뒤통수"가 보였음 → 제거.
    // (VRM0였다면 VRMUtils.rotateVRM0가 필요하지만 이 모델은 VRM1이라 불필요 — S4)

    // VRM 기본 포즈는 T자(팔을 양옆으로 쫙 폄) → 로드 직후 차렷(A포즈)로 1회 고정.
    // 팔은 트래킹하지 않으므로 이후 건드리지 않는다(v1.2 — 팔 트래킹 철회).
    const lUpper = vrm.humanoid?.getNormalizedBoneNode("leftUpperArm");
    const rUpper = vrm.humanoid?.getNormalizedBoneNode("rightUpperArm");
    const lLower = vrm.humanoid?.getNormalizedBoneNode("leftLowerArm");
    const rLower = vrm.humanoid?.getNormalizedBoneNode("rightLowerArm");
    if (lUpper) lUpper.rotation.z = -ARM_REST_DOWN;
    if (rUpper) rUpper.rotation.z = ARM_REST_DOWN;
    if (lLower) lLower.rotation.y = -ELBOW_REST;
    if (rLower) rLower.rotation.y = ELBOW_REST;

    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    if (head) {
      headRestX = head.rotation.x;
      headRestY = head.rotation.y;
      headRestZ = head.rotation.z;

      // 얼굴만 프레이밍(R1 정정): 머리를 겨냥해 카메라를 바짝 당겨 얼굴 위주로.
      // CAM_DIST ↓ = 더 클로즈업(얼굴 꽉), ↑ = 물러남(상반신). 실물 보며 조정.
      const CAM_DIST = 0.55;
      const headY = head.getWorldPosition(new THREE.Vector3()).y;
      const targetY = headY; // 얼굴(머리)을 화면 중심으로
      camera.position.set(0, targetY, CAM_DIST);
      camera.lookAt(0, targetY, 0);
    }

    // 캔버스 크기가 바뀌면(역할별 위치 전환·화면 회전) 렌더러·카메라 갱신
    const applyResize = () => {
      if (!renderer || !camera) return;
      const w = canvas.clientWidth || width;
      const h = canvas.clientHeight || height;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resizeObs = new ResizeObserver(applyResize);
    resizeObs.observe(canvas);

    clock = new THREE.Clock();
    running = true;
    const animate = () => {
      if (!running || !renderer || !scene || !camera || !vrm || !clock) return;
      raf = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      applyToVrm();
      vrm.update(delta);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);
  }

  function applyToVrm() {
    if (!vrm) return;
    const em = vrm.expressionManager;
    if (em) {
      for (const key of EXPR_KEYS) {
        em.setValue(key, target.expr[key] ?? 0);
      }
    }
    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    if (head) {
      // 좌우반전(거울): 수평 성분 yaw·roll만 부호 반전, pitch(상하)는 그대로.
      // 반대로 보이면 HEAD_MIRROR를 1로.
      head.rotation.set(
        headRestX + target.head.pitch,
        headRestY + HEAD_MIRROR * target.head.yaw,
        headRestZ + HEAD_MIRROR * target.head.roll,
        "YXZ",
      );
    }
  }

  function apply(frame: TrackingFrame): void {
    target = frame; // React state 거치지 않음 — 렌더 루프가 다음 프레임에 반영
  }

  function dispose(): void {
    disposed = true;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    resizeObs?.disconnect();
    resizeObs = null;
    if (vrm && scene) scene.remove(vrm.scene);
    renderer?.dispose();
    renderer = null;
    scene = null;
    vrm = null;
  }

  return { load, apply, dispose };
}
