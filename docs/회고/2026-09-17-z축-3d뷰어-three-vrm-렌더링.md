# W2.5 Z축 회고 — 3D 캐릭터 뷰어는 어떻게 그려지나 (three.js + three-vrm)

날짜: 2026-09-17. 성격: **Z축(빈 지식 채우기) 학습 회고** — W2.5 스펙 작성 중 "3D 뷰어 구현 로직"이 지연의 기술 공백이라 브리핑한 내용. [[three-axis-job-change-frame]] Z축.
깊이: **1차 브리핑(개념 지도)**. 세부(blendshape가 메쉬를 변형하는 원리·카메라 수학·성능)는 다음에 더 판다.

---

## 0. 한 줄 요약

3D 캐릭터 뷰어 = **가상 무대(scene)에 인형(VRM)·조명·카메라를 놓고, 매 프레임 표정 숫자를 꽂은 뒤 사진 한 장씩 찍어(render) canvas에 뿌리는 루프.**

## 1. 왜 3층인가 (배경 — 각 층이 생긴 이유)

브라우저 3D의 바닥은 **WebGL**인데, GPU에 "이 삼각형 그려" 수준의 저수준 API라 행렬·셰이더를 직접 짜야 해서 인간이 쓰기 힘들다. 그래서 층이 쌓였다.

| 층 | 무엇 | 왜 생겼나 |
|---|---|---|
| WebGL | GPU 삼각형 그리기(저수준) | 브라우저 3D의 바닥 |
| **three.js** | WebGL을 무대·인형·조명·카메라로 감쌈 | 저수준 → 인간이 다룰 추상 |
| **VRM(포맷)** | 3D 아바타 표준(glTF + 휴머노이드 본·표정 규격) | 아바타 **상호운용**(한 캐릭터를 여러 앱에서) |
| **@pixiv/three-vrm** | VRM을 three.js 무대에 세우는 플러그인 | three.js는 VRM 규격을 모름 → 통역 |

`luda.vrm` = VRoid Studio가 뽑은 표준 아바타. three-vrm이 three.js가 이해할 형태로 푼다.

## 2. 3D 뷰어의 4대 장치 + 렌더 루프

인형극 비유:
- **Scene** = 무대(3D 물체 담는 공간)
- **Camera** = 관객 시점(`PerspectiveCamera` = 원근)
- **Light** = 조명(없으면 깜깜 — 재질이 빛을 받아야 보임)
- **Renderer** = 사진사(`WebGLRenderer` → `<canvas>`에 픽셀 출력)
- **렌더 루프** = `requestAnimationFrame`으로 매 프레임 `renderer.render(scene, camera)` 반복 = 애니메이션

## 3. VRM 로드 (three-vrm 통역)

```js
const loader = new GLTFLoader();
loader.register(p => new VRMLoaderPlugin(p));   // 통역기 장착
loader.load('/models/luda.vrm', (gltf) => {
  const vrm = gltf.userData.vrm;   // 해석된 인형
  scene.add(vrm.scene);            // 무대에 세움
});
```

## 4. 표정 구동 = 트래킹이 꽂히는 지점 (핵심)

VRM 얼굴엔 **블렌드셰이프(모프 타겟)** — "입 벌린 얼굴/웃는 얼굴/눈 감은 얼굴" 같은 변형 목표들이 **0~1 슬라이더**로 심어져 있다(VRoid가 `aa/blink/happy` 등 16개 내장).

```js
vrm.expressionManager.setValue('aa', 0.7);   // 입 70%
vrm.expressionManager.setValue('blink', 1);  // 눈 감음
vrm.humanoid.getNormalizedBoneNode('head').rotation.set(pitch, yaw, roll);
vrm.update(delta);   // 값을 실제 메쉬에 반영
```

**MediaPipe가 준 숫자를 이 `setValue`에 꽂는 순간이 "트래킹 → 3D 구동"의 접합부.** (B안이면 이 숫자가 DataChannel로 와서 거는쪽이 꽂는다.)

## 5. 매 프레임 파이프라인

```
[한 번] renderer·scene·camera·light 셋업 + luda.vrm 로드해 scene에 추가
[매 프레임 60fps]
  ① 표정 숫자 확보 (받는쪽=내 트래킹 / 거는쪽=DataChannel 수신)
  ② expressionManager.setValue(...) + head bone 회전
  ③ vrm.update(delta)              ← 숫자를 얼굴 메쉬에 적용
  ④ renderer.render(scene, camera) ← canvas에 사진 한 장
```

"숫자 바꾸고 → 사진 찍고"를 60번/초 반복 = 표정을 따라 하는 캐릭터.

## 6. Next.js 함정

three.js는 `window`·`canvas` 필요 → **브라우저 전용**. 뷰어 컴포넌트는 `'use client'` + `next/dynamic({ssr:false})` + `useEffect` 초기화로 SSR 크래시를 막는다.

---

## 능동 학습 (지연 몫 — 나중에 더 팔 것)

- [ ] blendshape가 **메쉬 정점(vertex)을 실제로 어떻게 보간·변형**하는지 (모프 타겟 수학)
- [ ] 카메라 각도·화각(FOV)·룩앳(lookAt) 잡는 법 — 얼굴 클로즈업 프레이밍
- [ ] 성능: draw call·`devicePixelRatio`·모델 경량화(W3 씨앗의 텍스처 1K/10MB 제약과 연결)
- [ ] 조명 종류(Directional/Ambient/Environment)와 MToon(툰 셰이딩)이 애니풍 룩에 주는 영향

## 인터뷰 한 문장 씨앗

> "3D 아바타 렌더링은 three.js 씬에 VRM 모델을 로드하고, 매 프레임 트래킹에서 온 blendshape 계수를 `expressionManager`에 적용한 뒤 렌더 루프로 canvas에 그리는 구조입니다. 표정 데이터와 렌더를 분리해 뒀기 때문에, 구동 소스를 웹캠 트래킹에서 AI 음성으로 바꿔도 렌더 파이프라인은 그대로 재사용됩니다."

## 핵심 못

- 뷰어의 본질 = **"표정 숫자 꽂기 → 사진 찍기" 루프.** 트래킹은 숫자만 공급, 그림은 렌더 루프가 그린다.
- 이 **"숫자 → VRM 렌더" 접합부**가 W2.5(웹캠 구동)와 W3(AI 구동)의 공통 자산이다. [[w3-prespec-씨앗]]
