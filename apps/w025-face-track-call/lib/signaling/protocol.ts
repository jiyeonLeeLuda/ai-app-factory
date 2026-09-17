// 시그널링 메시지 규격 (W2.5 S4). 서버/클라 공유 — 브라우저 의존 없음.
// 통화·시그널링은 휘발: 룸 상태는 서버 메모리 맵으로만, DB 미저장(S2).

export type Role = "caller" | "callee";
// 사용자가 입장 시 고르는 역할 (caller=팬/생얼, callee=luda/캐릭터)
export type DesiredRole = "fan" | "character";

// 서버 → 클라
export type ServerMessage =
  | { type: "role"; role: Role } // 입장 시 역할 배정
  | { type: "peer-ready" } // 상대 입장 완료 → caller가 offer 생성
  | { type: "peer-left" } // 상대 이탈
  | { type: "room-full" } // 3번째 입장 거부 (2인 고정, S3)
  | { type: "role-taken"; role: Role } // 고른 역할이 이미 참여 중 (입장 시 선택, v1.4)
  | { type: "signal"; payload: SignalPayload }; // SDP/ICE 릴레이

// 클라 → 서버
export type ClientMessage = { type: "signal"; payload: SignalPayload };

// WebRTC 시그널 페이로드 (SDP 또는 ICE candidate)
export type SignalPayload =
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit };
