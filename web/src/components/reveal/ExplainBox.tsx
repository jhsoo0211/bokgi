/**
 * 해설 세 줄(해설자 두 묶음 + 개념 연결): 이번에 잘 읽은 것(📄) · 다음에 바꿀 것(🔍 + 바로 옆 면책) · 개념 연결(📄, 개념 이름에 형광펜).
 * 줄마다 작은 머리글과 문장 라벨. 개념 줄은 늘 마지막이고 가장 진하다. 공개 뒤 화면 전용.
 */
import { EXPLAIN_HEAD, LABEL_TEXT } from "@/lib/client/format";
import type { Explain, ExplainLine } from "@/lib/client/types";

const ORDER = ["good", "change", "concept"] as const;

function withHighlight(text: string, term: string) {
  const i = term ? text.indexOf(term) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<span className="ds-hl">{term}</span>{text.slice(i + term.length)}</>;
}

export function ExplainBox({ explain, conceptTitle }: { explain: Explain; conceptTitle: string }) {
  const lines = ORDER.map((k) => explain.lines.find((l) => l.kind === k)).filter((l): l is ExplainLine => !!l);
  return (
    <section id="explain" className="explain" aria-labelledby="explain-h">
      <h2 id="explain-h" className="sr-only">해설</h2>
      <div className="ds-bubble ds-bubble--ai">
        <span className="who">{explain.persona}</span>
        {lines.map((l) => (
          <section key={l.kind} className={`ex-line ex-line--${l.kind === "good" ? "read" : l.kind}`}>
            <h3 className="ex-h">{EXPLAIN_HEAD[l.kind]}</h3>
            <p className="ex-s">
              <span className={`ds-label ds-label--${l.label}`}>{LABEL_TEXT[l.label]}</span>{" "}
              {l.kind === "concept" ? withHighlight(l.text, conceptTitle) : l.text}
            </p>
            {l.label === "inference" && <p className="warn">AI 해석이에요. 공식 발표된 이유는 아니에요.</p>}
          </section>
        ))}
      </div>
    </section>
  );
}
