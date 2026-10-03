"use client";

/** 초대 베타 입장(세션이 없을 때만, 실제 API): 초대 코드 + 닉네임 → POST /api/auth/invite. 실패 문구는 서버의 한 문장을 그대로 */
import { useState, type FormEvent } from "react";
import { useScreenFocus } from "@/hooks/useScreenFocus";
import { api, errorText, isApiError } from "@/lib/client/api";

export function InviteScreen({ onDone }: { onDone: () => void }) {
  useScreenFocus();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (code.trim().length < 4 || !nickname.trim()) { setErr("초대 코드와 닉네임을 적어 주세요."); return; }
    setBusy(true);
    setErr("");
    try {
      await api.invite({ code: code.trim(), nickname: nickname.trim() });
      onDone();
    } catch (ex) {
      setErr(isApiError(ex, 429) ? "잠시 뒤에 다시 시도해 주세요." : errorText(ex));
      setBusy(false);
    }
  };

  return (
    <section className="onb" aria-labelledby="screen-title">
      <p className="onb-step">초대 베타</p>
      <h1 className="onb-title ds-head" id="screen-title">초대 코드로 시작해요</h1>
      <p className="onb-body">받은 초대 코드와 복기에서 쓸 닉네임을 적어 주세요.</p>
      <form className="invite-form" noValidate onSubmit={submit}>
        <label htmlFor="inv-code">초대 코드</label>
        <input id="inv-code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={64} value={code} onChange={(e) => setCode(e.target.value)} />
        <label htmlFor="inv-nick">닉네임</label>
        <input id="inv-nick" name="nickname" autoComplete="nickname" maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <p className="form-err" role="alert">{err}</p>
        <button type="submit" className="ds-btn ds-btn--primary wide" aria-disabled={busy ? true : undefined}>시작</button>
      </form>
    </section>
  );
}
