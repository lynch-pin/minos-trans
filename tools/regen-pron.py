#!/usr/bin/env python3
"""tools/ipa.py 의 사전으로 data/entries.json 의 발음을 다시 만든다.

낱말을 사전에 더한 뒤 실행하면 문장 발음과 낱말 발음이 함께 갱신된다.
발음을 손으로 고치지 말고 항상 이걸 거쳐야 사전과 데이터가 어긋나지 않는다.

    python3 tools/regen-pron.py
"""

import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from ipa import WORDS, EXTRA  # noqa: E402

LEX = {**WORDS, **EXTRA}
DATA = ROOT / "data" / "entries.json"

GREEK = r"A-Za-zͰ-Ͽἀ-῿"


def tokens(text):
    """하이픈으로 이어진 낱말은 한 덩어리로 둔다.

    check-out 처럼 라틴 문자로 그대로 쓰는 외래어도 잡아내도록 A-Za-z 를
    그리스 문자 범위와 함께 둔다.
    """
    return re.findall(rf"[{GREEK}]+(?:-[{GREEK}]+)*", text)


def main():
    entries = json.loads(DATA.read_text(encoding="utf-8"))
    unknown = set()

    for entry in entries:
        ipa_parts, ko_parts = [], []
        for token in tokens(entry["el"]):
            hit = LEX.get(token.lower())
            if hit is None:
                unknown.add(token)
                ipa_parts.append("?")
                ko_parts.append("?")
            else:
                ipa_parts.append(hit[0])
                ko_parts.append(hit[1])
        entry["ipa"] = " ".join(ipa_parts)
        entry["ko_pron"] = " ".join(ko_parts)

        for word in entry["words"]:
            hit = LEX.get(word["surface"].lower())
            word["ipa"] = hit[0] if hit else ""

    io.open(DATA, "w", encoding="utf-8").write(
        json.dumps(entries, ensure_ascii=False, indent=2) + "\n"
    )

    if unknown:
        print("사전에 없는 낱말 — tools/ipa.py 에 더해 주세요:")
        for token in sorted(unknown):
            print(f"  {token}")
        return 1

    print(f"OK  {len(entries)}개 항목의 발음을 다시 만들었습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
