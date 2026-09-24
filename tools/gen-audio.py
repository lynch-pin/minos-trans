#!/usr/bin/env python3
"""data/entries.json 에 쓰인 모든 그리스어 텍스트의 발음 오디오를 미리 만든다.

이 사이트는 서버가 없어서 발음 듣기가 브라우저 내장 음성 합성(Web Speech
API)에 기대 왔는데, 기기에 그리스어 음성이 없으면 듣기 버튼 자체가 사라지는
문제가 있었다. 그래서 이제 espeak-ng 로 미리 mp3 를 만들어 data/audio/ 에
넣어 두고, 기기에 더 나은 그리스어 음성이 있으면 그걸 우선 쓰되 없으면 이
파일로 대체한다 (js/speech.js 참고). 번역과 발음(IPA)을 제작 시점에 미리
만들어 두는 이 사이트의 방식과 같은 원리다.

    sudo apt-get install -y espeak-ng lame   # 최초 1회
    python3 tools/gen-audio.py

이미 만들어진 파일은 다시 만들지 않는다 — 새 항목을 추가한 뒤에만 돌리면
새로 필요한 클립만 생성된다. 문장을 고쳐서 텍스트가 달라지면(오탈자 수정 등)
파일명이 텍스트의 해시라서 자동으로 새 파일이 생기고, 옛 파일은 안 쓰이게
된다 — 가끔 `git clean` 삼아 data/audio/ 를 통째로 지우고 다시 돌리면 안 쓰는
파일이 정리된다.
"""

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "entries.json"
AUDIO_DIR = ROOT / "data" / "audio"
MANIFEST = AUDIO_DIR / "manifest.json"

VOICE = "el"
SPEED = 165  # espeak-ng 기본(175)보다 살짝 느리게. 느리게 듣기는 재생 속도로 따로 조절한다.
BITRATE = 32  # kbps, mono — 말소리만 담으므로 이 정도로 충분하고 용량이 작다.


def collect_texts(entries):
    """entries.json 안에서 발음 버튼이 실제로 읽어 주는 모든 텍스트를 모은다.

    js/render.js 의 speakButton() 호출 지점과 반드시 맞춰야 한다:
    entry.el, 각 word.surface, 단어장의 word.base, 각 example.el,
    equivalent.el.
    """
    texts = set()
    for entry in entries:
        if entry.get("el"):
            texts.add(entry["el"])
        for word in entry.get("words", []):
            if word.get("surface"):
                texts.add(word["surface"])
            if word.get("base"):
                texts.add(word["base"])
        for example in entry.get("examples", []):
            if example.get("el"):
                texts.add(example["el"])
        equivalent = entry.get("equivalent") or {}
        if equivalent.get("el"):
            texts.add(equivalent["el"])
    return texts


def clip_id(text):
    return hashlib.md5(text.encode("utf-8")).hexdigest()[:16]


def synthesize(text, out_mp3, tmp_wav):
    subprocess.run(
        ["espeak-ng", "-v", VOICE, "-s", str(SPEED), "-w", str(tmp_wav), text],
        check=True, capture_output=True,
    )
    subprocess.run(
        ["lame", "-b", str(BITRATE), "-m", "m", "-q", "2", "--silent", str(tmp_wav), str(out_mp3)],
        check=True, capture_output=True,
    )


def main():
    for tool in ("espeak-ng", "lame"):
        if subprocess.run(["which", tool], capture_output=True).returncode != 0:
            print(f"FAIL  '{tool}' 이 설치되어 있지 않습니다. (apt-get install -y espeak-ng lame)")
            return 1

    entries = json.loads(DATA.read_text(encoding="utf-8"))
    texts = collect_texts(entries)

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}
    if MANIFEST.exists():
        try:
            manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = {}

    created, reused = 0, 0
    with tempfile.TemporaryDirectory() as tmp:
        tmp_wav = Path(tmp) / "clip.wav"
        for text in sorted(texts):
            cid = clip_id(text)
            filename = f"{cid}.mp3"
            out_path = AUDIO_DIR / filename
            manifest[text] = filename
            if out_path.exists():
                reused += 1
                continue
            try:
                synthesize(text, out_path, tmp_wav)
            except subprocess.CalledProcessError as exc:
                print(f"FAIL  '{text}' 오디오 생성 실패: {exc.stderr.decode('utf-8', 'replace')}")
                return 1
            created += 1

    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    total_bytes = sum(f.stat().st_size for f in AUDIO_DIR.glob("*.mp3"))
    print(
        f"OK  클립 {len(texts)}개 (새로 생성 {created}, 재사용 {reused}) · "
        f"data/audio/ 총 {total_bytes / 1024:.0f}KB"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
