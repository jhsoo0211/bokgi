"use client";

/**
 * 공용 아래 시트(신고 시트에서 뽑았다 — 정보 수준 설정 시트도 같이 쓴다). 접근성(ecc 감사):
 * - role="dialog" + aria-modal은 시트 틀에(form이 아니라), 이름은 labelledBy(시트 제목 id).
 * - 열린 동안 뒤 화면(.phone, 아래 탭 포함)은 inert — 초점·클릭·화면 읽기에서 빠진다.
 * - Tab·Shift+Tab은 시트 안에서만 돈다. 라디오 묶음은 Tab 자리가 하나라(고른 칸, 없으면 첫 칸) 그 칸을 한 자리로 센다.
 *   시트 글자를 눌러 초점이 body로 갔으면 다음 Tab은 시트의 처음(Shift면 끝)으로.
 * - Esc·가림막 누르기로 닫는다. 닫히면 초점은 연 단추로 돌아간다(그 단추가 없어졌으면 부른 쪽이 정한다).
 *   연 단추는 시트 밖에 초점이 있을 때만 기억한다(개발 모드 StrictMode가 effect를 두 번 돌려도 시트 안 칸을 '연 단추'로 잡지 않게).
 * - initialFocus(선택자)가 있으면 열 때 그곳에, 없으면 첫 칸에 초점.
 */
import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Tab 자리 목록: 막힌 칸·숨은 칸은 빼고, 라디오는 묶음마다 하나(고른 칸, 없으면 첫 칸) */
function tabStops(root: HTMLElement): HTMLElement[] {
  const seen = new Set<string>();
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if ((el as HTMLButtonElement).disabled || el.getAttribute("tabindex") === "-1" || el.closest("[hidden], [inert]")) return false;
    if (el instanceof HTMLInputElement && el.type === "radio") {
      const group = [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter((r) => r.name === el.name);
      const pick = group.find((r) => r.checked) ?? group[0];
      if (seen.has(el.name) || pick !== el) return false;
      seen.add(el.name);
    }
    return true;
  });
}
/** 같은 Tab 자리인가(라디오는 같은 묶음이면 같은 자리) */
const sameStop = (a: Element | null, b: HTMLElement) =>
  a === b || (a instanceof HTMLInputElement && b instanceof HTMLInputElement && a.type === "radio" && b.type === "radio" && a.name === b.name);

type Props = { labelledBy: string; onClose: () => void; initialFocus?: string; className?: string; children: ReactNode };

export function Sheet({ labelledBy, onClose, initialFocus, className, children }: Props) {
  const backRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const requestClose = useEffectEvent(() => onClose());
  const firstFocus = useEffectEvent(() => initialFocus);

  useEffect(() => {
    const back = backRef.current;
    const was = document.activeElement;
    if (was instanceof HTMLElement && was !== document.body && !back?.contains(was)) openerRef.current = was;
    const phone = document.querySelector<HTMLElement>(".phone");
    if (phone) phone.inert = true;   // 뒤 화면은 초점·클릭·화면 읽기에서 빠진다
    const sel = firstFocus();
    const start = (sel ? back?.querySelector<HTMLElement>(sel) : null) ?? (back ? tabStops(back)[0] : null);
    start?.focus();
    const onKey = (e: KeyboardEvent) => {
      const root = backRef.current;
      if (!root) return;
      if (e.key === "Escape") { e.preventDefault(); requestClose(); return; }
      if (e.key !== "Tab") return;
      const f = tabStops(root);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      const cur = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!cur || !root.contains(cur)) { e.preventDefault(); (e.shiftKey ? z : a).focus(); }   // 시트 글자를 눌러 초점이 body로 간 경우
      else if (e.shiftKey && sameStop(cur, a)) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && sameStop(cur, z)) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (phone) phone.inert = false;
      // 연 단추로 초점을 돌려준다(시트가 사라져 초점이 body로 빠졌을 때만 — 부른 쪽이 이미 옮겼으면 그대로)
      const opener = openerRef.current, active = document.activeElement;
      if (opener?.isConnected && (!active || active === document.body)) opener.focus();
    };
  }, []);

  return createPortal(
    <div className="sheet-back" ref={backRef} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={className ? `sheet ${className}` : "sheet"} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
