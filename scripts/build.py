#!/usr/bin/env python3
"""Create a deterministic, dependency-free Zotero XPI."""
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
source = root / "addon"
manifest = json.loads((source / "manifest.json").read_text())
version = manifest["version"]
assert version == json.loads((root / "package.json").read_text())["version"]
target = root / "dist" / f"zotvim-{version}.xpi"
target.parent.mkdir(exist_ok=True)
with ZipFile(target, "w", compression=ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        info = ZipInfo(path.relative_to(source).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, path.read_bytes())
print(f"Built {target.relative_to(root)} ({target.stat().st_size:,} bytes)")
