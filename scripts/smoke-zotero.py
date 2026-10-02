#!/usr/bin/env python3
"""Exercise the packaged addon in a disposable Zotero profile and runtime.

All changes are confined to a new temporary directory. The installed Zotero
runtime and the user's profile/data are never modified. A test driver is loaded
only in the disposable runtime, to install the XPI and run privileged UI tests.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from zipfile import ZipFile

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--zotero", type=Path, default=Path("/opt/zotero"))
parser.add_argument("--timeout", type=int, default=60)
args = parser.parse_args()
source = args.zotero.resolve()
if not (source / "zotero-bin").is_file():
    parser.error("--zotero must point to an unpacked Linux Zotero directory")
version = json.loads((root / "addon/manifest.json").read_text())["version"]
xpi = root / "dist" / f"zotvim-{version}.xpi"
if not xpi.is_file():
    parser.error("Build the XPI first: npm run build")

work = Path(tempfile.mkdtemp(prefix="zotvim-smoke-"))
print(f"Disposable test directory: {work}", flush=True)
runtime = work / "runtime"
runtime.mkdir()
# Keep the executable physically in the disposable runtime so Gecko resolves
# its configuration there. Share read-only libraries via symlinks.
for p in source.iterdir():
    if p.name in {"lock", ".parentlock", "updates", "app"}:
        continue
    if p.name == "zotero-bin":
        shutil.copy2(p, runtime / p.name)
    else:
        (runtime / p.name).symlink_to(p, target_is_directory=p.is_dir())
app = runtime / "app"
app.mkdir()
for p in (source / "app").iterdir():
    if p.name == "application.ini":
        # Gecko resolves the application directory through this file's real path.
        shutil.copy2(p, app / p.name)
    elif p.name == "defaults":
        shutil.copytree(p, app / p.name, symlinks=True)
    else:
        (app / p.name).symlink_to(p, target_is_directory=p.is_dir())
result_file = work / "result.json"
# A valid five-page paper fixture with searchable text; no PDF library needed.
pdf_file = work / "paper.pdf"
objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b""]
objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
pages = []
for page in range(5):
    page_id = len(objects) + 1
    stream_id = page_id + 1
    pages.append(page_id)
    objects.append((f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        f"/Resources << /Font << /F1 3 0 R >> >> /Contents {stream_id} 0 R >>").encode())
    content = f"BT /F1 18 Tf 40 740 Td (Zotvim paper page {page + 1}) Tj ET".encode()
    objects.append(f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream")
objects[1] = (f"<< /Type /Pages /Count {len(pages)} /Kids ["
    + " ".join(f"{p} 0 R" for p in pages) + "] >>").encode()
pdf = bytearray(b"%PDF-1.4\n")
offsets = [0]
for i, data in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf.extend(f"{i} 0 obj\n".encode() + data + b"\nendobj\n")
xref = len(pdf)
pdf.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
for offset in offsets[1:]:
    pdf.extend(f"{offset:010d} 00000 n \n".encode())
pdf.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
pdf_file.write_bytes(pdf)
driver = runtime / "zotvim-smoke.js"
config = (root / "tests/zotero-smoke.js").read_text()
config = config.replace("__XPI_PATH__", json.dumps(str(xpi)))
config = config.replace("__RESULT_PATH__", json.dumps(str(result_file)))
config = config.replace("__PDF_PATH__", json.dumps(str(pdf_file)))
driver.write_text(config)
# Load the driver after the main window loads. Only the disposable app's
# entry script changes; the extension under test is installed from its XPI.
injection = '\nwindow.addEventListener("load", () => {\n' \
    + 'Services.scriptloader.loadSubScript(' + json.dumps(driver.as_uri()) \
    + ', { testWindow: window, Services, ChromeUtils, Components });\n' \
    + '}, { once: true });\n'
(app / "omni.ja").unlink()
with ZipFile(source / "app/omni.ja") as original, ZipFile(app / "omni.ja", "w") as copied:
    for info in original.infolist():
        data = original.read(info.filename)
        if info.filename == "chrome/content/zotero/zoteroPane.js":
            data += injection.encode()
        copied.writestr(info, data)
profile = work / "profile"
profile.mkdir()
(work / "data").mkdir()
prefs = {
    "extensions.zotero.dataDir": str(work / "data"),
    "extensions.zotero.useDataDir": True,
    "extensions.zotero.firstRun": False,
    "extensions.zotero.sync.autoSync": False,
    "extensions.zotero.streaming.enabled": False,
    "extensions.zotero.httpServer.enabled": False,
    "extensions.zotero.integration.skipInstallation": True,
    "app.update.auto": False,
}
(profile / "user.js").write_text("\n".join(
    f"user_pref({json.dumps(k)}, {json.dumps(v)});" for k, v in prefs.items()
))
env = os.environ.copy()
env["MOZ_HEADLESS"] = "1"
env["MOZ_DISABLE_CONTENT_SANDBOX"] = "1"
log_file = work / "zotero.log"
with log_file.open("w") as log:
    process = subprocess.Popen([
        str(runtime / "zotero-bin"), "-app", str(app / "application.ini"),
        "-no-remote", "-profile", str(profile), "-ZoteroDebugText",
    ], env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        process.wait(timeout=args.timeout)
    except subprocess.TimeoutExpired:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
if result_file.exists():
    result = json.loads(result_file.read_text())
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result.get("ok") else 1)
print(f"No UI test results were produced. Inspect {log_file}")
raise SystemExit(1)
