#!/usr/bin/env python3
"""Makes voice.mp3 and voice.alignment.json from script.txt (ElevenLabs "with timestamps": exact character times, no recogniser).

usage: voice.py <slug>                              the full take in a single request, using the voice set in reel.json
       voice.py <slug> --audition id:label,id:label the first two sentences in each voice -> reels/<slug>/voices/ (you choose)

reel.json example:
  "voice": { "id": "...", "name": "...", "model": "eleven_multilingual_v2", "speed": 1.12,
             "stability": 0.5, "similarity": 0.8, "style": 0.0 }

Takes are never patched or spliced: edit the script or the voice, run this again, then run align.py again.
The model occasionally skips the final line, so the end is transcribed and checked against the script before the take is kept.
The key comes from ELEVENLABS_API_KEY or from .env.local at the top of this repo, and is never saved anywhere.
"""
import base64, difflib, json, os, re, subprocess, sys, tempfile, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.elevenlabs.io/v1"
from where import WHISPER, whisper_cli   # whisper model and program kept in this folder, on any OS
DEFAULTS = {"model": "eleven_multilingual_v2", "speed": 1.12, "stability": 0.5, "similarity": 0.8, "style": 0.0}
norm = lambda s: re.sub(r"[^a-z0-9 ]", "", s.lower()).split()


def api_key():
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    env = ROOT.parent / ".env.local"
    if not key and env.exists():
        key = next((l.split("=", 1)[1].strip().strip("\"'") for l in env.read_text().splitlines() if l.startswith("ELEVENLABS_API_KEY=")), "")
    return key or sys.exit("no ELEVENLABS_API_KEY in the environment or in .env.local")


def call(path, body=None):
    req = urllib.request.Request(f"{API}{path}", data=json.dumps(body).encode() if body else None,
                                 headers={"xi-api-key": api_key(), "Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=180))
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs refused ({e.code}): {e.read().decode()[:300]}")


def speak(text, v):
    body = {"text": text, "model_id": v["model"], "voice_settings": {
        "speed": v["speed"], "stability": v["stability"], "similarity_boost": v["similarity"], "style": v["style"], "use_speaker_boost": True}}
    out = call(f"/text-to-speech/{v['id']}/with-timestamps?output_format=mp3_44100_192", body)
    return base64.b64decode(out["audio_base64"]), out["alignment"]


def force_align(mp3, text):
    """Forced alignment through ElevenLabs: the known script is timed against the audio. eleven_v3 reports character
    times that run straight across pauses, so v3 takes are timed this way. Returns the shape of the "with timestamps" alignment."""
    import uuid
    b = uuid.uuid4().hex
    body = (f'--{b}\r\nContent-Disposition: form-data; name="text"\r\n\r\n{text}\r\n'
            f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="voice.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode()
    body += Path(mp3).read_bytes() + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(f"{API}/forced-alignment", data=body, headers={"xi-api-key": api_key(), "Content-Type": f"multipart/form-data; boundary={b}"})
    try:
        chars = json.load(urllib.request.urlopen(req, timeout=300))["characters"]
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs forced alignment refused ({e.code}): {e.read().decode()[:300]}")
    return {"characters": [c["text"] for c in chars], "character_start_times_seconds": [c["start"] for c in chars],
            "character_end_times_seconds": [c["end"] for c in chars]}


def pad(mp3, seconds=0.7):
    """Adds silence at the end so the reel's final frame stays up long enough to read before it loops.
    The speech is left untouched; only a tail is added."""
    tmp = mp3.with_suffix(".pad.mp3")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mp3), "-af", f"apad=pad_dur={seconds}",
                    "-c:a", "libmp3lame", "-b:a", "192k", str(tmp)], check=True)
    tmp.replace(mp3)


def heard(mp3, start):
    """Transcribes the audio from `start` to the end, to confirm the final line was actually spoken."""
    wav = Path(tempfile.mkdtemp()) / "tail.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.2f}", "-i", str(mp3), "-ac", "1", "-ar", "16000", str(wav)], check=True)
    subprocess.run([whisper_cli(), "-m", str(WHISPER), "-f", str(wav), "-otxt", "-of", str(wav.with_suffix("")), "-np"], check=True, capture_output=True)
    return wav.with_suffix(".txt").read_text()


if __name__ == "__main__":
    reel = ROOT / "reels" / sys.argv[1]
    text = re.sub(r"\n{2,}", "\n\n", (reel / "script.txt").read_text().strip())
    cfg = json.loads((reel / "reel.json").read_text()).get("voice", {}) if (reel / "reel.json").exists() else {}
    sentences = re.split(r"(?<=[.?!])\s+", text)

    if "--audition" in sys.argv:
        (reel / "voices").mkdir(exist_ok=True)
        names = {x["voice_id"]: x["name"] for x in call("/voices")["voices"]}
        for spec in sys.argv[sys.argv.index("--audition") + 1].split(","):  # each entry is an id, or id:label for a voice from the library
            vid, _, label = spec.partition(":")
            audio, _ = speak(" ".join(sentences[:2]), {**DEFAULTS, **cfg, "id": vid})
            name = re.sub(r"[^a-z0-9]+", "-", (label or names.get(vid, vid)).lower()).strip("-")[:40]
            (reel / "voices" / f"{name}.mp3").write_bytes(audio)
            print(reel / "voices" / f"{name}.mp3")
        sys.exit(0)

    v = {**DEFAULTS, **cfg}
    if "id" not in v:
        sys.exit('reel.json has no "voice": {"id": ...}. Audition first, then pick the voice.')
    # when script.v3.txt exists, eleven_v3 reads from it: the same words plus [audio tags] where the tone shifts.
    # The tags are not spoken, and v3's character times run across pauses, so the take is then retimed by
    # aligning it to the plain, untagged script.
    tagged = reel / "script.v3.txt"
    v3 = v["model"] in ("eleven_v3", "eleven_v4")  # v4 understands the same tags
    audio, al = speak(re.sub(r"\n{2,}", "\n\n", tagged.read_text().strip()) if v3 and tagged.exists() else text, v)
    mp3 = reel / "voice.mp3"
    mp3.write_bytes(audio)
    if v3:
        al = force_align(mp3, text)
    pad(mp3)
    (reel / "voice.alignment.json").write_text(json.dumps({"voice": v, "alignment": al}, ensure_ascii=False))

    # check the final sentence: first by its character times, then by listening
    chars, t0s = "".join(al["characters"]), al["character_start_times_seconds"]
    last = sentences[-1]
    at = chars.rfind(last[:20])
    start, end = t0s[at], al["character_end_times_seconds"][-1]
    said = heard(mp3, max(0, start - 0.15))
    ratio = difflib.SequenceMatcher(None, norm(last), norm(said)).ratio()
    words = len(text.split())
    print(f"{mp3}: {end:.2f} s, {words} words, {words / end:.2f} words a second")
    print(f"last line {start:.2f}-{end:.2f} s, heard: \"{said.strip()}\" ({ratio:.0%} of the script's words)")
    if ratio < 0.8 or (end - start) < 0.03 * len(last):
        sys.exit("the last line is missing or rushed: run the take again, never patch it")
