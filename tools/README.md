# 카드 도구 (`tools/cards`)

복기 카드 JSON을 만들고 검사하는 오프라인 도구. Python 3.10+ 표준 라이브러리만 쓰고 네트워크를 쓰지 않는다. 시험은 pytest.
카드 형식의 정본은 `content/schema/card.schema.json`, 개념 트리는 `content/concepts.json`이다. 시드(패키지 A)는 이 둘을 읽는다.

## 명령

저장소 뿌리(`bokgi/`)에서:

```sh
python3 -m pytest tools/tests -q                       # 도구 시험 전체
python3 tools/cards/check_case.py content/cards         # 체크리스트 자동 검사 (실패 시 종료 코드 1)
python3 tools/cards/check_case.py content/cards --strict   # 경고도 실패로

python3 tools/cards/new_card.py --start 2024-01-15 --horizon 180 --sector 반도체 --size 대형   # → content/drafts/c007.json
python3 tools/cards/flow_index.py --stock s.csv --market m.csv --judgment-date 2024-01-15 --window-days 180
python3 tools/cards/outcome.py --stock s.csv --bench m.csv --start 2024-01-15 --end 2024-07-15 \
    --dividends div.csv --splits splits.csv [--bench-dividends bdiv.csv]
python3 tools/cards/mask.py content/drafts/c007.json [--write | --out 파일]
python3 tools/cards/pick_case.py content/cards [--write]
```

CSV 형식: 종가 `date,close[,volume]` · 배당 `ex_date,amount`(그날 기준 1주당) · 분할 `date,ratio`(4대1 = 4).
연구 저장소의 가격 자료는 계산 입력으로만 쓴다. 카드에는 파생값(14점 지수·수익률)만 남는다(ADR-0003).

## 파일

| 파일 | 하는 일 |
|---|---|
| `check_case.py` | 카드 폴더 검사: 스키마 + 아래 체크리스트, 한국어 보고 |
| `mask.py` | public 초안에서 누수 단어(→ `이 회사`·`[가림]`)와 절대 날짜(→ `판단일 D-n`)를 지우고 보고. 결과 수치는 사람에게 넘김(종료 코드 1) |
| `flow_index.py` | 판단일까지의 종가 → 흐름 판 `index14`·`market14`·`volumeTrend`·`windowDays` |
| `outcome.py` | 총수익(배당 재투자·분할 반영) 수익률, 시장 대비 %p, ±1%p 세 상태, 결과 경로 14점 |
| `pick_case.py` | live 카드의 `deckOrder`: 결과 상태 3연속 금지, 카드 id 해시로 섞은 결정적 순서 |
| `new_card.py` | 새 uuid v4 뼈대(status draft, 자리표시자 `TODO`) |
| `leakscan.py` | 누수 규칙(check_case·mask 공용) |
| `schema_lite.py` | JSON Schema 2020-12 부분 검증기(쓰는 키워드만, 모르는 키워드는 거절) |
| `cardlib.py` | 경로·JSON 서식·결과 상태 공용 함수 |

## 카드 형식 요약

최상위는 `id`(uuid v4) · `version` · `status`(draft/reviewed/live) · `deckOrder`와 세 구획뿐이다.

- `public` = 계약 `PublicCase`에서 `id`·`version`을 뺀 것(camelCase, 모르는 키 금지). 연도·업종·규모만 보이고 회사명·티커·제품명·절대 날짜·결과 수치는 없다.
- `reveal` = `outcome`(계약 `Outcome`과 같은 모양) + `keyPoints`(≤3) + `learningPoints`(1~2개, rank 1이 공개 화면 개념).
- `internal` = `notes` · `leakTerms`(누수 사전) · `dataCutoff`(≤ 판단일) · `example`. 예시 카드는 `notes`가 `예시 자료(실측 아님)`으로 시작한다.

## 체크리스트(`check_case.py`)

카드마다
1. 스키마(필드·형식·개수, 판단 기간 90/180/365, 지수 14점·첫 값 100).
2. public 누수 0건: `leakTerms`+회사명+티커(한글은 띄어쓰기 무시, 티커는 대소문자 구분·영숫자 경계), 절대 날짜(YYYY-MM-DD, YYYY년 M월, M월 D일, MM/DD/YYYY, 영문 월 이름, 연도+분기), 결과 수치(`returnPct`·`benchReturnPct`·시장 대비 %p를 글로 쓴 것), `D+n`.
3. 결과 경로 끝값 = 100 + 수익률, 흐름 판 ≠ 결과 경로.
4. 날짜: `endDate − startDate` ≈ `horizonDays`(±7일), `yearPublic` = 판단일 연도, `period`(YYYY Qn → YYYY Qn)와 날짜 일치.
5. 공시 시점: `dataCutoff` ≤ 판단일, public의 모든 `판단일 D-n`은 기준일 이전.
6. 근거·위험 칩 id·이름 중복 없음, 학습 포인트 개념이 `concepts.json`에 있음, rank 1부터.
7. 출처: kind `가격`(파생 지수 원천) 필수, 그 label에 배당·분할 반영 여부, 예시 카드는 kind `예시`도.

덱 전체: 카드 id 중복 없음, live 카드끼리 `deckOrder` 중복 없음, 같은 결과 상태 3연속 없음.
경고(실패 아님, `--strict`면 실패): 연도·달·분기만 적은 표기, 사전에 없는 대문자 토큰·영문 고유명사, ±1%p 경계에 붙은 결과, 소식 순서.

개념 파일: 스키마, 설명 정확히 세 문장, 정답 번호 범위, 개념·퀴즈 id 중복.

## 관례

- **지수 기준점**: 흐름 판은 창의 첫 날 = 100(프로토타입 '처음 = 100'), 결과 경로는 판단일 = 100이고 끝값이 100 + 수익률. 기획 문서의 '판단 시점 100 기준'으로 보고 싶으면 `flow_index.py --anchor judgment`(분석용, 카드에는 못 넣음).
- **수익률**: 총수익(배당 재투자·분할 반영), 소수 첫째 자리. 시장 대비 %p도 소수 첫째 자리에서 반올림한 뒤 ±1.0 이내면 비슷함(프로토타입 `state.js`와 같다). 시장도 총수익 지수로 맞춘다.
- **상대 날짜**: `판단일 D-12`. 소식은 오래된 것부터. 출처는 종류(공시·보도·통계)만, 원문 위치는 공개 쪽 `sources`에.
- **결과 수치 오탐**: public의 숫자가 우연히 결과 수치와 같으면(예: PER 26.5와 시장 수익률 26.5%) 걸린다. 반올림을 바꿔 피한다.
- **파일 위치**: 작업 중 카드는 `content/drafts/`, 검사를 통과한 카드만 `content/cards/`. 파일 이름은 `cNNN.json`(티커·날짜를 넣지 않는다).

## 제작 흐름

`new_card.py` → 세 판 채우기(`flow_index.py`·공시 숫자·「그때」 문장) → `outcome.py`로 reveal → `mask.py` → `check_case.py` → status `live`로 `content/cards/`에 옮김 → `pick_case.py --write` → `check_case.py content/cards`.
