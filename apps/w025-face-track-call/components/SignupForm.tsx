"use client";

import { useState } from "react";

export default function SignupForm() {
  const [nickName, setNickName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickName, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "가입에 실패했어요.");
        setSubmitting(false);
        return;
      }
      // 풀 네비게이션 — fetch로 받은 세션 쿠키를 브라우저가 확실히 저장한 뒤 새 요청.
      window.location.href = "/";
    } catch {
      setError("네트워크 오류예요. 잠시 후 다시 시도해주세요.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">닉네임</span>
        <input
          type="text"
          value={nickName}
          onChange={(e) => setNickName(e.target.value)}
          required
          maxLength={40}
          placeholder="표시될 이름"
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">이메일</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
      </label>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-foreground px-4 py-2.5 font-medium text-background transition-opacity disabled:opacity-50"
      >
        {submitting ? "만드는 중..." : "시작하기"}
      </button>
    </form>
  );
}
