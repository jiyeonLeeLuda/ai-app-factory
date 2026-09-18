// CharacterRenderer — three.js + @pixiv/three-vrm (w3-spec S4). W2.5 렌더러 재사용, 구동 계층 교체.
// 구동 입력: 립싱크 aa + emotion lerp + 시간기반 idle(blink·breathe) + 인사 제스처는 VRMA 애니메이션 클립.
// ⚠️ 인사 손짓은 수동 팔 각도 대신 @pixiv/three-vrm-animation으로 기성 .vrma(waving) 재생 (자연스러움·표준).
// 브라우저 전용 — three는 ESM이라 useEffect 안에서 동적 import (require 금지, S4 three SSR 함정).

import {
  EMOTION_EXPRESSION_KEYS,
  emotionToExpression,
  type ExpressionKey,
} from "./expression";
import { lerpAa } from "../lipsync/aa";

// ── 차렷(A포즈) — 로드 시 팔 고정, 인사 끝나면 여기로 부드럽게 복귀 ──
const ARM_REST_DOWN = 1.2; // 위팔 내림(z, rad)
const ELBOW_REST = 0.2; // 팔꿈치 굽힘(y)
const ARM_RETURN_LERP = 0.15; // 인사 후 팔이 A포즈로 돌아오는 부드러움

const VRMA_WAVE_URL = "/models/waving.vrma"; // 인사 손짓 애니메이션 (기성 VRMA)

const CAM_DIST = 1.15; // 상체 위주 프레이밍 거리 (실측 튜닝)
const CAM_AIM_DROP = 0.15; // 겨냥점을 머리에서 살짝 내림 — 머리+가슴(상체)을 담되 머리 안 잘리게
const EMO_LERP_TIME = 0.3; // 표정 짓기(rise) ~0.3s (S1.7)
const EMO_DECAY_TIME = 0.6; // 표정 → neutral 복귀(release)는 조금 느긋하게
const EMO_MAX = 0.7; // 표정 최대 세기 (1.0은 웃음이 눈을 심하게 찡그려 기괴 → 완화)
const MOUTH_ACTIVE = 0.04; // 이 이상 입이 벌어지면 "말하는 중"
const MOUTH_MAX = 0.5; // 입 최대 벌림 뚜껑 (오물오물)
const EMO_HOLD_QUIET = 1.2; // 입이 이만큼 조용하면 표정 풀어 neutral로
const BLINK_DUR = 0.15;
const BLINK_MIN = 3;
const BLINK_RAND = 3;

// 미세 몸짓(idle body sway) — 어깨·상체 저진폭 sine
const BODY_SWAY_X = 0.015;
const BODY_SWAY_Y = 0.02;
const BODY_SWAY_Z = 0.01;

export interface AvatarRenderer {
  /** VRM 로드 + 렌더 루프 시작. */
  load(canvas: HTMLCanvasElement, url: string): Promise<void>;
  /** 입 벌림 목표값(0..1) — 매 프레임 립싱크 aa. */
  setMouthOpen(v: number): void;
  /** 표정 전환 목표 — emotion 이름(무효는 neutral). */
  setEmotion(name: string): void;
  /** 제스처 재생 — "wave"(인사 손짓 VRMA 클립 1회). */
  playGesture(name: string): void;
  /** [진단, 추후 제거] 인사 중 손·머리 월드 좌표 문자열 (화면 오버레이용). */
  getDebugInfo(): string;
  dispose(): void;
}

type BoneRest = {
  node: import("three").Object3D;
  rest: { x: number; y: number; z: number };
};

export function createCharacterRenderer(): AvatarRenderer {
  let running = false;
  let raf = 0;
  let disposed = false;

  // 구동 입력
  let mouthTarget = 0;
  let aaCur = 0;
  let activeEmotion: ExpressionKey = "neutral";
  let quietTime = 0;
  const emoWeights: Record<string, number> = {};
  for (const k of EMOTION_EXPRESSION_KEYS) emoWeights[k] = 0;

  // idle blink
  let blinkCountdown = BLINK_MIN + Math.random() * BLINK_RAND;
  let blinking = false;
  let blinkT = 0;
  let blinkValue = 0;
  let elapsed = 0;

  // three 리소스
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
  let camHeadY = 0;

  // 인사 VRMA
  let mixer: import("three").AnimationMixer | null = null;
  let waveAction: import("three").AnimationAction | null = null;
  let waveDuration = 0;
  let waving = false;
  let waveT = 0;

  // A포즈 복귀용 팔 본 + rest, sway 본, 손 위치(진단)
  const armBones: BoneRest[] = [];
  let bodyBone: import("three").Object3D | null = null;
  let bodyRest = { x: 0, y: 0, z: 0 };
  let rightHand: import("three").Object3D | null = null;
  let lastDebug = "";

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
    camera.position.set(0, 1.35, 1.1);

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
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    scene.add(vrm.scene);

    // VRoid VRM1 = 이미 +Z 정면 → rotateVRM0 불필요 (W2.5 실측).

    // T포즈 → 차렷(A포즈) 1회 고정
    const lUpper = vrm.humanoid?.getNormalizedBoneNode("leftUpperArm");
    const rUpper = vrm.humanoid?.getNormalizedBoneNode("rightUpperArm");
    const lLower = vrm.humanoid?.getNormalizedBoneNode("leftLowerArm");
    const rLower = vrm.humanoid?.getNormalizedBoneNode("rightLowerArm");
    if (lUpper) lUpper.rotation.z = -ARM_REST_DOWN;
    if (rUpper) rUpper.rotation.z = ARM_REST_DOWN;
    if (lLower) lLower.rotation.y = -ELBOW_REST;
    if (rLower) rLower.rotation.y = ELBOW_REST;

    // A포즈 rest 저장 — 인사(VRMA) 끝나면 이 값으로 lerp 복귀 (클립이 남긴 포즈 정리).
    // ⚠️ 어깨(shoulder)·손(hand)까지 포함 — 인사 클립이 어깨를 들어올려 "만세"로 남는 것 방지(실측).
    const lShoulder = vrm.humanoid?.getNormalizedBoneNode("leftShoulder");
    const rShoulder = vrm.humanoid?.getNormalizedBoneNode("rightShoulder");
    const lHand = vrm.humanoid?.getNormalizedBoneNode("leftHand");
    const rHand = vrm.humanoid?.getNormalizedBoneNode("rightHand");
    for (const b of [lShoulder, rShoulder, lUpper, rUpper, lLower, rLower, lHand, rHand]) {
      if (b) armBones.push({ node: b, rest: { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z } });
    }
    rightHand = rHand ?? null;

    bodyBone =
      vrm.humanoid?.getNormalizedBoneNode("chest") ??
      vrm.humanoid?.getNormalizedBoneNode("spine") ??
      null;
    if (bodyBone) {
      bodyRest = { x: bodyBone.rotation.x, y: bodyBone.rotation.y, z: bodyBone.rotation.z };
    }

    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    if (head) {
      headRestX = head.rotation.x;
      headRestY = head.rotation.y;
      headRestZ = head.rotation.z;
      camHeadY = head.getWorldPosition(new THREE.Vector3()).y;
      const aimY = camHeadY - CAM_AIM_DROP; // 상체 위주로 겨냥
      camera.position.set(0, aimY, CAM_DIST);
      camera.lookAt(0, aimY, 0);
    }

    // 인사 손짓 VRMA 로드 (실패해도 통화는 유지 — 손짓만 비활성)
    try {
      const { VRMAnimationLoaderPlugin, createVRMAnimationClip, VRMLookAtQuaternionProxy } =
        await import("@pixiv/three-vrm-animation");
      // lookAt 트랙이 있는 클립을 위해 프록시를 씬에 추가 (공식 예제)
      const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt!);
      proxy.name = "lookAtQuaternionProxy";
      vrm.scene.add(proxy);

      const aLoader = new GLTFLoader();
      aLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
      const vrmaGltf = await aLoader.loadAsync(VRMA_WAVE_URL);
      if (disposed) return;
      const vrmAnim = vrmaGltf.userData.vrmAnimations?.[0];
      if (vrmAnim) {
        const clip = createVRMAnimationClip(vrmAnim, vrm);
        mixer = new THREE.AnimationMixer(vrm.scene);
        waveAction = mixer.clipAction(clip);
        waveAction.setLoop(THREE.LoopOnce, 1);
        waveAction.clampWhenFinished = true;
        waveDuration = clip.duration;
      }
    } catch (e) {
      console.error("[render] 인사 VRMA 로드 실패(손짓만 비활성):", e);
    }

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
      // 인사 중엔 mixer가 팔(및 클립이 건드리는 본)을 구동
      if (mixer && waving) {
        mixer.update(delta);
        waveT += delta;
        if (waveT >= waveDuration) waving = false; // 클립 끝 → idle 복귀
      }
      drive(delta);
      vrm.update(delta);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);
  }

  // 매 프레임: 입(aa) + 표정(emotion) + idle(blink·sway) + 팔 복귀. 인사 중엔 팔·sway는 클립에 양보.
  function drive(delta: number): void {
    if (!vrm) return;
    elapsed += delta;
    const em = vrm.expressionManager;

    // 입 — 립싱크 aa
    aaCur = lerpAa(aaCur, mouthTarget);

    // 표정 — 말하는 동안 유지, 조용해지면 neutral 복귀
    if (aaCur > MOUTH_ACTIVE) quietTime = 0;
    else quietTime += delta;
    const releasing = quietTime > EMO_HOLD_QUIET;
    const shown = releasing ? "neutral" : activeEmotion;
    const f = Math.min(1, delta / (releasing ? EMO_DECAY_TIME : EMO_LERP_TIME));
    for (const key of EMOTION_EXPRESSION_KEYS) {
      const target = key === shown ? 1 : 0;
      emoWeights[key] += (target - emoWeights[key]) * f;
    }

    // idle blink
    blinkCountdown -= delta;
    if (!blinking && blinkCountdown <= 0) {
      blinking = true;
      blinkT = 0;
    }
    if (blinking) {
      blinkT += delta;
      if (blinkT >= BLINK_DUR) {
        blinking = false;
        blinkValue = 0;
        blinkCountdown = BLINK_MIN + Math.random() * BLINK_RAND;
      } else {
        blinkValue = Math.sin((blinkT / BLINK_DUR) * Math.PI); // 0→1→0
      }
    }

    if (em) {
      em.setValue("aa", aaCur * MOUTH_MAX);
      em.setValue("blink", blinkValue);
      for (const key of EMOTION_EXPRESSION_KEYS) {
        em.setValue(key, emoWeights[key] * EMO_MAX);
      }
    }

    if (waving) {
      // 인사 중: 팔·상체는 VRMA가 구동 → 여기선 안 건드림. 손 위치만 진단으로 기록.
      if (THREE && rightHand) {
        const hp = rightHand.getWorldPosition(new THREE.Vector3());
        const head = vrm.humanoid?.getNormalizedBoneNode("head");
        const hd = head ? head.getWorldPosition(new THREE.Vector3()) : null;
        const f2 = (n: number) => n.toFixed(2);
        lastDebug =
          `hand(${f2(hp.x)},${f2(hp.y)},${f2(hp.z)})` +
          (hd ? ` head(${f2(hd.x)},${f2(hd.y)},${f2(hd.z)})` : "");
      }
      return;
    }

    // idle: 팔을 A포즈로 부드럽게 복귀 (인사 클립이 남긴 포즈 정리)
    for (const { node, rest } of armBones) {
      node.rotation.x += (rest.x - node.rotation.x) * ARM_RETURN_LERP;
      node.rotation.y += (rest.y - node.rotation.y) * ARM_RETURN_LERP;
      node.rotation.z += (rest.z - node.rotation.z) * ARM_RETURN_LERP;
    }

    // 상체 미세 sway
    if (bodyBone) {
      bodyBone.rotation.set(
        bodyRest.x + Math.sin(elapsed * 0.7) * BODY_SWAY_X,
        bodyRest.y + Math.sin(elapsed * 0.5) * BODY_SWAY_Y,
        bodyRest.z + Math.sin(elapsed * 0.45) * BODY_SWAY_Z,
      );
    }

    // 머리 미세 호흡·sway
    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    if (head) {
      head.rotation.set(
        headRestX + Math.sin(elapsed * 0.9) * 0.02,
        headRestY + Math.sin(elapsed * 0.6) * 0.03,
        headRestZ,
        "YXZ",
      );
    }
  }

  function setMouthOpen(v: number): void {
    mouthTarget = v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function setEmotion(name: string): void {
    activeEmotion = emotionToExpression(name);
    quietTime = 0;
  }

  function playGesture(name: string): void {
    if (name === "wave" && waveAction) {
      waveT = 0;
      waving = true;
      waveAction.reset();
      waveAction.play();
    }
  }

  function getDebugInfo(): string {
    return lastDebug;
  }

  function dispose(): void {
    disposed = true;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    mixer?.stopAllAction();
    mixer = null;
    resizeObs?.disconnect();
    resizeObs = null;
    if (vrm && scene) scene.remove(vrm.scene);
    renderer?.dispose();
    renderer = null;
    scene = null;
    vrm = null;
  }

  return { load, setMouthOpen, setEmotion, playGesture, getDebugInfo, dispose };
}
