"use client";

/**
 * "정보가 이상해요" 신고 시트(유형 8개 + 메모 → POST /api/reports, 카드 버전 첨부). 틀·초점 가두기·inert·Esc·초점 복귀는 공용 Sheet.
 * clientReportId: 시트를 열 때마다 새로 만들고, 보내기 실패 뒤 다시 보낼 때는 같은 값을 쓴다 — 시간 초과 뒤 재전송이 신고를 둘 만들지 않게
 * (서버: 같은 id 재전송은 같은 신고 200, 다른 카드에 같은 id는 409 report_conflict).
 */
import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/common/Sheet";
import { api, errorText } from "@/lib/client/api";
import { REPORT_CATS, uuid } from "@/lib/client/format";
import type { ReportCategory } from "@/lib/client/types";

type Props = { caseId: string; caseVersion: number; onClose: () => void; onSent: () => void };

export function ReportSheet({ caseId, caseVersion, onClose, onSent }: Props) {
  const [clientReportId] = useState(uuid);   // 시트 한 번 열 때 하나(다시 보내기에도 같은 값)
  const [cat, setCat] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cat || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.report({ clientReportId, caseId, caseVersion, category: cat, note: note.trim() || null });
      onSent();
    } catch (ex) {
      setErr(errorText(ex));
      setBusy(false);
    }
  };

  return (
    <Sheet labelledBy="rp-title" onClose={onClose} initialFocus='input[name="cat"]'>
      <form className="sheet-form" noValidate onSubmit={submit}>
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
    </Sheet>
  );
}
