"""Build explicitly allowlisted archives; never package the repository root."""
import argparse
import base64
import json
import re
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components/engelsoft_activity"
RUNTIME_FILES = (
    "__init__.py", "config_flow.py", "const.py", "manifest.json", "strings.json",
    "frontend/background.css", "frontend/dom-update.js", "frontend/model.js",
    "frontend/panel.js", "frontend/styles.css", "translations/de.json", "translations/en.json",
    "frontend/activity-light-background.png", "brand/icon.png", "brand/icon@2x.png",
)
PRIVATE_PATTERNS = (
    r"192\.168\.\d+\.\d+", r"\b10\.\d+\.\d+\.\d+\b",
    r"\b172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+\b",
    r"[A-Za-z]:[\\/]Users[\\/]", r"/Users/", r"/home/[a-zA-Z0-9_-]+/",
    r"gh[pousr]_[A-Za-z0-9]{20,}", r"github_pat_[A-Za-z0-9_]{20,}",
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    r"(?i)(?:bepacom_1_|marstek_venus|sonosarc|dwd_precipitation_forecast_home)",
)

def scan_text(name, text):
    for pattern in PRIVATE_PATTERNS:
        if re.search(pattern, text):
            raise ValueError(f"Potential private material: {name}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag")
    args = parser.parse_args()
    manifest = json.loads((COMPONENT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if args.tag and args.tag != f"v{version}":
        raise ValueError("Release tag and manifest version differ")
    if f'VERSION = "{version}"' not in (COMPONENT / "const.py").read_text():
        raise ValueError("Constant version mismatch")
    panel = (COMPONENT / "frontend/panel.js").read_text(encoding="utf-8")
    if set(re.findall(r"\?v=([0-9.]+)", panel)) != {version}:
        raise ValueError("Frontend asset versions differ")
    if json.loads((ROOT / "package.json").read_text())["version"] != version:
        raise ValueError("Package version mismatch")
    actual = {p.relative_to(COMPONENT).as_posix() for p in COMPONENT.rglob("*") if p.is_file() and "__pycache__" not in p.parts}
    if actual != set(RUNTIME_FILES):
        raise ValueError(f"Runtime inventory differs: {actual.symmetric_difference(RUNTIME_FILES)}")
    for name, size in (("icon.png", 256), ("icon@2x.png", 512)):
        image = (COMPONENT / "brand" / name).read_bytes()
        if (image[:8] != b"\x89PNG\r\n\x1a\n" or
                int.from_bytes(image[16:20], "big") != size or
                int.from_bytes(image[20:24], "big") != size):
            raise ValueError(f"Invalid integration brand image: {name}")
    for folder in (COMPONENT, ROOT / "tests"):
        for file in folder.rglob("*"):
            if file.is_file() and file.suffix in (".js", ".cjs", ".py", ".json", ".css"):
                if "__pycache__" not in file.parts:
                    scan_text(file.relative_to(ROOT).as_posix(), file.read_text(encoding="utf-8"))
    # The embedded WebP is a bundled UI asset; no EXIF or XMP may be shipped.
    background = (COMPONENT / "frontend/background.css").read_text()
    encoded = re.search(r"base64,([A-Za-z0-9+/=]+)", background)
    if encoded:
        binary = base64.b64decode(encoded[1], validate=True)
        if b"EXIF" in binary or b"XMP " in binary:
            raise ValueError("Embedded image contains metadata")
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    for filename, prefix in ((f"Engelsoft-Activity-{version}.zip", "custom_components/engelsoft_activity/"), ("engelsoft_activity.zip", "")):
        target = output / filename
        with ZipFile(target, "w", ZIP_DEFLATED) as archive:
            for rel in RUNTIME_FILES:
                archive.writestr(prefix + rel, (COMPONENT / rel).read_bytes())
        with ZipFile(target) as archive:
            expected = {prefix + name for name in RUNTIME_FILES}
            if set(archive.namelist()) != expected or archive.testzip() is not None:
                raise ValueError("Archive verification failed")
            for rel in RUNTIME_FILES:
                if archive.read(prefix + rel) != (COMPONENT / rel).read_bytes():
                    raise ValueError("Archive byte verification failed")
        print(f"Verified {target.name}: {len(RUNTIME_FILES)} runtime files, {target.stat().st_size} bytes")

if __name__ == "__main__":
    main()
