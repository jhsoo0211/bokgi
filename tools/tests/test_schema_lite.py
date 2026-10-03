"""schema_lite.py: draft 2020-12 부분 구현이 쓰는 키워드를 바르게 검사하는지, 모르는 키워드는 거절하는지."""
from __future__ import annotations

import copy

import pytest

import cardlib
from schema_lite import SchemaError, Validator


def errors(schema: dict, value) -> list[str]:
    return [m for _, m in Validator(schema).errors(value)]


def test_types_and_integer_semantics() -> None:
    assert errors({"type": "integer"}, 3) == []
    assert errors({"type": "integer"}, 3.0) == []                     # JSON Schema: 3.0도 정수
    assert errors({"type": "integer"}, True) != []                    # 참/거짓은 수가 아니다
    assert errors({"type": "number"}, 1) == []
    assert errors({"type": ["string", "null"]}, None) == []
    assert "문자열 형식이어야 해요" in errors({"type": "string"}, 1)[0]


def test_object_keywords() -> None:
    schema = {"type": "object", "required": ["a"], "additionalProperties": False,
              "properties": {"a": {"enum": [1, 2]}, "b": {"const": "x"}}}
    assert errors(schema, {"a": 1, "b": "x"}) == []
    msgs = errors(schema, {"b": "y", "c": 0})
    assert any("필수 항목이 없어요: a" in m for m in msgs)
    assert any("스키마에 없는 항목이에요: c" in m for m in msgs)
    assert any("값이 맞지 않아요" in m for m in msgs)


def test_prefix_items_and_items() -> None:
    schema = {"type": "array", "minItems": 3, "maxItems": 3, "prefixItems": [{"const": 100}],
              "items": {"type": "number", "exclusiveMinimum": 0}}
    assert errors(schema, [100, 1, 2]) == []
    assert errors(schema, [100.0, 1, 2]) == []
    assert errors(schema, [99, 1, 2]) != []
    assert errors(schema, [100, 0, 2]) != []
    assert errors(schema, [100, 1]) != []


def test_strings_numbers_unique() -> None:
    assert errors({"type": "string", "pattern": "^판단일 D-[0-9]+$"}, "판단일 D-12") == []
    assert errors({"type": "string", "pattern": "^판단일 D-[0-9]+$"}, "판단일 D+12") != []
    assert errors({"type": "string", "maxLength": 3}, "가나다라") != []
    assert errors({"type": "number", "minimum": 1, "maximum": 5}, 6) != []
    assert errors({"type": "array", "uniqueItems": True}, [1, 1.0]) != []


def test_ref_if_then_and_combinators() -> None:
    schema = {"$defs": {"pos": {"type": "number", "exclusiveMinimum": 0}},
              "type": "object",
              "properties": {"n": {"$ref": "#/$defs/pos"}, "flag": {"type": "boolean"}, "note": {"type": "string"}},
              "if": {"required": ["flag"], "properties": {"flag": {"const": True}}},
              "then": {"properties": {"note": {"pattern": "^예시"}}}}
    assert errors(schema, {"n": 1, "flag": True, "note": "예시 메모"}) == []
    assert errors(schema, {"n": 1, "flag": False, "note": "메모"}) == []
    assert errors(schema, {"n": 1, "flag": True, "note": "메모"}) != []
    assert errors(schema, {"n": -1}) != []
    assert errors({"anyOf": [{"type": "string"}, {"type": "null"}]}, 1) != []
    assert errors({"oneOf": [{"type": "number"}, {"type": "integer"}]}, 1) != []   # 둘 다 맞으면 실패
    assert errors({"not": {"type": "string"}}, "x") != []


def test_unknown_keyword_is_refused() -> None:
    with pytest.raises(SchemaError):
        Validator({"type": "object", "propertyNames": {"pattern": "^a"}})


def test_card_schema_accepts_repo_cards_and_rejects_extra_public_key() -> None:
    validator = Validator(cardlib.load_json(cardlib.SCHEMA_PATH))
    for f in cardlib.card_files(cardlib.CARDS_DIR):
        card = cardlib.load_json(f)
        assert validator.errors(card) == [], f.name
        broken = copy.deepcopy(card)
        broken["public"]["companyName"] = card["reveal"]["outcome"]["companyName"]
        assert validator.errors(broken) != []


def test_agrees_with_jsonschema_package_when_installed() -> None:
    jsonschema = pytest.importorskip("jsonschema")
    schema = cardlib.load_json(cardlib.SCHEMA_PATH)
    jsonschema.Draft202012Validator.check_schema(schema)
    reference = jsonschema.Draft202012Validator(schema)
    mine = Validator(schema)
    for f in cardlib.card_files(cardlib.CARDS_DIR):
        card = cardlib.load_json(f)
        variants = [card]
        for mutate in (lambda c: c["public"].__setitem__("horizonDays", 120),
                       lambda c: c["public"]["panels"]["flow"]["index14"].__setitem__(0, 99),
                       lambda c: c["internal"].__setitem__("notes", "메모"),
                       lambda c: c.__setitem__("id", "not-a-uuid")):
            v = copy.deepcopy(card)
            mutate(v)
            variants.append(v)
        for v in variants:
            assert reference.is_valid(v) == mine.is_valid(v)
