#!/usr/bin/env python3
"""카드 체크리스트 자동 검사(기획안 §10.2 · 구현계획 §6 · ADR-0001·0003·0004).

카드마다: 스키마, 판단 전 구획(public)의 누수 0건(누수 사전·티커·절대 날짜·결과 수치·판단일 이후 상대 날짜),
지수 배열(14점·첫 값 100·결과 경로 끝값 = 100 + 수익률), 판단 기간과 날짜, 자료 기준일 ≤ 판단일과
공시 상대 날짜, 칩 id 중복, 학습 포인트 개념 존재, 출처('가격' 원천·배당·분할 표기, 예시 표기).
덱 전체: 카드 id 중복, live 카드의 deckOrder 중복, 같은 결과 상태 3연속 금지.

사용:  python3 tools/cards/check_case.py content/cards [--schema 경로] [--concepts 경로] [--strict]
종료 코드: 0 통과, 1 실패(오류가 하나라도 있으면; --strict면 경고도 실패).
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cardlib  # noqa: E402
import leakscan  # noqa: E402
from schema_lite import Validator  # noqa: E402

INDEX_PATHS = ("$.public.panels.flow.index14", "$.public.panels.flow.market14",
               "$.reveal.outcome.pricePath", "$.reveal.outcome.benchPath")
HORIZON_TOLERANCE_DAYS = 7
PERIOD_RE = re.compile(r"^\s*(\d{4})\s*Q([1-4])\s*→\s*(\d{4})\s*Q([1-4])\s*$")


@dataclass
class Issue:
    severity: str        # "error" | "warning"
    category: str
    path: str
    message: str


@dataclass
class CardResult:
    file: Path
    card: Any
    issues: list[Issue] = field(default_factory=list)

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "warning"]


@dataclass
class Report:
    target: str
    schema_path: Path
    concepts_path: Path
    cards: list[CardResult]
    concepts: list[Issue]
    concept_count: int
    quiz_count: int
    deck: list[Issue]
    deck_lines: list[str]

    def all_issues(self) -> list[Issue]:
        return [i for c in self.cards for i in c.issues] + self.concepts + self.deck

    def ok(self, strict: bool = False) -> bool:
        if not self.cards:
            return False
        bad = {"error", "warning"} if strict else {"error"}
        return not any(i.severity in bad for i in self.all_issues())

    def render(self, strict: bool = False) -> str:
        out = [f"복기 카드 검사: {_rel(self.target)}",
               f"  스키마 {_rel(self.schema_path)} · 개념 {_rel(self.concepts_path)}", ""]
        if not self.cards:
            out.append("[실패] 카드 파일(*.json)이 없어요.")
        for c in self.cards:
            mark = "실패" if c.errors or (strict and c.warnings) else "통과"
            out.append(f"[{mark}] {c.file.name} — {_card_line(c.card)}")
            out.extend(_issue_lines(c.issues, "    "))
        concept_mark = "실패" if any(i.severity == "error" for i in self.concepts) else "통과"
        out += ["", f"개념 파일: [{concept_mark}] 개념 {self.concept_count}개 · 확인 문제 {self.quiz_count}개"]
        out.extend(_issue_lines(self.concepts, "    "))
        deck_mark = "실패" if any(i.severity == "error" for i in self.deck) else "통과"
        out.append(f"덱: [{deck_mark}]")
        out.extend(f"    {line}" for line in self.deck_lines)
        out.extend(_issue_lines(self.deck, "    "))
        issues = self.all_issues()
        n_err = sum(i.severity == "error" for i in issues)
        n_warn = sum(i.severity == "warning" for i in issues)
        passed = sum(1 for c in self.cards if not c.errors and not (strict and c.warnings))
        verdict = "통과" if self.ok(strict) else "실패"
        out += ["", f"결과: {verdict} — 카드 {len(self.cards)}장(통과 {passed}, 실패 {len(self.cards) - passed}) · "
                    f"오류 {n_err}건 · 경고 {n_warn}건" + (" · --strict" if strict else "")]
        return "\n".join(out)


def _rel(path: Path | str) -> str:
    """현재 폴더 아래면 상대 경로, 바깥이면 절대 경로."""
    try:
        rel = os.path.relpath(path)
    except ValueError:
        return str(path)
    return str(Path(path).resolve()) if rel.startswith("..") else rel


def _issue_lines(issues: list[Issue], indent: str) -> list[str]:
    order = sorted(issues, key=lambda i: (i.severity != "error", i.category, i.path))
    return [f"{indent}{'오류' if i.severity == 'error' else '경고'} [{i.category}] {i.path}: {i.message}" for i in order]


def _card_line(card: Any) -> str:
    if not isinstance(card, dict):
        return "읽을 수 없음"
    pub = card.get("public") if isinstance(card.get("public"), dict) else {}
    parts = [f"v{card.get('version')}", str(card.get("status")), f"deckOrder {card.get('deckOrder')}",
             str(pub.get("yearPublic")), str(pub.get("sectorPublic"))]
    try:
        parts.append(f"결과 {cardlib.STATE_KO[cardlib.card_state(card)]}")
    except (KeyError, TypeError):
        pass
    return " · ".join(parts)


def _display_path(path: str) -> str:
    return "(카드)" if path == "$" else path[2:] if path.startswith("$.") else path


def _schema_category(path: str, message: str) -> str:
    if path.startswith(INDEX_PATHS):
        return "지수 배열"
    if path.startswith("$.public.horizonDays"):
        return "판단 기간"
    if path == "$.internal.notes" and "예시 자료" in message:
        return "예시 표기"
    return "스키마"


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_index14(value: Any) -> bool:
    return isinstance(value, list) and len(value) == cardlib.INDEX_POINTS and all(_is_number(v) for v in value)


def _short(text: str, n: int = 40) -> str:
    return text if len(text) <= n else text[: n - 1] + "…"


# ---------- 개념 파일 ----------

def check_concepts(path: Path, schema_path: Path) -> tuple[set[str] | None, list[Issue], int, int]:
    issues: list[Issue] = []

    def err(where: str, msg: str) -> None:
        issues.append(Issue("error", "개념 파일", where, msg))

    if not path.exists():
        err(str(path), "concepts.json이 없어 학습 포인트를 확인할 수 없어요")
        return None, issues, 0, 0
    try:
        data = cardlib.load_json(path)
    except ValueError as e:
        err(str(path), f"JSON을 읽을 수 없어요: {e}")
        return None, issues, 0, 0
    if schema_path.exists():
        for p, m in Validator(cardlib.load_json(schema_path)).errors(data):
            err(_display_path(p), m)
    concepts = data.get("concepts") if isinstance(data, dict) else None
    concepts = concepts if isinstance(concepts, list) else []
    ids: list[str] = []
    quiz_ids: list[str] = []
    for i, c in enumerate(concepts):
        if not isinstance(c, dict):
            continue
        ids.append(c.get("id"))
        body = c.get("body")
        if isinstance(body, str) and (n := cardlib.count_sentences(body)) != 3:
            err(f"concepts[{i}].body", f"설명은 정확히 세 문장이어야 해요 (지금 {n if n > 0 else '문장부호로 안 끝남'})")
        for j, q in enumerate(c.get("quizzes") or []):
            if not isinstance(q, dict):
                continue
            quiz_ids.append(q.get("quizId"))
            opts, ans = q.get("options"), q.get("answerIndex")
            if isinstance(opts, list) and isinstance(ans, int) and not 0 <= ans < len(opts):
                err(f"concepts[{i}].quizzes[{j}].answerIndex", f"정답 번호({ans})가 보기 {len(opts)}개의 범위를 벗어나요")
    for label, values in (("개념 id", ids), ("퀴즈 id", quiz_ids)):
        dup = sorted(v for v, n in Counter(values).items() if n > 1)
        if dup:
            err(label, f"겹치는 값: {', '.join(map(str, dup))}")
    return {i for i in ids if isinstance(i, str)}, issues, len(ids), len(quiz_ids)


# ---------- 카드 한 장 ----------

def check_card(card: Any, validator: Validator, concept_ids: set[str] | None) -> list[Issue]:
    issues: list[Issue] = []

    def err(cat: str, path: str, msg: str) -> None:
        issues.append(Issue("error", cat, path, msg))

    def warn(cat: str, path: str, msg: str) -> None:
        issues.append(Issue("warning", cat, path, msg))

    if not isinstance(card, dict):
        err("스키마", "(카드)", "카드는 JSON 객체여야 해요")
        return issues
    for p, m in validator.errors(card):
        err(_schema_category(p, m), _display_path(p), m)

    for p, text in cardlib.iter_strings(card, "$"):
        if "TODO" in text:
            err("자리표시자", _display_path(p), f"채우지 않은 자리표시자: {_short(text)}")

    pub = card.get("public") if isinstance(card.get("public"), dict) else {}
    out = cardlib.dig(card, "reveal", "outcome")
    out = out if isinstance(out, dict) else {}
    internal = card.get("internal") if isinstance(card.get("internal"), dict) else {}
    r, b = out.get("returnPct"), out.get("benchReturnPct")
    numbers_ok = _is_number(r) and _is_number(b)
    start, end = cardlib.parse_date(out.get("startDate")), cardlib.parse_date(out.get("endDate"))
    cutoff = cardlib.parse_date(internal.get("dataCutoff"))

    # 1) 판단 전 구획 누수: 누수 사전(+회사명·티커), 절대 날짜, 결과 수치, 판단일 이후 상대 날짜
    raw_terms = internal.get("leakTerms")
    terms = [t for t in raw_terms if isinstance(t, str)] if isinstance(raw_terms, list) else []
    for label, extra in (("companyName", out.get("companyName")), ("ticker", out.get("ticker"))):
        if isinstance(extra, str) and extra.strip() and "TODO" not in extra and extra not in terms:
            warn("누수 사전", "internal.leakTerms", f"누수 사전에 없는 {label}: '{extra}' — 검사에는 넣었어요")
            terms.append(extra)
    numbers = {}
    if numbers_ok:
        numbers = {"returnPct": r, "benchReturnPct": b, "relativePp": cardlib.relative_pp(r, b)}
    for p, text in cardlib.iter_strings(pub, "public"):
        for f in leakscan.scan_text(p, text, terms=terms, numbers=numbers):
            (err if f.severity == "error" else warn)(leakscan.KIND_KO[f.kind], p, f"'{f.match}' — {f.detail}")

    # 2) 지수 배열: 결과 경로 끝값, 흐름 판에 결과 경로가 들어가지 않았는지
    flow = cardlib.dig(pub, "panels", "flow")
    flow = flow if isinstance(flow, dict) else {}
    for key, value, base in (("pricePath", out.get("pricePath"), r), ("benchPath", out.get("benchPath"), b)):
        if _is_index14(value) and _is_number(base) and abs(value[-1] - (100 + base)) > 0.051:
            err("지수 배열", f"reveal.outcome.{key}", f"끝값({value[-1]})이 100 + 수익률({100 + base:.1f})과 달라요")
    for a_key, b_key in (("index14", "pricePath"), ("market14", "benchPath")):
        series = flow.get(a_key)
        if _is_index14(series) and len(set(series)) > 1 and series == out.get(b_key):   # 평평한 자리표시자는 제외
            err("누수", f"public.panels.flow.{a_key}", f"결과 경로({b_key})와 같아요 — 판단일 이후 구간이 들어갔어요")

    # 3) 판단 기간·날짜·공개 연도·기간 표기
    horizon = pub.get("horizonDays")
    if start and end:
        span = (end - start).days
        if span <= 0:
            err("날짜", "reveal.outcome.endDate", "endDate가 startDate보다 뒤여야 해요")
        elif horizon in cardlib.HORIZONS and abs(span - horizon) > HORIZON_TOLERANCE_DAYS:
            err("판단 기간", "reveal.outcome", f"startDate~endDate가 {span}일인데 horizonDays는 {horizon}일이에요"
                f"(±{HORIZON_TOLERANCE_DAYS}일 허용)")
    year = pub.get("yearPublic")
    if start and isinstance(year, int) and not isinstance(year, bool) and year != start.year:
        err("공개 연도", "public.yearPublic", f"공개 연도({year})가 판단일 연도({start.year})와 달라요")
    period = out.get("period")
    if isinstance(period, str) and start and end:
        m = PERIOD_RE.match(period)
        if not m:
            warn("기간 표기", "reveal.outcome.period", f"'{period}' — 'YYYY Qn → YYYY Qn' 형식을 권해요")
        else:
            want = (start.year, (start.month - 1) // 3 + 1, end.year, (end.month - 1) // 3 + 1)
            got = tuple(int(x) for x in m.groups())
            if got != want:
                err("기간 표기", "reveal.outcome.period",
                    f"기간 표기('{period}')가 날짜({want[0]} Q{want[1]} → {want[2]} Q{want[3]})와 달라요")

    # 4) 자료 기준일 ≤ 판단일, 상대 날짜(공시 시점)는 자료 기준일 이전
    gap = 0
    if cutoff and start:
        if cutoff > start:
            err("자료 기준일", "internal.dataCutoff", f"자료 기준일({cutoff})이 판단일({start})보다 늦어요 — 판단 시점 이후 정보")
        else:
            gap = (start - cutoff).days
    for p, text in cardlib.iter_strings(pub, "public"):
        for m in cardlib.REL_DAY_RE.finditer(text):
            if int(m.group(1)) < gap:
                err("공시일·자료 기준일", p, f"'{m.group(0)}' 정보가 자료 기준일({cutoff}, 판단일 D-{gap})보다 늦어요")
    notes = cardlib.dig(pub, "panels", "then", "notes")
    if isinstance(notes, list):
        days = [cardlib.REL_DAY_RE.search(str(n.get("when", ""))) if isinstance(n, dict) else None for n in notes]
        if all(days):
            values = [int(d.group(1)) for d in days]
            if values != sorted(values, reverse=True):
                warn("그때 판", "public.panels.then.notes", "소식은 오래된 것부터(D-큰 수 → 작은 수) 적어 주세요")

    # 5) 칩: id·이름 중복, '왜 중요한가' 한 문장
    for key in ("evidenceOptions", "riskOptions"):
        items = [x for x in pub.get(key) or [] if isinstance(x, dict)]
        for field_name, cat in (("id", "칩 id"), ("label", "칩 이름")):
            dup = sorted(str(v) for v, n in Counter(x.get(field_name) for x in items).items() if n > 1)
            if dup:
                err(cat, f"public.{key}", f"겹치는 {field_name}: {', '.join(dup)}")
    for i, ev in enumerate(pub.get("evidenceOptions") or []):
        why = ev.get("why") if isinstance(ev, dict) else None
        if isinstance(why, str) and cardlib.count_sentences(why) != 1:
            warn("근거 설명", f"public.evidenceOptions[{i}].why", "'왜 중요한가'는 한 문장으로 써 주세요")

    # 6) 학습 포인트
    lps = [x for x in cardlib.dig(card, "reveal", "learningPoints") or [] if isinstance(x, dict)]
    for i, lp in enumerate(lps):
        cid = lp.get("conceptId")
        if concept_ids is not None and isinstance(cid, str) and cid not in concept_ids:
            err("학습 포인트", f"reveal.learningPoints[{i}].conceptId", f"concepts.json에 없는 개념이에요: {cid}")
    cids = [lp.get("conceptId") for lp in lps]
    if len(set(cids)) != len(cids):
        err("학습 포인트", "reveal.learningPoints", "같은 개념이 두 번 있어요")
    ranks = [lp.get("rank") for lp in lps]
    if ranks and all(isinstance(x, int) for x in ranks) and sorted(ranks) != list(range(1, len(ranks) + 1)):
        err("학습 포인트", "reveal.learningPoints", f"rank는 1부터 겹치지 않게 매겨 주세요 (지금 {ranks})")

    # 7) 출처: '가격' 원천 + 배당·분할 표기(ADR-0003, 체크리스트), 예시 표기
    sources = [s for s in out.get("sources") or [] if isinstance(s, dict)]
    price = [s for s in sources if s.get("kind") == "가격"]
    if sources and not price:
        err("출처", "reveal.outcome.sources", "kind '가격' 출처(파생 지수 원천)가 없어요")
    elif price and not any("배당" in str(s.get("label")) and "분할" in str(s.get("label")) for s in price):
        err("배당·분할", "reveal.outcome.sources", "'가격' 출처에 배당·분할 반영 여부를 적어 주세요(예: 배당 재투자·분할 반영)")
    if internal.get("example") is True and not any(s.get("kind") == "예시" for s in sources):
        err("예시 표기", "reveal.outcome.sources", "예시 카드는 공개 화면에도 kind '예시' 출처로 표기해야 해요")
    if internal.get("example") is False and sources and not any(s.get("url") for s in sources):
        warn("출처", "reveal.outcome.sources", "원문 링크(url)가 하나도 없어요")

    # 8) ±1%p 경계에 붙은 결과
    if numbers_ok:
        rel = cardlib.relative_pp(r, b)
        if abs(abs(rel) - cardlib.EVEN_BAND_PP) < 0.05:
            warn("결과 상태", "reveal.outcome", f"시장 대비 {rel:+.1f}%p가 ±1%p 경계에 붙어 있어요 — 반올림 차이로 상태가 갈릴 수 있어요")
    return issues


# ---------- 덱 ----------

def check_deck(results: list[CardResult]) -> tuple[list[Issue], list[str]]:
    issues: list[Issue] = []
    lines: list[str] = []
    cards = [(r.file, r.card) for r in results if isinstance(r.card, dict)]

    by_id: dict[Any, list[str]] = defaultdict(list)
    for f, c in cards:
        by_id[c.get("id")].append(f.name)
    for cid, names in by_id.items():
        if len(names) > 1:
            issues.append(Issue("error", "카드 id", str(cid), f"같은 id를 쓰는 파일: {', '.join(names)}"))

    live = [(f, c) for f, c in cards if c.get("status") == "live"]
    orders: dict[Any, list[str]] = defaultdict(list)
    for f, c in live:
        orders[c.get("deckOrder")].append(f.name)
    for order, names in sorted(orders.items(), key=lambda kv: str(kv[0])):
        if len(names) > 1:
            issues.append(Issue("error", "deckOrder", f"deckOrder {order}", f"live 카드끼리 겹쳐요: {', '.join(names)}"))
    for f, c in cards:
        if c.get("status") != "live" and c.get("deckOrder") in orders:
            issues.append(Issue("warning", "deckOrder", f.name,
                                f"live가 아닌 카드의 deckOrder({c.get('deckOrder')})가 live 카드와 겹쳐요"))

    sortable = [(f, c) for f, c in live if isinstance(c.get("deckOrder"), int)]
    sortable.sort(key=lambda fc: (fc[1]["deckOrder"], fc[0].name))
    try:
        states = [cardlib.card_state(c) for _, c in sortable]
    except (KeyError, TypeError):
        lines.append("결과 상태를 계산할 수 없는 live 카드가 있어 3연속 검사를 건너뛰었어요")
        return issues, lines
    seq = " · ".join(f"{c['deckOrder']} {cardlib.STATE_KO[s]}" for (_, c), s in zip(sortable, states))
    counts = Counter(states)
    lines.append(f"live {len(live)}장 결과 순서: {seq or '(없음)'}")
    lines.append(" · ".join(f"{cardlib.STATE_KO[s]} {counts.get(s, 0)}" for s in cardlib.STATES))
    for i in cardlib.triple_runs(states):
        trio = "·".join(str(sortable[i + k][1]["deckOrder"]) for k in range(3))
        issues.append(Issue("error", "결과 균형", f"deckOrder {trio}",
                            f"세 장 연속 '{cardlib.STATE_KO[states[i]]}'이에요 — pick_case.py로 순서를 다시 정하세요"))
    return issues, lines


# ---------- 실행 ----------

def _default(paths: list[Path], relative: str, fallback: Path) -> Path:
    for p in paths:
        base = p if p.is_dir() else p.parent
        candidate = (base / relative).resolve()
        if candidate.exists():
            return candidate
    return fallback


def run(targets: list[str | Path], schema_path: str | Path | None = None,
        concepts_path: str | Path | None = None) -> Report:
    paths = [Path(t) for t in targets]
    files: list[Path] = []
    for p in paths:
        files.extend(cardlib.card_files(p) if p.is_dir() else [p])
    schema = Path(schema_path) if schema_path else _default(paths, "../schema/card.schema.json", cardlib.SCHEMA_PATH)
    concepts = Path(concepts_path) if concepts_path else _default(paths, "../concepts.json", cardlib.CONCEPTS_PATH)
    concepts_schema = concepts.parent / "schema" / "concepts.schema.json"
    if not concepts_schema.exists():
        concepts_schema = cardlib.CONCEPTS_SCHEMA_PATH

    validator = Validator(cardlib.load_json(schema))
    concept_ids, concept_issues, n_concepts, n_quizzes = check_concepts(concepts, concepts_schema)
    results: list[CardResult] = []
    for f in files:
        try:
            card = cardlib.load_json(f)
        except (OSError, ValueError) as e:
            results.append(CardResult(f, None, [Issue("error", "JSON", f.name, f"읽을 수 없어요: {e}")]))
            continue
        results.append(CardResult(f, card, check_card(card, validator, concept_ids)))
    deck_issues, deck_lines = check_deck(results)
    target = ", ".join(str(t) for t in targets)
    return Report(target, schema, concepts, results, concept_issues, n_concepts, n_quizzes, deck_issues, deck_lines)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="복기 카드 체크리스트 자동 검사")
    p.add_argument("targets", nargs="+", help="카드 폴더(바로 아래 *.json) 또는 카드 파일")
    p.add_argument("--schema", help="카드 스키마 경로 (기본: <폴더>/../schema/card.schema.json)")
    p.add_argument("--concepts", help="concepts.json 경로 (기본: <폴더>/../concepts.json)")
    p.add_argument("--strict", action="store_true", help="경고도 실패로 센다")
    a = p.parse_args(argv)
    report = run(a.targets, a.schema, a.concepts)
    print(report.render(a.strict))
    return 0 if report.ok(a.strict) else 1


if __name__ == "__main__":
    raise SystemExit(main())
