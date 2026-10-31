#!/usr/bin/env python3
"""Read-only live release audit. Run from a current main checkout after deployment.
Usage: python3 scripts/check-live.py [--output /absolute/report.json]
Requires Python 3 and Node.js; no analytics events or Search Console requests.
"""
import argparse, concurrent.futures, datetime, hashlib, json, pathlib
import subprocess, urllib.request, urllib.parse, xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://shinjigolfguts-cmd.github.io/guts-base/"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output")
args = parser.parse_args()
catalog = json.loads(subprocess.check_output(["node", "-e",
    "const fs=require('fs'),vm=require('vm');const c={};vm.runInNewContext(fs.readFileSync('catalog.js','utf8')+';this.data=catalogData;',c);console.log(JSON.stringify(c.data));"],
    cwd=ROOT, text=True))
pages = ["index.html"] + sorted(str(p.relative_to(ROOT)) for p in (ROOT/"categories").glob("*.html"))
assets = sorted({x["image"].removeprefix("./") for x in catalog})
runtime = [p.name for p in ROOT.iterdir() if p.is_file() and p.suffix in (".js", ".css")]
paths = sorted(set(pages + assets + runtime + ["sitemap.xml", "sitemap-v2.xml", "robots.txt", "404.html", "google14f186523eca69b6.html"]))
def audit(relative):
    url = BASE + ("" if relative == "index.html" else relative)
    result = {"path": relative, "url": url}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "GOLF-GUTS-release-audit/1.0"})
        with urllib.request.urlopen(req, timeout=25) as response:
            body = response.read()
            result.update(status=response.status, contentType=response.headers.get("Content-Type", ""), finalUrl=response.url)
            expected = (ROOT / relative).read_bytes()
            result["sha256"] = hashlib.sha256(body).hexdigest()
            result["matchesCheckout"] = body == expected
            issues = []
            if response.status != 200: issues.append("HTTP status")
            if body != expected: issues.append("Published bytes differ from checkout (possibly deployment/cache lag)")
            if relative.endswith(".html") and "text/html" not in result["contentType"]: issues.append("HTML content type")
            if relative in assets and not result["contentType"].startswith("image/"): issues.append("Image content type")
            if relative in ("sitemap.xml", "sitemap-v2.xml"):
                root = ET.fromstring(body)
                locations = [x.text for x in root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
                expected_urls = {BASE + ("" if x == "index.html" else x) for x in pages}
                result["urlCount"] = len(locations)
                if len(locations) != len(expected_urls) or set(locations) != expected_urls: issues.append("Sitemap URLs")
            result["issues"] = issues
    except Exception as error:
        result["issues"] = [str(error)]
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    results = list(pool.map(audit, paths))
report = {
    "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "baseUrl": BASE,
    "commit": subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip(),
    "passed": all(not r["issues"] for r in results),
    "catalogRecords": len(catalog), "uniqueCatalogImages": len(assets),
    "pages": len(pages), "resources": len(results),
    "failures": [r for r in results if r["issues"]],
    "results": results,
    "limitations": "HTTP, byte integrity and sitemap validation only. Does not prove Google indexing, analytics receipt, current stock/price, model/color accuracy, or browser behavior."
}
if args.output:
    pathlib.Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
print(json.dumps({k:v for k,v in report.items() if k!="results"},ensure_ascii=False,indent=2))
raise SystemExit(0 if report["passed"] else 1)
