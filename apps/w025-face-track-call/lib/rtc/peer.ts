// RTCPeerConnection 셋업 (W2.5 S4). 순수 P2P — 미디어서버·SFU 없음.
// STUN은 안전망(같은 LAN이면 host candidate로 붙지만 무해, S4). TURN 없음.

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}
