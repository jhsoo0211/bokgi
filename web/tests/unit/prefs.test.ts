import { describe, expect, it } from "vitest";
import { INFO_GROUPS, INFO_PRESETS, PanelPrefs, hiddenGroupsOf, levelForPrefs, presetPrefs, type InfoLevel } from "@/shared/contract";
import { canonicalGroups, effectivePrefs, normalizePrefs, storedPrefs, undoSecondsOf } from "@/server/rules";

const PRESETS = ["basic", "standard", "advanced"] as const;

describe("정보 수준 프리셋 (계약 presetPrefs·levelForPrefs·hiddenGroupsOf)", () => {
  it("초급 = 전부 끔, 고급 = 전부 켬, 중급 = 세부·환율 끔", () => {
    expect(INFO_GROUPS.every((g) => presetPrefs("basic")[g] === false)).toBe(true);
    expect(INFO_GROUPS.every((g) => presetPrefs("advanced")[g] === true)).toBe(true);
    expect(hiddenGroupsOf(presetPrefs("standard"))).toEqual(["valuationDetail", "healthDetail", "fxCommodity"]);
    for (const l of PRESETS) expect(PanelPrefs.safeParse(presetPrefs(l)).success).toBe(true);
  });

  it("presetPrefs는 복사본(고쳐도 프리셋이 바뀌지 않는다), custom은 기본값(중급) 프리셋", () => {
    const p = presetPrefs("basic");
    p.marketLine = true;
    expect(INFO_PRESETS.basic.marketLine).toBe(false);
    expect(presetPrefs("custom")).toEqual(INFO_PRESETS.standard);
  });

  it("왕복: 프리셋 → levelForPrefs → 같은 수준", () => {
    for (const l of PRESETS) expect(levelForPrefs(presetPrefs(l))).toBe(l);
  });

  it("토글을 하나라도 바꾸면 custom, 다른 프리셋과 같아지면 그 수준", () => {
    for (const l of PRESETS) {
      for (const g of INFO_GROUPS) {
        const p = { ...presetPrefs(l), [g]: !presetPrefs(l)[g] };
        expect(levelForPrefs(p), `${l}에서 ${g} 바꿈`).toBe("custom");
      }
    }
    const allOn = Object.fromEntries(INFO_GROUPS.map((g) => [g, true])) as PanelPrefs;
    expect(levelForPrefs(allOn)).toBe("advanced");
    const almostStandard = { ...presetPrefs("advanced"), valuationDetail: false, healthDetail: false, fxCommodity: false };
    expect(levelForPrefs(almostStandard)).toBe("standard");
  });

  it("hiddenGroupsOf: 숨긴 묶음을 계약 순서로, 토글로 되살리면 원래 값", () => {
    expect(hiddenGroupsOf(presetPrefs("basic"))).toEqual([...INFO_GROUPS]);
    expect(hiddenGroupsOf(presetPrefs("advanced"))).toEqual([]);
    const custom: PanelPrefs = { ...presetPrefs("standard"), volume: false, fxCommodity: true };
    const hidden = hiddenGroupsOf(custom);
    expect(hidden).toEqual(["volume", "valuationDetail", "healthDetail"]);
    const back = Object.fromEntries(INFO_GROUPS.map((g) => [g, !hidden.includes(g)]));
    expect(back).toEqual(custom);
  });
});

describe("PUT /api/me/prefs 정규화 (rules.normalizePrefs)", () => {
  it("custom이 아니면 보낸 토글은 무시하고 NULL(프리셋)", () => {
    for (const l of PRESETS) {
      expect(normalizePrefs(l, undefined)).toEqual({ infoLevel: l, panelPrefs: null });
      expect(normalizePrefs(l, presetPrefs(l === "basic" ? "advanced" : "basic"))).toEqual({ infoLevel: l, panelPrefs: null });
    }
  });

  it("custom인데 토글이 없으면 null(→ 422)", () => {
    expect(normalizePrefs("custom", undefined)).toBeNull();
  });

  it("custom인데 프리셋과 같은 토글이면 그 수준 + NULL", () => {
    for (const l of PRESETS) expect(normalizePrefs("custom", presetPrefs(l))).toEqual({ infoLevel: l, panelPrefs: null });
  });

  it("custom이고 프리셋과 다르면 custom + 토글(복사본)", () => {
    const p: PanelPrefs = { ...presetPrefs("basic"), riskChips: true };
    const n = normalizePrefs("custom", p);
    expect(n).toEqual({ infoLevel: "custom", panelPrefs: p });
    expect(n?.panelPrefs).not.toBe(p);
  });
});

describe("저장된 토글 읽기 (rules.storedPrefs·effectivePrefs)", () => {
  it("객체가 아니면 null", () => {
    for (const raw of [null, undefined, "x", 3, [true], true]) expect(storedPrefs(raw)).toBeNull();
  });

  it("모르는 키는 버리고, 없는·불리언이 아닌 묶음은 중급 값으로 채운다", () => {
    const p = storedPrefs({ marketLine: false, healthDetail: true, fxCommodity: "yes", bogus: true });
    expect(p).toEqual({ ...INFO_PRESETS.standard, marketLine: false, healthDetail: true });
    expect(Object.keys(p ?? {})).toEqual([...INFO_GROUPS]);
  });

  it("프리셋 수준은 저장값과 상관없이 그 프리셋, custom은 저장된 토글(없으면 중급)", () => {
    const custom: PanelPrefs = { ...presetPrefs("basic"), volume: true };
    for (const l of PRESETS) expect(effectivePrefs(l, custom)).toEqual(presetPrefs(l));
    expect(effectivePrefs("custom", custom)).toEqual(custom);
    expect(effectivePrefs("custom", null)).toEqual(INFO_PRESETS.standard);
  });

  it("왕복: 정규화해 저장한 것을 읽으면 보낸 토글과 같고, 그 토글의 수준은 저장한 수준", () => {
    const cases: [InfoLevel, PanelPrefs | undefined][] = [
      ["basic", undefined],
      ["custom", presetPrefs("advanced")],
      ["custom", { ...presetPrefs("standard"), allNotes: false }],
    ];
    for (const [level, prefs] of cases) {
      const n = normalizePrefs(level, prefs);
      expect(n).not.toBeNull();
      if (!n) continue;
      const shown = effectivePrefs(n.infoLevel, n.panelPrefs === null ? null : JSON.parse(JSON.stringify(n.panelPrefs)));
      expect(levelForPrefs(shown)).toBe(n.infoLevel);
      if (prefs) expect(shown).toEqual(prefs);
    }
  });
});

describe("판단의 숨긴 묶음·되돌리기 시간", () => {
  it("canonicalGroups: 계약 순서로, 겹치지 않게, 모르는 이름은 버린다", () => {
    expect(canonicalGroups(["riskChips", "marketLine", "riskChips", "nope"])).toEqual(["marketLine", "riskChips"]);
    expect(canonicalGroups([])).toEqual([]);
  });

  it("undoSecondsOf: 2.5·5·10만, 다른 값은 기본값 2.5", () => {
    expect([2.5, 5, 10].map(undoSecondsOf)).toEqual([2.5, 5, 10]);
    expect(undoSecondsOf(3)).toBe(2.5);
    expect(undoSecondsOf(Number.NaN)).toBe(2.5);
  });
});
