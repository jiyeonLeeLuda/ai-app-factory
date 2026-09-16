"use client";

import { useEffect, useRef, useState } from "react";

export type InitialMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Bubble = {
  key: string;
  role: "user" | "assistant";
  content: string;
  turnId: number; // 0 = 초기(DB) 메시지
};

const ABORT_TAG = "…(사용자가 중단함)";
const SENTENCE_DELAY_MS = 600; // 문장 말풍선 사이 시차 (S1b)
const MAX_CHARS = 2000;

export default function ChatRoom({
  artistId,
  artistName,
  initialMessages,
}: {
  artistId: string;
  artistName: string;
  initialMessages: InitialMessage[];
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>(() =>
    initialMessages.map((m) => ({
      key: m.id,
      role: m.role,
      content: m.content,
      turnId: 0,
    })),
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 턴별 상태 (매 전송마다 완전 초기화 — 2턴째 blank 버그 방지, S1b 다중턴 안전) ──
  const queueRef = useRef<string[]>([]);
  const pacerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const turnRef = useRef(0); // 현재 진행 중 턴 id
  const keySeqRef = useRef(0); // 안정적 key 생성용 카운터
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const nextKey = () => `b${(keySeqRef.current += 1)}`;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [bubbles, streaming]);

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (pacerRef.current) clearTimeout(pacerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  function clearPacer() {
    if (pacerRef.current) {
      clearTimeout(pacerRef.current);
      pacerRef.current = null;
    }
  }

  function finishTurn() {
    clearPacer();
    setStreaming(false);
  }

  // 큐에서 문장을 하나씩 시차를 두고 말풍선으로 노출
  function pump(turnId: number) {
    if (pacerRef.current) return; // 이미 도는 중
    const step = () => {
      if (turnRef.current !== turnId) {
        // 이전 턴의 잔여 타이머 — 무시 (다중턴 안전)
        pacerRef.current = null;
        return;
      }
      const text = queueRef.current.shift();
      if (text !== undefined) {
        setBubbles((prev) => [
          ...prev,
          { key: nextKey(), role: "assistant", content: text, turnId },
        ]);
        pacerRef.current = setTimeout(step, SENTENCE_DELAY_MS);
      } else {
        pacerRef.current = null;
        if (doneRef.current) finishTurn();
        // 아직 done이 아니면: 다음 sentence 도착 시 pump가 다시 불린다
      }
    };
    pacerRef.current = setTimeout(step, 0);
  }

  function resetTurnState() {
    clearPacer();
    queueRef.current = [];
    doneRef.current = false;
  }

  // 서버가 못 보낸(중단) 남은 문장을 즉시 확정하고 마지막에 꼬리표를 붙인다
  function flushAndTag(turnId: number) {
    const remaining = queueRef.current;
    queueRef.current = [];
    clearPacer();
    setBubbles((prev) => {
      const added: Bubble[] = remaining.map((t) => ({
        key: nextKey(),
        role: "assistant",
        content: t,
        turnId,
      }));
      const next = [...prev, ...added];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i].turnId === turnId && next[i].role === "assistant") {
          next[i] = { ...next[i], content: `${next[i].content} ${ABORT_TAG}` };
          break;
        }
      }
      return next;
    });
  }

  // 실패한 턴의 assistant 말풍선 제거 (실패 답은 DB에 안 남으므로 화면도 정리, S3)
  function dropAssistantBubbles(turnId: number) {
    queueRef.current = [];
    clearPacer();
    setBubbles((prev) =>
      prev.filter((b) => !(b.turnId === turnId && b.role === "assistant")),
    );
  }

  async function runStream(turnId: number, body: Record<string, unknown>) {
    setError(null);
    setStreaming(true);
    doneRef.current = false;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let message = "응답 생성에 실패했어요. 다시 시도해주세요.";
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {}
        setError(message);
        finishTurn();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 이벤트는 빈 줄(\n\n)로 구분
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          handleEvent(raw, turnId);
        }
      }
    } catch (err) {
      if (turnRef.current === turnId && !doneRef.current) {
        // AbortError(사용자 중단)는 onStop에서 처리하므로 여기서는 진짜 실패만
        if ((err as Error)?.name !== "AbortError") {
          dropAssistantBubbles(turnId);
          setError("응답 생성에 실패했어요. 다시 시도해주세요.");
          finishTurn();
        }
      }
    }
  }

  function handleEvent(raw: string, turnId: number) {
    if (turnRef.current !== turnId) return;
    let event = "message";
    let dataLine = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
    }
    if (!dataLine) return;

    let data: { text?: string; message?: string };
    try {
      data = JSON.parse(dataLine);
    } catch {
      return;
    }

    if (event === "sentence" && data.text) {
      queueRef.current.push(data.text);
      pump(turnId);
    } else if (event === "done") {
      doneRef.current = true;
      if (!pacerRef.current && queueRef.current.length === 0) finishTurn();
    } else if (event === "aborted") {
      doneRef.current = true;
      flushAndTag(turnId);
      finishTurn();
    } else if (event === "error") {
      doneRef.current = true;
      dropAssistantBubbles(turnId);
      setError(data.message ?? "응답 생성에 실패했어요. 다시 시도해주세요.");
      finishTurn();
    }
  }

  function handleSend() {
    const content = input.trim();
    if (!content || streaming) return;
    if (content.length > MAX_CHARS) {
      setError(`메시지는 ${MAX_CHARS}자를 넘을 수 없어요.`);
      return;
    }

    resetTurnState();
    const turnId = (turnRef.current += 1);

    setBubbles((prev) => [
      ...prev,
      { key: nextKey(), role: "user", content, turnId },
    ]);
    setInput("");
    void runStream(turnId, { artistId, content });
  }

  function handleRetry() {
    if (streaming) return;
    resetTurnState();
    const turnId = (turnRef.current += 1);
    void runStream(turnId, { artistId, retry: true });
  }

  function handleStop() {
    if (!streaming) return;
    const turnId = turnRef.current;
    doneRef.current = true;
    abortRef.current?.abort();
    flushAndTag(turnId);
    finishTurn();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  const isEmpty = bubbles.length === 0 && !streaming;

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <p className="rounded-full bg-black/5 px-4 py-2 text-sm text-black/50 dark:bg-white/10 dark:text-white/50">
              대화를 시작해보세요
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {bubbles.map((b) => (
              <div
                key={b.key}
                className={
                  b.role === "user" ? "flex justify-end" : "flex justify-start"
                }
              >
                <div
                  className={
                    "max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm " +
                    (b.role === "user"
                      ? "rounded-br-sm bg-foreground text-background"
                      : "rounded-bl-sm bg-black/8 dark:bg-white/12")
                  }
                >
                  {b.content}
                </div>
              </div>
            ))}

            {streaming && (
              <div className="flex justify-start" aria-live="polite">
                <div className="rounded-2xl rounded-bl-sm bg-black/8 px-3.5 py-2.5 dark:bg-white/12">
                  <TypingDots />
                  <span className="sr-only">{artistName}이(가) 입력 중</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 border-t border-red-500/20 bg-red-500/5 px-4 py-2 text-sm text-red-500">
          <span className="flex items-center gap-1.5">
            <span aria-hidden>⚠️</span>
            {error}
          </span>
          <button
            type="button"
            onClick={handleRetry}
            className="shrink-0 rounded-md border border-red-500/40 px-2.5 py-1 text-xs font-medium hover:bg-red-500/10"
          >
            재시도
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-black/10 px-3 py-3 dark:border-white/15">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming}
          rows={1}
          maxLength={MAX_CHARS}
          placeholder={streaming ? "응답을 기다리는 중..." : "메시지를 입력하세요"}
          className="max-h-32 flex-1 resize-none rounded-2xl border border-black/15 bg-transparent px-3.5 py-2 text-sm outline-none focus:border-black/40 disabled:opacity-50 dark:border-white/20 dark:focus:border-white/50"
        />
        {streaming ? (
          <button
            type="button"
            onClick={handleStop}
            className="shrink-0 rounded-2xl border border-black/20 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
          >
            중지
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim()}
            className="shrink-0 rounded-2xl bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
          >
            전송
          </button>
        )}
      </div>
    </>
  );
}

function TypingDots() {
  return (
    <span className="flex gap-1" aria-hidden>
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/40 [animation-delay:-0.3s] dark:bg-white/50" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/40 [animation-delay:-0.15s] dark:bg-white/50" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/40 dark:bg-white/50" />
    </span>
  );
}
