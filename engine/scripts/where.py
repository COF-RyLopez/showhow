"""Finds whisper.cpp and its small English model, which check the last line of a take and time a voice that arrived
without word timestamps.

The program is `whisper-cli` on the PATH (Homebrew: `brew install whisper-cpp`) or anywhere under `whisper.cpp/` at
the top of this repo. The model is `models/ggml-small.en.bin` there. Nothing here downloads anything: when
either is missing it says exactly what to put where.
"""
import os, shutil, sys
from pathlib import Path

FOLDER = Path(__file__).resolve().parents[2]  # engine/scripts -> the top of the repo
WHISPER = FOLDER / "models" / "ggml-small.en.bin"


def _found_cli():
    if shutil.which("whisper-cli"):
        return "whisper-cli"
    want = "whisper-cli.exe" if os.name == "nt" else "whisper-cli"
    kept = FOLDER / "whisper.cpp"
    return next((str(p) for p in kept.rglob(want) if p.is_file()), None) if kept.exists() else None


def whisper_cli():
    """The whisper.cpp program, after checking that it and its model are both in place."""
    cli = _found_cli()
    if not cli or not WHISPER.exists():
        sys.exit("whisper.cpp or its model is missing: install whisper-cli (brew install whisper-cpp) and put "
                 f"ggml-small.en.bin from huggingface.co/ggerganov/whisper.cpp at {WHISPER}")
    return cli
