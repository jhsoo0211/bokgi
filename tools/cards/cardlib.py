"""복기 카드 도구 공용 함수: 경로, JSON 읽기·쓰기, 결과 상태, 문자열 순회.

표준 라이브러리만 쓴다. 같은 폴더의 다른 도구는 `import cardlib`로 가져온다.
"""
from __future__ import annotations

import json
import math
import re
from datetime import date
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[2]
CONTENT_DIR = ROOT / "content"
CARDS_DIR = CONTENT_DIR / "cards"
DRAFTS_DIR = CONTENT_DIR / "drafts"
SCHEMA_PATH = CONTENT_DIR / "schema" / "card.schema.json"
CONCEPTS_PATH = CONTENT_DIR / "concepts.json"
CONCEPTS_SCHEMA_PATH = CONTENT_DIR / "schema" / "concepts.schema.json"

EVEN_BAND_PP = 1.0                 # 시장 대비 ±1%p 이내 = 비슷함 (contract.ts resultState와 같다)
STATES = ("ahead", "behind", "even")
STATE_KO = {"ahead": "앞섬", "behind": "뒤짐", "even": "비슷함"}
HORIZONS = (90, 180, 365)
INDEX_POINTS = 14
INDEX_BASE = 100

REL_DAY_RE = re.compile(r"판단일\s*D\s*-\s*(\d+)")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


# ---------- JSON ----------

def load_json(path: Path | str) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _scalar(value: Any) -> str:
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        value = int(value)
    return json.dumps(value, ensure_ascii=False)


def _is_scalar(value: Any) -> bool:
    return value is None or isinstance(value, (bool, int, float, str))


def dumps(obj: Any, width: int = 100, indent: int = 2) -> str:
    """카드용 JSON 서식. 짧은 배열·객체는 한 줄로 둬서 14점 지수가 한눈에 보이게 한다.

    정수로 떨어지는 실수(100.0)는 정수로 쓴다. 모든 카드 도구가 이 서식으로 쓰므로
    도구를 다시 돌려도 diff가 생기지 않는다.
    """

    def render(value: Any, level: int, used: int) -> str:
        pad, pad_in = " " * (indent * level), " " * (indent * (level + 1))
        if _is_scalar(value):
            return _scalar(value)
        if isinstance(value, list):
            if not value:
                return "[]"
            if all(_is_scalar(v) for v in value):
                inline = "[" + ", ".join(_scalar(v) for v in value) + "]"
                if used + len(inline) <= width:
                    return inline
            rows = [pad_in + render(v, level + 1, len(pad_in)) for v in value]
            return "[\n" + ",\n".join(rows) + "\n" + pad + "]"
        if isinstance(value, dict):
            if not value:
                return "{}"
            keys = {k: json.dumps(k, ensure_ascii=False) for k in value}
            if all(_is_scalar(v) for v in value.values()):
                inline = "{" + ", ".join(f"{keys[k]}: {_scalar(v)}" for k, v in value.items()) + "}"
                if used + len(inline) <= width:
                    return inline
            rows = []
            for k, v in value.items():
                head = f"{pad_in}{keys[k]}: "
                rows.append(head + render(v, level + 1, len(head)))
            return "{\n" + ",\n".join(rows) + "\n" + pad + "}"
        raise TypeError(f"JSON으로 쓸 수 없는 값: {value!r}")

    return render(obj, 0, 0) + "\n"


def write_json(path: Path | str, obj: Any) -> None:
    Path(path).write_text(dumps(obj), encoding="utf-8")


def card_files(directory: Path | str) -> list[Path]:
    """폴더 바로 아래의 *.json (하위 폴더는 보지 않는다)."""
    return sorted(p for p in Path(directory).glob("*.json") if p.is_file())


# ---------- 결과 상태 ----------

def relative_pp(return_pct: float, bench_return_pct: float) -> float:
    """시장 대비(%p). 프로토타입 state.js처럼 소수 첫째 자리에서 반올림한다."""
    return round(return_pct - bench_return_pct, 1)


def result_state(rel_pp: float) -> str:
    if abs(rel_pp) <= EVEN_BAND_PP:
        return "even"
    return "ahead" if rel_pp > 0 else "behind"


def card_state(card: dict) -> str:
    outcome = card["reveal"]["outcome"]
    return result_state(relative_pp(outcome["returnPct"], outcome["benchReturnPct"]))


def triple_runs(states: list[str]) -> list[int]:
    """같은 상태가 3번 이어지는 구간의 시작 위치들(0부터)."""
    return [i for i in range(len(states) - 2) if states[i] == states[i + 1] == states[i + 2]]


# ---------- 문자열·날짜 ----------

def iter_strings(obj: Any, path: str) -> Iterator[tuple[str, str]]:
    """중첩 구조 안의 모든 문자열을 (경로, 값)으로. 경로 예: public.panels.then.notes[1].text"""
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for key, value in obj.items():
            yield from iter_strings(value, f"{path}.{key}")
    elif isinstance(obj, list):
        for i, value in enumerate(obj):
            yield from iter_strings(value, f"{path}[{i}]")


def dig(obj: Any, *keys: Any) -> Any:
    """구조가 깨져 있어도 예외 없이 값을 꺼낸다(없으면 None)."""
    for key in keys:
        if isinstance(obj, dict) and isinstance(key, str):
            obj = obj.get(key)
        elif isinstance(obj, list) and isinstance(key, int) and -len(obj) <= key < len(obj):
            obj = obj[key]
        else:
            return None
    return obj


def parse_date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def count_sentences(text: str) -> int:
    """문장 수. 마침표·물음표·느낌표 뒤 공백으로 나눈다(1.4배 같은 소수점은 나누지 않는다).
    마지막 조각이 문장부호로 끝나지 않으면 -1."""
    parts = [p for p in SENTENCE_SPLIT_RE.split(text.strip()) if p]
    if not parts or not all(p.endswith((".", "!", "?")) for p in parts):
        return -1
    return len(parts)
