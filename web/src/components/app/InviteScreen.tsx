"use client";

/**
 * 초대 베타 입장(세션이 없을 때만, 실제 API): 초대 코드 + 닉네임 → POST /api/auth/invite. 실패 문구는 서버의 한 문장을 그대로.
 * 접근성(frontend-a11y): 필수 칸은 aria-required, 잘못된 칸은 aria-invalid + 오류 문장(aria-describedby, role=alert)에 연결,
 * 보내기 실패 뒤 초점은 처음 잘못된 칸으로. 보내는 동안은 단추 글자로 알린다(눌러도 두 번 보내지 않는다).
 * 틀은 div다 — 화면 틀(#view)이 같은 h1을 이름으로 쓰므로 section+aria-labelledby를 겹치지 않는다(axe landmark-unique).
 */
import { useRef, useState, type FormEvent } from "react";
import { useScreenFocus } from "@/hooks/useScreenFocus";
import { api, errorText, isApiError } from "@/lib/client/api";

type Bad = { code: boolean; nick: boolean };

export function InviteScreen({ onDone }: { onDone: () => void }) {
  useScreenFocus();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [bad, setBad] = useState<Bad>({ code: false, nick: false });
  const codeRef = useRef<HTMLInputElement>(null);
  const nickRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const b: Bad = { code: code.trim().length < 4, nick: !nickname.trim() };
    if (b.code || b.nick) {
      setBad(b);
      setErr(b.code && b.nick ? "초대 코드와 닉네임을 적어 주세요." : b.code ? "초대 코드를 확인해 주세요(4자 이상)." : "닉네임을 적어 주세요.");
      (b.code ? codeRef : nickRef).current?.focus();
      return;
    }
    setBusy(true);
    setErr("");
    setBad({ code: false, nick: false });
    try {
      await api.invite({ code: code.trim(), nickname: nickname.trim() });
      onDone();
    } catch (ex) {
      // 서버가 코드를 거절하면(400 invite_invalid) 코드 칸에 연결한다. 한도(429)·연결·서버 문제는 칸을 탓하지 않는다
      const rate = isApiError(ex, 429);
      setErr(rate ? "잠시 뒤에 다시 시도해 주세요." : errorText(ex));
      if (isApiError(ex, 400)) { setBad({ code: true, nick: false }); codeRef.current?.focus(); }
      setBusy(false);
    }
  };

  return (
    <div className="onb">
      <p className="onb-step">초대 베타</p>
      <h1 className="onb-title ds-head" id="screen-title">초대 코드로 시작해요</h1>
      <p className="onb-body">받은 초대 코드와 복기에서 쓸 닉네임을 적어 주세요.</p>
      <form className="invite-form" noValidate onSubmit={submit}>
        <label htmlFor="inv-code">초대 코드</label>
        <input
          id="inv-code" name="code" ref={codeRef} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={64}
          aria-required="true" aria-invalid={bad.code || undefined} aria-describedby={bad.code && err ? "inv-err" : undefined}
          value={code} onChange={(e) => setCode(e.target.value)}
        />
        <label htmlFor="inv-nick">닉네임 <small className="ds-muted">(20자까지)</small></label>
        <input
          id="inv-nick" name="nickname" ref={nickRef} autoComplete="nickname" maxLength={20}
          aria-required="true" aria-invalid={bad.nick || undefined} aria-describedby={bad.nick && err ? "inv-err" : undefined}
          value={nickname} onChange={(e) => setNickname(e.target.value)}
        />
        <p className="form-err" id="inv-err" role="alert">{err}</p>
        <button type="submit" className="ds-btn ds-btn--primary wide" aria-disabled={busy ? true : undefined}>{busy ? "확인하는 중…" : "시작"}</button>
      </form>
    </div>
  );
}
