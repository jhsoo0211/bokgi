"use client";

/**
 * "정보가 이상해요" 신고 시트(유형 8개 + 메모 → POST /api/reports, 카드 버전 첨부).
 * 접근성(ecc 감사): role="dialog"는 form이 아니라 시트 틀에, 열린 동안 뒤 화면(.phone, 아래 탭 포함)은 inert,
 * Tab·Shift+Tab은 시트 안에서만 돈다(라디오 묶음은 Tab 자리가 하나라 그 칸을 처음으로 친다), Esc로 닫고 초점은 연 버튼으로.
 */
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { api, errorText } from "@/lib/client/api";
import { REPORT_CATS } from "@/lib/client/format";
import type { ReportCategory } from "@/lib/client/types";

type Props = { caseId: string; caseVersion: number; onClose: () => void; onSent: () => void };

export function ReportSheet({ caseId, caseVersion, onClose, onSent }: Props) {
  const [cat, setCat] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const requestClose = useEffectEvent(() => onClose());

  useEffect(() => {
    const phone = document.querySelector<HTMLElement>(".phone");
    if (phone) phone.inert = true;   // 뒤 화면은 초점·클릭·화면 읽기에서 빠진다
    backRef.current?.querySelector<HTMLInputElement>('input[name="cat"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      const back = backRef.current, form = formRef.current;
      if (!back || !form) return;
      if (e.key === "Escape") { e.preventDefault(); requestClose(); return; }
      if (e.key !== "Tab") return;
      const radio = form.querySelector<HTMLInputElement>('input[name="cat"]:checked') ?? form.querySelector<HTMLInputElement>('input[name="cat"]');
      const f = [radio, ...back.querySelectorAll<HTMLElement>("textarea, button:not([disabled])")].filter((x): x is HTMLElement => !!x);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      const cur = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!cur || !back.contains(cur)) { e.preventDefault(); (e.shiftKey ? z : a).focus(); }   // 시트 글자를 눌러 초점이 body로 간 경우
      else if (e.shiftKey && (cur === a || (cur instanceof HTMLInputElement && cur.name === "cat"))) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && cur === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (phone) phone.inert = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cat || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.report({ caseId, caseVersion, category: cat, note: note.trim() || null });
      onSent();
    } catch (ex) {
      setErr(errorText(ex));
      setBusy(false);
    }
  };

  return createPortal(
    <div className="sheet-back" ref={backRef} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="rp-title">
        <form className="sheet-form" ref={formRef} noValidate onSubmit={submit}>
          <h2 className="ds-head" id="rp-title">정보가 이상해요</h2>
          <p className="ds-muted small">어떤 점이 이상했나요? 카드 버전과 함께 기록돼요.</p>
          <fieldset>
            <legend className="sr-only">신고 유형</legend>
            {REPORT_CATS.map(([v, t]) => (
              <label key={v} className="radio">
                <input type="radio" name="cat" value={v} checked={cat === v} onChange={() => setCat(v)} /> {t}
              </label>
            ))}
          </fieldset>
          <label className="note-label" htmlFor="rp-note">더 적을 내용 (선택)</label>
          <textarea id="rp-note" maxLength={500} placeholder="예: 숫자 판의 PER이 공시와 달라요" value={note} onChange={(e) => setNote(e.target.value)} />
          {err && <p className="sheet-err" role="alert">{err}</p>}
          <div className="row2">
            <button type="button" className="ds-btn" id="rp-cancel" onClick={onClose}>닫기</button>
            <button type="submit" className="ds-btn ds-btn--primary" id="rp-send" disabled={!cat || busy}>보내기</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
