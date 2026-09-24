#!/usr/bin/env python3
"""data/entries.json 을 검사한다.

이 파일 하나가 사이트의 모든 내용이라, 깨지면 사이트가 통째로 빈다.
항목을 추가한 뒤에는 반드시 돌려 본다:

    python3 tools/validate.py

CI 도 같은 스크립트를 쓴다. 규칙이 두 군데로 갈라지지 않게 하기 위함이다.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "entries.json"
AUDIO_MANIFEST = ROOT / "data" / "audio" / "manifest.json"

REQUIRED = [
    "id", "added", "kind", "category", "source", "ko", "romanization",
    "el", "literal_el", "meaning", "ipa", "ko_pron", "words", "notes",
    "examples", "equivalent", "tags",
]
WORD_KEYS = ["surface", "base", "pos", "ipa", "meaning", "note"]
EQUIV_KEYS = ["el", "literal", "note"]
KINDS = {"phrase", "word"}

# 이미 쓰고 있는 분류. 새로 만들어도 되지만 경고를 띄워 오타를 걸러 낸다.
# source 는 그 항목이 어디서 왔는지 남긴다. 분류를 옮겨도 출처는 남으므로
# 나중에 특정 출처만 통째로 걷어낼 수 있다. 직접 쓴 것은 "" 로 둔다.
KNOWN_SOURCES = {"", "operators"}

KNOWN_CATEGORIES = {
    "인사", "소개", "언어·소통", "예의", "카페·식당", "쇼핑", "길·교통",
    "약속·시간", "감정·반응", "건강·곤란", "스몰토크", "숙소·생활", "자연·풍경", "기타",
}

errors = []
warnings = []


def fail(entry_id, message):
    errors.append(f"{entry_id}: {message}")


def warn(entry_id, message):
    warnings.append(f"{entry_id}: {message}")


def main():
    try:
        entries = json.loads(DATA.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"FAIL  entries.json 의 JSON 문법이 깨졌습니다: {exc}")
        return 1

    if not isinstance(entries, list):
        print("FAIL  최상위가 배열이 아닙니다.")
        return 1

    audio_manifest = None
    if AUDIO_MANIFEST.exists():
        try:
            audio_manifest = json.loads(AUDIO_MANIFEST.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            audio_manifest = None

    seen_ids = set()

    for index, entry in enumerate(entries):
        eid = entry.get("id", f"[{index}번째 항목]")

        if not isinstance(entry, dict):
            fail(eid, "항목이 객체가 아닙니다.")
            continue

        missing = [k for k in REQUIRED if k not in entry]
        if missing:
            fail(eid, f"필수 키 누락: {', '.join(missing)}")
            continue

        if entry["id"] in seen_ids:
            fail(eid, "id 가 중복입니다.")
        seen_ids.add(entry["id"])

        if not re.fullmatch(r"[a-z0-9-]+", entry["id"]):
            fail(eid, "id 는 소문자·숫자·하이픈만 씁니다.")

        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", entry["added"]):
            fail(eid, f"added 는 YYYY-MM-DD 여야 합니다: {entry['added']!r}")

        if entry["kind"] not in KINDS:
            fail(eid, f"kind 는 {' 또는 '.join(sorted(KINDS))} 여야 합니다: {entry['kind']!r}")

        for key in ("ko", "el", "meaning", "category", "ipa", "ko_pron"):
            if not str(entry[key]).strip():
                fail(eid, f"{key} 가 비어 있습니다.")

        if "?" in entry["ipa"] or "?" in entry["ko_pron"]:
            fail(eid, "발음에 '?' 가 남아 있습니다. tools/ipa.py 의 사전에 낱말을 더하세요.")

        if entry["el"].strip() and not re.search(r"[άέήίόύώΆΈΉΊΌΎΏϊϋΐΰ]", entry["el"]):
            warn(eid, "el 에 강세 부호(τόνος)가 하나도 없습니다 — 한 음절짜리 낱말만 있는 게 아니라면 확인하세요.")

        if entry["source"] not in KNOWN_SOURCES:
            warn(eid, f"처음 보는 source '{entry['source']}' — 오타가 아니면 그대로 두어도 됩니다.")

        if entry["category"] not in KNOWN_CATEGORIES:
            warn(eid, f"새 분류 '{entry['category']}' — 오타가 아니면 그대로 두어도 됩니다.")

        if audio_manifest is not None and entry["el"] not in audio_manifest:
            warn(eid, "el 문장의 발음 오디오가 아직 없습니다. python3 tools/gen-audio.py 를 돌려 주세요.")

        if not isinstance(entry["words"], list) or not entry["words"]:
            fail(eid, "words 가 비어 있습니다. el 에 쓰인 낱말을 적어야 합니다.")
        else:
            for word in entry["words"]:
                if not isinstance(word, dict):
                    fail(eid, "words 항목이 객체가 아닙니다.")
                    continue
                wmissing = [k for k in WORD_KEYS if k not in word]
                if wmissing:
                    fail(eid, f"낱말 {word.get('surface', '?')!r} 에 키 누락: {', '.join(wmissing)}")
                    continue
                for key in ("surface", "base", "pos", "ipa", "meaning"):
                    if not str(word[key]).strip():
                        fail(eid, f"낱말 {word.get('surface', '?')!r} 의 {key} 가 비어 있습니다.")

        for key in ("notes", "examples", "tags"):
            if not isinstance(entry[key], list):
                fail(eid, f"{key} 는 배열이어야 합니다.")

        for example in entry["examples"]:
            if not isinstance(example, dict) or "el" not in example or "ko" not in example:
                fail(eid, "examples 항목에는 el 과 ko 가 모두 있어야 합니다.")

        equivalent = entry["equivalent"]
        if not isinstance(equivalent, dict) or [k for k in EQUIV_KEYS if k not in equivalent]:
            fail(eid, f"equivalent 에는 {', '.join(EQUIV_KEYS)} 가 모두 있어야 합니다.")

    phrases = sum(1 for e in entries if isinstance(e, dict) and e.get("kind") == "phrase")
    bases = {
        w["base"]
        for e in entries
        if isinstance(e, dict)
        for w in e.get("words", [])
        if isinstance(w, dict) and w.get("base")
    }
    categories = {e["category"] for e in entries if isinstance(e, dict) and e.get("category")}

    for message in warnings:
        print(f"경고  {message}")
    for message in errors:
        print(f"오류  {message}")

    if errors:
        print(f"\nFAIL  오류 {len(errors)}건. 고친 뒤 다시 돌려 주세요.")
        return 1

    print(f"OK  항목 {len(entries)}개 (문장 {phrases}) · 낱말 {len(bases)}개 · 분류 {len(categories)}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
