import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Script } from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const name of readdirSync(join(root, "addon"))) {
  if (name.endsWith(".js")) {
    new Script(readFileSync(join(root, "addon", name), "utf8"), { filename: name });
    console.log(`Syntax OK: addon/${name}`);
  }
}
const manifest = JSON.parse(readFileSync(join(root, "addon/manifest.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (manifest.version !== pkg.version) throw new Error("Version mismatch");
if (manifest.applications.zotero.strict_min_version !== "8.0") throw new Error("Zotero 8 minimum missing");
if (!manifest.applications.zotero.update_url) throw new Error("Zotero requires an update URL");
console.log("Manifest OK");
