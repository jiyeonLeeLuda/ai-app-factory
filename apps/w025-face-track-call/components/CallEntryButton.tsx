"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 채팅방 우상단 영상통화 진입 (W2.5 S1.1): 방번호 입력 → /call/[room] 이동.
// 별도 방생성 UI 없음 — 입장=생성 통합(시그널링 서버가 룸을 메모리로 만든다).
type Role = "fan" | "character";

export default function CallEntryButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState("");
  const [role, setRole] = useState<Role>("fan"); // 입장 시 역할 선택 (v1.4)

  function enter() {
    const r = room.trim();
    if (!r) return;
    // 방번호는 URL 세그먼트로만 쓰이므로 안전 문자만 허용
    const safe = encodeURIComponent(r);
    router.push(`/call/${safe}?as=${role}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="영상통화 걸기"
        className="shrink-0 rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        📹 영상통화
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-base font-semibold">영상통화</h2>
            <p className="mb-4 text-xs text-black/55 dark:text-white/55">
              같은 방번호로 상대와 만나요. 먼저 들어가면 상대를 기다립니다.
            </p>
            <input
              type="text"
              value={room}
              autoFocus
              onChange={(e) => setRoom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") enter();
              }}
              placeholder="방번호 (예: 1234)"
              className="mb-3 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />

            {/* 역할 선택 (v1.4): 순서가 아니라 여기서 정한다 */}
            <p className="mb-1.5 text-xs font-medium text-black/60 dark:text-white/60">
              어떻게 참여할까요?
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("fan")}
                className={
                  "rounded-lg border px-3 py-2 text-sm " +
                  (role === "fan"
                    ? "border-foreground bg-foreground text-background"
                    : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10")
                }
              >
                🙂 나 (생얼)
              </button>
              <button
                type="button"
                onClick={() => setRole("character")}
                className={
                  "rounded-lg border px-3 py-2 text-sm " +
                  (role === "character"
                    ? "border-foreground bg-foreground text-background"
                    : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10")
                }
              >
                🧑‍🎤 luda (캐릭터)
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                취소
              </button>
              <button
                type="button"
                onClick={enter}
                disabled={!room.trim()}
                className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-40"
              >
                입장
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
