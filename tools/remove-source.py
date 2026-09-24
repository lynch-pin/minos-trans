#!/usr/bin/env python3
"""특정 출처(source)에서 온 항목을 통째로 걷어낸다.

분류를 여기저기로 옮겨 놨어도 source 는 그대로 남으므로 한 번에 지울 수 있다.

    python3 tools/remove-source.py dialogue --dry-run   # 몇 개 지워질지 보기
    python3 tools/remove-source.py dialogue             # 실제로 지우기

지운 뒤에는 발음을 다시 만들 필요가 없다(남은 항목은 그대로다).
검사기만 돌려 확인하면 된다:

    python3 tools/validate.py
"""

import argparse
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "entries.json"


def main():
    parser = argparse.ArgumentParser(description="source 로 항목 걷어내기")
    parser.add_argument("source", help='지울 출처 이름 (예: dialogue)')
    parser.add_argument("--dry-run", action="store_true", help="지우지 않고 개수만 보기")
    args = parser.parse_args()

    entries = json.loads(DATA.read_text(encoding="utf-8"))
    hit = [e for e in entries if e.get("source") == args.source]

    if not hit:
        sources = sorted({e.get("source", "") for e in entries} - {""})
        print(f"source='{args.source}' 인 항목이 없습니다.")
        print(f"파일에 있는 출처: {', '.join(sources) if sources else '(없음)'}")
        return 1

    kept = [e for e in entries if e.get("source") != args.source]
    bases_before = {w["base"] for e in entries for w in e["words"]}
    bases_after = {w["base"] for e in kept for w in e["words"]}

    print(f"source='{args.source}' 항목 {len(hit)}개")
    print(f"  항목  {len(entries)} → {len(kept)}")
    print(f"  낱말  {len(bases_before)} → {len(bases_after)}")

    if args.dry_run:
        print("\n--dry-run 이라 파일은 그대로입니다.")
        return 0

    io.open(DATA, "w", encoding="utf-8").write(
        json.dumps(kept, ensure_ascii=False, indent=2) + "\n"
    )
    print("\n지웠습니다. python3 tools/validate.py 로 확인하세요.")
    print("tools/ipa.py 의 낱말 사전은 그대로 둡니다 — 남아 있어도 해가 없습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
