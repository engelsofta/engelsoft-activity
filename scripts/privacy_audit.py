"""Check publishable files without printing any potentially sensitive values."""
import base64
import re
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = (
    r"\b(?:192\.168|10\.\d+)\.\d+\.\d+\b",
    r"\b172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+\b",
    r"[A-Za-z]:[\\/]Users[\\/]",
    r"/(?:Users|home)/[A-Za-z0-9_-]+/",
    r"\bgh[pousr]_[A-Za-z0-9]{20,}\b",
    r"\bgithub_pat_[A-Za-z0-9_]{20,}\b",
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b",
)


def check_png(path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Invalid PNG: {path.relative_to(ROOT)}")
    offset = 8
    while offset < len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        if kind in (b"eXIf", b"tEXt", b"iTXt", b"zTXt"):
            raise ValueError(f"Image metadata needs review: {path.relative_to(ROOT)}")
        offset += length + 12


def main():
    names = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
    ).decode().split("\0")
    files = [ROOT / name for name in names if name and (ROOT / name).is_file()]
    for path in files:
        name = path.relative_to(ROOT).as_posix()
        if path.suffix == ".png":
            check_png(path)
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raise ValueError(f"Unexpected binary file needs review: {name}") from None
        for pattern in PATTERNS:
            if re.search(pattern, text):
                raise ValueError(f"Potential private data needs review: {name}")
        if path.name == "background.css":
            for encoded in re.findall(r"base64,([A-Za-z0-9+/=]+)", text):
                data = base64.b64decode(encoded, validate=True)
                if b"EXIF" in data or b"XMP " in data:
                    raise ValueError(f"Embedded image metadata needs review: {name}")
    print(f"Privacy scan passed: {len(files)} publication files; no matching secrets, private addresses, local user paths or image metadata.")


if __name__ == "__main__":
    main()
