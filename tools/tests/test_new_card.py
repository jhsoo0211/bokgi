"""new_card.py: 새 uuid v4와 자리표시자를 가진 카드 뼈대. 스키마는 맞고, check_case는 자리표시자로 막는다."""
from __future__ import annotations

import re
import shutil
import uuid
from datetime import date

import cardlib
import check_case
import new_card
from schema_lite import Validator

UUID4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


def test_scaffold_is_schema_valid_and_fresh() -> None:
    a, b = new_card.scaffold(start=date(2024, 1, 15), horizon=90), new_card.scaffold()
    assert UUID4.match(a["id"]) and uuid.UUID(a["id"]).version == 4 and a["id"] != b["id"]
    assert a["status"] == "draft" and a["version"] == 1 and a["internal"]["example"] is False
    assert a["public"]["yearPublic"] == 2024 and a["reveal"]["outcome"]["endDate"] == "2024-04-14"
    assert Validator(cardlib.load_json(cardlib.SCHEMA_PATH)).errors(a) == []


def test_check_case_blocks_placeholders(tmp_path) -> None:
    content = tmp_path / "content"
    (content / "cards").mkdir(parents=True)
    shutil.copytree(cardlib.CONTENT_DIR / "schema", content / "schema")
    shutil.copy(cardlib.CONCEPTS_PATH, content / "concepts.json")
    cardlib.write_json(content / "cards" / "c001.json", new_card.scaffold(start=date(2024, 1, 15)))
    report = check_case.run([content / "cards"])
    assert not report.ok()
    assert "자리표시자" in {i.category for i in report.all_issues()}


def test_cli_writes_next_code_and_deck_order(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setattr(cardlib, "DRAFTS_DIR", tmp_path / "drafts")
    assert new_card.main(["--dir", str(tmp_path / "drafts"), "--start", "2024-01-15", "--sector", "반도체"]) == 0
    created = tmp_path / "drafts" / "c007.json"                     # content/cards에 c001~c006이 있다
    card = cardlib.load_json(created)
    assert card["deckOrder"] == 7 and card["public"]["sectorPublic"] == "반도체"
    assert "새 카드" in capsys.readouterr().out
    assert new_card.main(["--dir", str(tmp_path / "drafts"), "--code", "c007"]) == 1   # 덮어쓰지 않는다
