"""판단 전 구획(public)의 누수 규칙 — check_case.py(찾기)와 mask.py(지우기)가 함께 쓴다.

찾는 것(오류): 누수 단어(회사명·티커·제품명), 절대 날짜, 결과 수치, 판단일 이후 상대 날짜.
알리는 것(경고): 연도·월·분기만 적힌 표기, 사전에 없는 대문자 토큰, 영문 고유명사로 보이는 단어.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

# ---------- 결과 ----------


@dataclass(frozen=True)
class Finding:
    kind: str        # 아래 KIND_KO의 키
    severity: str    # "error" | "warning"
    path: str
    match: str
    start: int
    end: int
    detail: str = ""
    source: str = ""     # 걸린 누수 사전 단어(누수 단어·티커일 때)


KIND_KO = {
    "leak_term": "누수 단어",
    "ticker": "티커",
    "abs_date": "절대 날짜",
    "outcome_number": "결과 수치",
    "future_day": "판단일 이후 상대 날짜",
    "year_only": "연도 표기",
    "month_only": "월 표기",
    "quarter_only": "분기 표기",
    "unknown_token": "모르는 대문자 토큰",
    "proper_noun": "영문 고유명사 의심",
}

# ---------- 누수 단어 ----------

TICKER_LIKE_RE = re.compile(r"[A-Z][A-Z0-9.\-]{0,5}")


def is_ticker_like(term: str) -> bool:
    return bool(TICKER_LIKE_RE.fullmatch(term.strip()))


def term_regex(term: str) -> re.Pattern[str]:
    """누수 단어 하나의 정규식.

    - 티커 모양(대문자 1~6자): 대소문자 구분, 앞뒤가 영숫자·&가 아닐 때만 (KO가 KOSPI에, M이 M&A에 걸리지 않게)
    - 그 밖의 영문: 대소문자 무시, 영숫자 경계, 단어 사이 공백 수 무시
    - 한글 등: 글자 사이 공백을 무시하고 부분 일치 ("코카 콜라"·"코카콜라는" 모두 잡는다)
    """
    t = term.strip()
    if is_ticker_like(t):
        return re.compile(rf"(?<![A-Za-z0-9&]){re.escape(t)}(?![A-Za-z0-9&])")
    if t.isascii():
        body = r"\s+".join(re.escape(w) for w in t.split())
        return re.compile(rf"(?<![A-Za-z0-9]){body}(?![A-Za-z0-9])", re.IGNORECASE)
    body = r"\s*".join(re.escape(c) for c in t if not c.isspace())
    return re.compile(body, re.IGNORECASE)


def find_terms(path: str, text: str, terms: Iterable[str]) -> list[Finding]:
    """긴 단어부터 찾고, 이미 잡힌 자리와 겹치는 짧은 단어는 다시 세지 않는다(델타항공 ⊃ 델타)."""
    found: list[Finding] = []
    taken: list[tuple[int, int]] = []
    for term in sorted({t.strip() for t in terms if t and t.strip()}, key=lambda t: (-len(t), t)):
        kind = "ticker" if is_ticker_like(term) else "leak_term"
        for m in term_regex(term).finditer(text):
            if any(m.start() < e and s < m.end() for s, e in taken):
                continue
            taken.append((m.start(), m.end()))
            found.append(Finding(kind, "error", path, m.group(0), m.start(), m.end(), f"누수 사전 '{term}'", term))
    return found


# ---------- 날짜 ----------

_DAY = r"(?:0?[1-9]|[12]\d|3[01])"
_MONTH = r"(?:0?[1-9]|1[0-2])"
_YEAR = r"(?:19|20)\d{2}"
_MONTH_EN = (r"January|February|March|April|May|June|July|August|September|October|November|December")
_MONTH_EN_ABBR = r"Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"

ABS_DATE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("YYYY-MM-DD", re.compile(rf"(?<!\d){_YEAR}\s*[-./]\s*{_MONTH}\s*[-./]\s*{_DAY}(?!\d)")),
    ("YYYY년 M월", re.compile(rf"{_YEAR}\s*년\s*{_MONTH}\s*월(?:\s*{_DAY}\s*일)?")),
    ("M월 D일", re.compile(rf"(?<!\d){_MONTH}\s*월\s*{_DAY}\s*일")),
    ("MM/DD/YYYY", re.compile(rf"(?<![\d/]){_MONTH}/{_DAY}/(?:{_YEAR}|\d{{2}})(?![\d/])")),
    ("영문 월 이름", re.compile(rf"\b(?:{_MONTH_EN})\b|\b(?:{_MONTH_EN_ABBR})\b\.?(?=\s*['’]?\d)", re.IGNORECASE)),
    ("연도+분기·반기", re.compile(
        rf"{_YEAR}\s*년?\s*(?:Q[1-4]|[1-4]\s*분기|[상하]반기)|(?<![A-Za-z])Q[1-4]\s*['’]?(?:{_YEAR}|\d{{2}})(?!\d)"
        rf"|(?<![A-Za-z0-9])[1-4]Q\s*['’]?(?:{_YEAR}|\d{{2}})(?!\d)|(?<![A-Za-z])FY\s*['’]?(?:{_YEAR}|\d{{2}})(?!\d)")),
]
WARN_DATE_PATTERNS: list[tuple[str, str, re.Pattern[str]]] = [
    ("year_only", "연도만 적혀 있어요 — 판단 연도와 다르면 시점이 드러나요",
     re.compile(r"(?<![\d.])(?:19[5-9]\d|20[0-4]\d)(?![\d.])(?:\s*년)?")),
    ("month_only", "달 이름은 정확한 날짜의 단서예요 — '판단일 D-n'으로 바꿔 주세요",
     re.compile(rf"(?<![\d.]){_MONTH}\s*월(?!\s*간)")),
    ("quarter_only", "분기 번호는 시점의 단서예요 — '직전 분기'·'다음 분기'로 바꿔 주세요",
     re.compile(r"(?<![\d.])[1-4]\s*분기")),
]
FUTURE_DAY_RE = re.compile(r"(?:판단일\s*)?D\s*\+\s*\d+")


def find_dates(path: str, text: str) -> list[Finding]:
    found: list[Finding] = []
    spans: list[tuple[int, int]] = []
    for label, pattern in ABS_DATE_PATTERNS:
        for m in pattern.finditer(text):
            if any(m.start() < e and s < m.end() for s, e in spans):
                continue
            spans.append((m.start(), m.end()))
            found.append(Finding("abs_date", "error", path, m.group(0), m.start(), m.end(), label))
    for m in FUTURE_DAY_RE.finditer(text):
        found.append(Finding("future_day", "error", path, m.group(0), m.start(), m.end(),
                             "판단일 이후 정보는 판단 전 구획에 둘 수 없어요"))
    for kind, detail, pattern in WARN_DATE_PATTERNS:
        for m in pattern.finditer(text):
            if any(m.start() < e and s < m.end() for s, e in spans):
                continue
            found.append(Finding(kind, "warning", path, m.group(0).strip(), m.start(), m.end(), detail))
    return found


# ---------- 결과 수치 ----------


def number_forms(value: float) -> list[str]:
    """결과 수치가 글로 적힐 법한 모양. 부호는 보지 않는다(+4.8·−4.8·-4.8 모두 4.8로 잡힌다)."""
    a = abs(value)
    forms = {f"{a:.1f}", f"{a:.2f}"}
    if round(a, 2) == round(a) and a >= 1:
        forms.add(f"{round(a)}%")       # 정수 수익률은 "24%"처럼도 적힐 수 있다
    return sorted(forms)


def find_numbers(path: str, text: str, values: dict[str, float]) -> list[Finding]:
    found: list[Finding] = []
    for label, value in values.items():
        if value is None:
            continue
        for form in number_forms(value):
            if form.endswith("%"):
                pattern = rf"(?<![\d.]){re.escape(form[:-1])}\s*%"
            else:
                pattern = rf"(?<![\d.]){re.escape(form)}(?!\d)"
            for m in re.finditer(pattern, text):
                found.append(Finding("outcome_number", "error", path, m.group(0), m.start(), m.end(),
                                     f"reveal의 {label} 값({value})과 같아요"))
    return found


# ---------- 대문자 토큰·영문 고유명사 ----------

UPPER_TOKEN_RE = re.compile(r"(?<![A-Za-z])[A-Z]{1,5}(?![A-Za-z])")
PROPER_NOUN_RE = re.compile(r"(?<![A-Za-z])[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*")
KNOWN_PHRASES = ("S&P", "M&A", "R&D", "P&L", "Q&A")
REL_MARKER_RE = re.compile(r"(?<![A-Za-z])D\s*[-+]\s*\d+")
ALLOWED_TOKENS = frozenset({
    # 재무·밸류에이션
    "PER", "PBR", "PSR", "PEG", "EPS", "BPS", "DPS", "FCF", "OCF", "ROE", "ROA", "ROIC", "EBIT", "CAPEX", "OPM",
    "YOY", "QOQ", "TTM", "NAV",
    # 거시·시장
    "GDP", "CPI", "PCE", "PPI", "PMI", "ISM", "FOMC", "FED", "ECB", "BOJ", "BOK", "OPEC", "WTI", "VIX",
    "USD", "KRW", "EUR", "JPY", "CNY", "ETF", "IPO", "US", "EU", "UK",
    # 산업·일반
    "AI", "PC", "TV", "IT", "EV", "SUV", "DRAM", "NAND", "GPU", "CPU", "SNS", "OTT", "CEO", "CFO", "FDA", "SEC",
    # 도구가 쓰는 자리표시자
    "TODO",
})
ALLOWED_WORDS = frozenset({"Fed"})


def find_tokens(path: str, text: str, allowed: Iterable[str] = ()) -> list[Finding]:
    """사전에 없는 대문자 토큰과 영문 고유명사를 경고로 알린다(누수 사전 일치는 find_terms가 오류로 잡는다)."""
    allow = ALLOWED_TOKENS | {a.strip() for a in allowed}
    cleaned = REL_MARKER_RE.sub(lambda m: " " * len(m.group(0)), text)   # 판단일 D-12의 D는 토큰이 아니다
    for phrase in KNOWN_PHRASES:
        cleaned = cleaned.replace(phrase, " " * len(phrase))
    found: list[Finding] = []
    for m in UPPER_TOKEN_RE.finditer(cleaned):
        if m.group(0) not in allow:
            found.append(Finding("unknown_token", "warning", path, m.group(0), m.start(), m.end(),
                                 "회사·티커·제품 약칭이 아닌지 확인해 주세요"))
    for m in PROPER_NOUN_RE.finditer(cleaned):
        if m.group(0) not in ALLOWED_WORDS:
            found.append(Finding("proper_noun", "warning", path, m.group(0), m.start(), m.end(),
                                 "회사·제품 이름이 아닌지 확인해 주세요"))
    return found


def scan_text(path: str, text: str, *, terms: Iterable[str], numbers: dict[str, float],
              allowed_tokens: Iterable[str] = ()) -> list[Finding]:
    """한 문자열의 모든 규칙. 오류와 같은 자리에 겹치는 경고는 버린다(같은 문제를 두 번 말하지 않게)."""
    terms = [t for t in terms if t and t.strip()]
    findings = find_terms(path, text, terms) + find_dates(path, text) + find_numbers(path, text, numbers)
    findings += find_tokens(path, text, list(allowed_tokens) + [t for t in terms if is_ticker_like(t)])
    error_spans = [(f.start, f.end) for f in findings if f.severity == "error"]
    return [f for f in findings
            if f.severity == "error" or not any(f.start < e and s < f.end for s, e in error_spans)]
