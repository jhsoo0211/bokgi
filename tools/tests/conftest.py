"""tools/tests 공용 준비: tools/cards를 import 경로에 넣고, content/ 사본을 만드는 fixture."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path
from typing import Callable

import pytest

CARDS_TOOLS = Path(__file__).resolve().parents[1] / "cards"
if str(CARDS_TOOLS) not in sys.path:
    sys.path.insert(0, str(CARDS_TOOLS))

import cardlib  # noqa: E402


@pytest.fixture
def content_copy(tmp_path: Path) -> Path:
    """content/(카드·스키마·개념)를 임시 폴더에 복사한다. 시험은 사본만 고친다."""
    dst = tmp_path / "content"
    shutil.copytree(cardlib.CONTENT_DIR, dst, ignore=shutil.ignore_patterns("drafts"))
    return dst


@pytest.fixture
def edit_card(content_copy: Path) -> Callable[[str, Callable[[dict], object]], dict]:
    """edit_card("c001", lambda c: ...) — 사본의 카드를 고쳐 같은 서식으로 다시 쓴다."""

    def _edit(code: str, mutate: Callable[[dict], object]) -> dict:
        path = content_copy / "cards" / f"{code}.json"
        card = cardlib.load_json(path)
        mutate(card)
        cardlib.write_json(path, card)
        return card

    return _edit
