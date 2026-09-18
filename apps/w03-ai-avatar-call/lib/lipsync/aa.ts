// 립싱크 진폭 계산 — 순수함수 (w3-spec S4 ★ / S5 단위테스트 대상).
// 재생 오디오의 시간영역 파형 → RMS → 입 벌림값 aa(0..1). 렌더러가 이 값을 lerp로 스무딩해 입에 반영.

export const AA_GAIN = 2.5; // rms→aa 증폭 노브 (실측: 4는 입이 너무 크게 벌어짐 → 2.5로 낮춤).
export const AA_LERP = 0.3; // 프레임 간 스무딩 계수 (0=정지, 1=즉시). 오물오물 자연스럽게.

export function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// Uint8Array(0..255, 128=무음) 시간영역 버퍼 → RMS(0..~1).
export function rmsFromTimeDomain(buf: Uint8Array): number {
  if (buf.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

// RMS → aa 목표값 (증폭 후 clamp). 무음(rms 0) → 0, 큰 진폭 → 1로 포화.
export function rmsToAa(rms: number, gain: number = AA_GAIN): number {
  return clamp01(rms * gain);
}

// 현재 aa를 목표값으로 한 스텝 스무딩. 정지 시 target 0을 주면 입이 서서히 닫힌다.
export function lerpAa(current: number, target: number, factor: number = AA_LERP): number {
  return current + (target - current) * factor;
}
