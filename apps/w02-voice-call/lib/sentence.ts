// 스트리밍 텍스트를 문장 경계로 잘라 하나씩 emit (p1-spec S1 B안 / w2-spec S4).
// 분할 기준: 문장부호(. ! ? 。 ~ …) 또는 줄바꿈.
// 반말이라 마침표가 없을 수 있으니 줄바꿈도 마디 경계로 취급한다.

const TERMINATORS = ".!?。~…";
const isTerm = (ch: string) => TERMINATORS.includes(ch);

/**
 * 스트리밍 델타를 누적하며 완성된 문장만 흘려보내는 스테이트풀 분할기.
 * push()는 델타를 받아 "확정된 문장 배열"을 돌려주고, 미완성 꼬리는 버퍼에 남긴다.
 * flush()는 스트림 종료/중단 시 남은 버퍼를 마지막 한 문장으로 비운다.
 */
export class SentenceSplitter {
  private buf = "";

  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    let start = 0;
    let i = 0;

    while (i < this.buf.length) {
      const ch = this.buf[i];

      if (ch === "\n") {
        const seg = this.buf.slice(start, i).trim();
        if (seg) out.push(seg);
        i += 1;
        start = i;
        continue;
      }

      if (isTerm(ch)) {
        // 종결부호 연속(예: "!!!")은 한 덩어리로 묶는다.
        let j = i + 1;
        while (j < this.buf.length && isTerm(this.buf[j])) j += 1;
        // 뒤에 문자가 있어야 종결부호 run이 끝난 걸로 확정 — 아니면 다음 델타에서
        // run이 더 이어질 수 있으니 버퍼에 두고 기다린다.
        if (j < this.buf.length) {
          const seg = this.buf.slice(start, j).trim();
          if (seg) out.push(seg);
          i = j;
          start = j;
          continue;
        }
        break;
      }

      i += 1;
    }

    this.buf = this.buf.slice(start);
    return out;
  }

  /** 남은 버퍼를 마지막 문장으로 반환하고 비운다. 비었으면 null. */
  flush(): string | null {
    const seg = this.buf.trim();
    this.buf = "";
    return seg || null;
  }
}
