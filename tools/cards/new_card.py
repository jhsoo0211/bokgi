#!/usr/bin/env python3
"""새 카드 뼈대 만들기: 새 uuid v4, version 1, status draft, 자리표시자(TODO).

자리표시자가 남아 있으면 check_case.py가 '자리표시자' 오류로 막는다. 뼈대 자체는 스키마에 맞는다.
기본 저장 위치는 content/drafts/ (content/cards/는 검사를 통과한 카드만 둔다).

사용:
  python3 tools/cards/new_card.py --start 2024-01-15 --horizon 180 --sector 반도체 --size 대형
  python3 tools/cards/new_card.py --stdout
"""
from __future__ import annotations

import argparse
import re
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cardlib  # noqa: E402

CODE_RE = re.compile(r"^c(\d{3,})$")


def _existing(dirs: list[Path]) -> list[tuple[Path, dict]]:
    out = []
    for d in dirs:
        if d.is_dir():
            for f in cardlib.card_files(d):
                try:
                    out.append((f, cardlib.load_json(f)))
                except ValueError:
                    continue
    return out


def next_code(existing: list[tuple[Path, dict]]) -> str:
    numbers = [int(m.group(1)) for f, _ in existing if (m := CODE_RE.match(f.stem))]
    return f"c{(max(numbers) + 1 if numbers else 1):03d}"


def next_deck_order(existing: list[tuple[Path, dict]]) -> int:
    orders = [c.get("deckOrder") for _, c in existing if isinstance(c, dict) and isinstance(c.get("deckOrder"), int)]
    return max(orders) + 1 if orders else 1


def scaffold(*, start: date | None = None, horizon: int = 180, sector: str | None = None, size: str = "대형",
             difficulty: int = 2, deck_order: int = 1, card_id: str | None = None) -> dict:
    if horizon not in cardlib.HORIZONS:
        raise ValueError(f"horizon은 {cardlib.HORIZONS} 중 하나예요")
    start = start or date(2000, 1, 3)
    end = start + timedelta(days=horizon)
    flat = [100] * cardlib.INDEX_POINTS
    todo = "TODO"
    return {
        "id": card_id or str(uuid.uuid4()),
        "version": 1,
        "status": "draft",
        "deckOrder": deck_order,
        "public": {
            "yearPublic": start.year,
            "sectorPublic": sector or f"{todo} 업종",
            "sizeBucket": size,
            "horizonDays": horizon,
            "difficulty": difficulty,
            "panels": {
                "flow": {"index14": list(flat), "market14": list(flat), "volumeTrend": "유지", "windowDays": 180},
                "numbers": {
                    "growth": {"revYoy": todo, "opm": f"{todo} 직전 → 최근", "epsYoy": todo, "guidance": todo},
                    "valuation": {"per": todo, "perSector": todo, "pbr": todo, "psr": None},
                    "health": {"debtRatio": todo, "netCash": todo, "fcf": todo},
                    "asOfRelative": "판단일 D-1(공시 기준)",
                },
                "then": {
                    "rate": f"{todo} 기준금리",
                    "rateTrend": "동결",
                    "fxNote": None,
                    "commodityNote": None,
                    "notes": [{"when": "판단일 D-1",
                               "text": f"{todo} 「그때」 문장 — 상대 날짜만, 회사명·제품명·절대 날짜·판단일 이후 일 금지",
                               "sourceKind": "보도"}],
                },
            },
            "evidenceOptions": [
                {"id": "ev1", "label": f"{todo} 숫자 근거", "why": f"{todo} 왜 중요한지 한 문장.", "panel": "numbers"},
                {"id": "ev2", "label": f"{todo} 흐름 근거", "why": f"{todo} 왜 중요한지 한 문장.", "panel": "flow"},
                {"id": "ev3", "label": f"{todo} 그때 근거", "why": f"{todo} 왜 중요한지 한 문장.", "panel": "then"},
            ],
            "riskOptions": [{"id": "rk1", "label": f"{todo} 위험 1"}, {"id": "rk2", "label": f"{todo} 위험 2"}],
        },
        "reveal": {
            "outcome": {
                "companyName": f"{todo} 회사명",
                "ticker": f"{todo}_TICKER",
                "period": f"{todo} YYYY Qn → YYYY Qn",
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "returnPct": 0,
                "benchReturnPct": 0,
                "benchName": "S&P 500",
                "pricePath": list(flat),
                "benchPath": list(flat),
                "sources": [{"kind": "가격", "label": f"{todo} 파생 지수 원천 · 배당 재투자·분할 반영 여부", "url": None}],
            },
            "keyPoints": [f"{todo} 사후에 중요했던 것"],
            "learningPoints": [{"conceptId": "abs-vs-relative", "rank": 1,
                                "linkSentence": f"{todo} 이 사례와 개념을 잇는 한 문장."}],
        },
        "internal": {
            "notes": f"{todo} 제작 메모(자료 출처·검토일·수정 이유)",
            "leakTerms": [f"{todo} 회사명", f"{todo} 티커", f"{todo} 제품명"],
            "dataCutoff": start.isoformat(),
            "example": False,
        },
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="새 카드 뼈대(JSON)를 만든다.")
    p.add_argument("--dir", default=str(cardlib.DRAFTS_DIR), help="저장 폴더 (기본 content/drafts)")
    p.add_argument("--code", help="파일 이름(확장자 없이). 기본은 다음 cNNN")
    p.add_argument("--start", help="판단일 YYYY-MM-DD (연도·끝 날짜·자료 기준일을 여기서 채운다)")
    p.add_argument("--horizon", type=int, default=180, choices=cardlib.HORIZONS)
    p.add_argument("--sector")
    p.add_argument("--size", default="대형", choices=("소형", "중형", "대형"))
    p.add_argument("--difficulty", type=int, default=2, choices=range(1, 6))
    p.add_argument("--stdout", action="store_true", help="파일 대신 화면에 출력")
    a = p.parse_args(argv)

    target_dir = Path(a.dir)
    existing = _existing([cardlib.CARDS_DIR, cardlib.DRAFTS_DIR, target_dir])
    card = scaffold(start=cardlib.parse_date(a.start), horizon=a.horizon, sector=a.sector, size=a.size,
                    difficulty=a.difficulty, deck_order=next_deck_order(existing))
    if a.stdout:
        sys.stdout.write(cardlib.dumps(card))
        return 0
    code = a.code or next_code(existing)
    path = target_dir / f"{code}.json"
    if path.exists():
        print(f"이미 있는 파일이에요: {path}", file=sys.stderr)
        return 1
    target_dir.mkdir(parents=True, exist_ok=True)
    cardlib.write_json(path, card)
    print(f"새 카드: {path} (id {card['id']}, deckOrder {card['deckOrder']}, status draft)")
    print("다음: 세 판 채우기 → flow_index.py·outcome.py → mask.py → check_case.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
