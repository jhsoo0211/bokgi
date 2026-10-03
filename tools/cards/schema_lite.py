"""JSON Schema draft 2020-12의 부분 구현(표준 라이브러리만).

content/schema/*.json이 쓰는 키워드만 지원한다. 모르는 키워드를 만나면 조용히 넘어가지 않고
SchemaError를 낸다 — 검사하지 않은 규칙을 통과로 착각하지 않기 위해서다.
`format`은 2020-12 기본값대로 주석으로만 다룬다(날짜·uuid는 스키마에서 pattern으로 검사).
jsonschema 패키지가 있으면 tools/tests에서 결과가 같은지 교차 확인한다.
"""
from __future__ import annotations

import re
from typing import Any

ANNOTATIONS = frozenset({
    "$schema", "$id", "$comment", "$defs", "title", "description", "examples", "default",
    "format", "deprecated", "readOnly", "writeOnly",
})
ASSERTIONS = frozenset({
    "$ref", "type", "enum", "const",
    "properties", "required", "additionalProperties",
    "items", "prefixItems", "minItems", "maxItems", "uniqueItems",
    "minLength", "maxLength", "pattern",
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
    "allOf", "anyOf", "oneOf", "not", "if", "then", "else",
})
TYPE_KO = {"string": "문자열", "number": "숫자", "integer": "정수", "boolean": "참/거짓",
           "null": "null", "array": "배열", "object": "객체"}


class SchemaError(ValueError):
    """스키마 자체가 이 구현으로 검사할 수 없는 형태일 때."""


def json_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    raise SchemaError(f"JSON 값이 아니에요: {value!r}")


def _is_type(value: Any, name: str) -> bool:
    actual = json_type(value)
    if name == "number":
        return actual in ("integer", "number")
    if name == "integer":
        return actual == "integer" or (actual == "number" and float(value).is_integer())
    if name not in TYPE_KO:
        raise SchemaError(f"모르는 type: {name}")
    return actual == name


def json_equal(a: Any, b: Any) -> bool:
    """JSON 같음: 1과 1.0은 같고, true와 1은 다르다."""
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(json_equal(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(json_equal(a[k], b[k]) for k in a)
    return type(a) is type(b) and a == b


def _show(value: Any) -> str:
    text = repr(value) if isinstance(value, str) else str(value).replace("None", "null")
    return text if len(text) <= 60 else text[:57] + "..."


def _check_keywords(schema: Any, where: str) -> None:
    if isinstance(schema, bool):
        return
    if not isinstance(schema, dict):
        raise SchemaError(f"{where}: 스키마는 객체나 true/false여야 해요")
    unknown = set(schema) - ANNOTATIONS - ASSERTIONS
    if unknown:
        raise SchemaError(f"{where}: 지원하지 않는 키워드 {sorted(unknown)}")
    for key in ("properties", "$defs"):
        for name, sub in schema.get(key, {}).items():
            _check_keywords(sub, f"{where}/{key}/{name}")
    for key in ("items", "additionalProperties", "not", "if", "then", "else"):
        if key in schema:
            _check_keywords(schema[key], f"{where}/{key}")
    for key in ("prefixItems", "allOf", "anyOf", "oneOf"):
        for i, sub in enumerate(schema.get(key, [])):
            _check_keywords(sub, f"{where}/{key}/{i}")


class Validator:
    def __init__(self, schema: dict) -> None:
        _check_keywords(schema, "#")
        self.schema = schema
        self._regex: dict[str, re.Pattern[str]] = {}

    def errors(self, instance: Any) -> list[tuple[str, str]]:
        """(경로, 한국어 메시지) 목록. 비어 있으면 통과. 경로의 뿌리는 `$`."""
        out: list[tuple[str, str]] = []
        self._validate(instance, self.schema, "$", out)
        return out

    def is_valid(self, instance: Any) -> bool:
        return not self.errors(instance)

    # ----- 내부 -----

    def _resolve(self, ref: str) -> Any:
        if not ref.startswith("#"):
            raise SchemaError(f"바깥 $ref는 지원하지 않아요: {ref}")
        node: Any = self.schema
        for part in [p for p in ref[1:].split("/") if p]:
            part = part.replace("~1", "/").replace("~0", "~")
            if not isinstance(node, dict) or part not in node:
                raise SchemaError(f"$ref를 찾을 수 없어요: {ref}")
            node = node[part]
        return node

    def _pattern(self, pattern: str) -> re.Pattern[str]:
        if pattern not in self._regex:
            self._regex[pattern] = re.compile(pattern)
        return self._regex[pattern]

    def _validate(self, inst: Any, schema: Any, path: str, out: list[tuple[str, str]]) -> None:
        if schema is True:
            return
        if schema is False:
            out.append((path, "이 자리에는 값이 올 수 없어요"))
            return
        if "$ref" in schema:
            self._validate(inst, self._resolve(schema["$ref"]), path, out)

        if "type" in schema:
            names = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
            if not any(_is_type(inst, n) for n in names):
                want = " 또는 ".join(TYPE_KO[n] for n in names)
                out.append((path, f"{want} 형식이어야 해요 (지금: {TYPE_KO[json_type(inst)]})"))
                return
        if "const" in schema and not json_equal(inst, schema["const"]):
            out.append((path, f"값이 맞지 않아요 — 필요: {_show(schema['const'])}, 지금: {_show(inst)}"))
        if "enum" in schema and not any(json_equal(inst, e) for e in schema["enum"]):
            allowed = ", ".join(_show(e) for e in schema["enum"])
            out.append((path, f"허용되지 않은 값이에요 — 지금: {_show(inst)}, 허용: {allowed}"))

        kind = json_type(inst)
        if kind == "string":
            self._string(inst, schema, path, out)
        elif kind in ("integer", "number"):
            self._number(inst, schema, path, out)
        elif kind == "array":
            self._array(inst, schema, path, out)
        elif kind == "object":
            self._object(inst, schema, path, out)

        for sub in schema.get("allOf", []):
            self._validate(inst, sub, path, out)
        if "anyOf" in schema and not any(self._passes(inst, s, path) for s in schema["anyOf"]):
            out.append((path, "허용된 형태 중 어느 것과도 맞지 않아요"))
        if "oneOf" in schema:
            hits = sum(self._passes(inst, s, path) for s in schema["oneOf"])
            if hits != 1:
                out.append((path, f"허용된 형태 중 정확히 하나와 맞아야 해요 (맞은 수: {hits})"))
        if "not" in schema and self._passes(inst, schema["not"], path):
            out.append((path, "허용되지 않은 형태예요"))
        if "if" in schema:
            branch = "then" if self._passes(inst, schema["if"], path) else "else"
            if branch in schema:
                self._validate(inst, schema[branch], path, out)

    def _passes(self, inst: Any, schema: Any, path: str) -> bool:
        scratch: list[tuple[str, str]] = []
        self._validate(inst, schema, path, scratch)
        return not scratch

    def _string(self, inst: str, schema: dict, path: str, out: list[tuple[str, str]]) -> None:
        if "minLength" in schema and len(inst) < schema["minLength"]:
            out.append((path, f"글자가 모자라요 — 최소 {schema['minLength']}자, 지금 {len(inst)}자"))
        if "maxLength" in schema and len(inst) > schema["maxLength"]:
            out.append((path, f"글자가 너무 길어요 — 최대 {schema['maxLength']}자, 지금 {len(inst)}자"))
        if "pattern" in schema and not self._pattern(schema["pattern"]).search(inst):
            out.append((path, f"형식이 맞지 않아요 — 패턴 {schema['pattern']}, 지금: {_show(inst)}"))

    def _number(self, inst: float, schema: dict, path: str, out: list[tuple[str, str]]) -> None:
        if "minimum" in schema and inst < schema["minimum"]:
            out.append((path, f"값이 너무 작아요 — 최소 {schema['minimum']}, 지금 {inst}"))
        if "maximum" in schema and inst > schema["maximum"]:
            out.append((path, f"값이 너무 커요 — 최대 {schema['maximum']}, 지금 {inst}"))
        if "exclusiveMinimum" in schema and inst <= schema["exclusiveMinimum"]:
            out.append((path, f"값이 {schema['exclusiveMinimum']}보다 커야 해요 — 지금 {inst}"))
        if "exclusiveMaximum" in schema and inst >= schema["exclusiveMaximum"]:
            out.append((path, f"값이 {schema['exclusiveMaximum']}보다 작아야 해요 — 지금 {inst}"))

    def _array(self, inst: list, schema: dict, path: str, out: list[tuple[str, str]]) -> None:
        if "minItems" in schema and len(inst) < schema["minItems"]:
            out.append((path, f"항목 수가 모자라요 — 최소 {schema['minItems']}개, 지금 {len(inst)}개"))
        if "maxItems" in schema and len(inst) > schema["maxItems"]:
            out.append((path, f"항목 수가 너무 많아요 — 최대 {schema['maxItems']}개, 지금 {len(inst)}개"))
        if schema.get("uniqueItems"):
            for i, a in enumerate(inst):
                if any(json_equal(a, b) for b in inst[:i]):
                    out.append((f"{path}[{i}]", f"같은 값이 두 번 이상 있어요: {_show(a)}"))
        prefix = schema.get("prefixItems", [])
        for i, sub in enumerate(prefix[: len(inst)]):
            self._validate(inst[i], sub, f"{path}[{i}]", out)
        if "items" in schema:
            for i in range(len(prefix), len(inst)):
                self._validate(inst[i], schema["items"], f"{path}[{i}]", out)

    def _object(self, inst: dict, schema: dict, path: str, out: list[tuple[str, str]]) -> None:
        for key in schema.get("required", []):
            if key not in inst:
                out.append((path, f"필수 항목이 없어요: {key}"))
        props = schema.get("properties", {})
        for key, value in inst.items():
            child = f"{path}.{key}"
            if key in props:
                self._validate(value, props[key], child, out)
            elif "additionalProperties" in schema:
                extra = schema["additionalProperties"]
                if extra is False:
                    out.append((path, f"스키마에 없는 항목이에요: {key}"))
                else:
                    self._validate(value, extra, child, out)
