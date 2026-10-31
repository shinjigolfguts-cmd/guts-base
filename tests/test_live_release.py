"""Offline release-audit fixtures. No public HTTP or deployment is performed."""
import contextlib
import io
import json
import os
import pathlib
import runpy
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = "https://shinjigolfguts-cmd.github.io/guts-base/"
COMMIT = "0123456789abcdef0123456789abcdef01234567"


def workflow_step(name):
    lines = (ROOT / ".github/workflows/catalog-check.yml").read_text().splitlines()
    start = lines.index("      - name: " + name)
    run = lines.index("        run: |", start) + 1
    block = []
    for line in lines[run:]:
        if line and not line.startswith("          "):
            break
        block.append(line[10:])
    return "\n".join(block) + "\n"


class LiveAuditTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        (self.root / "scripts").mkdir()
        self.script = self.root / "scripts/check-live.py"
        shutil.copy2(ROOT / "scripts/check-live.py", self.script)
        self.catalog = [{"id": 1, "image": "./assets/one.png"},
                        {"id": 2, "image": "./assets/one.png"},
                        {"id": 3, "image": "assets/two.jpg"}]
        self.sitemap = ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                        f'<url><loc>{BASE}</loc></url>'
                        f'<url><loc>{BASE}categories/clubs.html</loc></url></urlset>').encode()
        self.files = {
            "index.html": b"<html>Fixture home</html>",
            "categories/clubs.html": b"<html>Fixture category</html>",
            "catalog.js": ("const catalogData = " + json.dumps(self.catalog) + ";").encode(),
            "app.js": b"/* fixture runtime */", "style.css": b"body{}",
            "assets/one.png": b"fixture-image-one", "assets/two.jpg": b"fixture-image-two",
            "sitemap.xml": self.sitemap, "sitemap-v2.xml": self.sitemap,
            "robots.txt": b"User-agent: *\nAllow: /\n",
            "404.html": b"<html>Fixture not found</html>",
            "google14f186523eca69b6.html": b"google-site-verification: fixture",
        }
        for relative, body in self.files.items():
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)
        self.output = self.root / "report.json"
        self.requests = []

    def run_audit(self, changes=None, local_missing=None, bootstrap_error=None, commit_error=None):
        changes = changes or {}
        requests = self.requests = []
        before = {path: (self.root / path).read_bytes() for path in self.files}
        if local_missing:
            (self.root / local_missing).unlink()

        def response(request, timeout):
            self.assertEqual(timeout, 25)
            url = request.full_url
            self.assertTrue(url.startswith(BASE), url)
            relative = url[len(BASE):] or "index.html"
            self.assertIn(relative, self.files)
            requests.append(relative)
            changed = changes.get(relative, {})
            if isinstance(changed, Exception):
                raise changed
            mime = ("text/html" if relative.endswith(".html") else
                    "image/png" if relative.startswith("assets/") else "text/plain")
            result = mock.MagicMock()
            result.__enter__.return_value = result
            result.status = changed.get("status", 200)
            result.url = url
            result.headers = {"Content-Type": changed.get("contentType", mime)}
            result.read.return_value = changed.get("body", self.files[relative])
            return result

        def command(arguments, **kwargs):
            self.assertEqual(pathlib.Path(kwargs["cwd"]), self.root)
            self.assertTrue(kwargs["text"])
            if arguments[:2] == ["node", "-e"]:
                if bootstrap_error:
                    raise bootstrap_error
                return json.dumps(self.catalog)
            self.assertEqual(arguments, ["git", "rev-parse", "HEAD"])
            if commit_error:
                raise commit_error
            return COMMIT + "\n"

        with mock.patch.object(urllib.request, "urlopen", side_effect=response), \
             mock.patch.object(socket.socket, "connect", side_effect=AssertionError("Network forbidden")), \
             mock.patch.object(subprocess, "check_output", side_effect=command), \
             mock.patch.object(sys, "argv", [str(self.script), "--output", str(self.output)]), \
             contextlib.redirect_stdout(io.StringIO()) as stdout:
            with self.assertRaises(SystemExit) as result:
                runpy.run_path(str(self.script), run_name="__main__")
        for path, body in before.items():
            if path != local_missing:
                self.assertEqual((self.root / path).read_bytes(), body, path)
        report = json.loads(self.output.read_text())
        summary = json.loads(stdout.getvalue())
        self.assertNotIn("results", summary)
        self.assertEqual(summary["passed"], report["passed"])
        return result.exception.code, report, requests

    def assert_failed(self, changes, path, issue):
        code, report, _ = self.run_audit(changes)
        self.assertEqual(code, 1)
        self.assertFalse(report["passed"])
        self.assertEqual(len(report["failures"]), 1)
        failure = report["failures"][0]
        self.assertEqual(failure["path"], path)
        self.assertTrue(any(issue in text for text in failure["issues"]), failure)
        return report

    def test_complete_manifest_deduplicates_images_and_includes_public_support_files(self):
        code, report, requests = self.run_audit()
        self.assertEqual(code, 0)
        self.assertTrue(report["passed"])
        self.assertEqual(report["failures"], [])
        self.assertEqual(report["commit"], COMMIT)
        self.assertEqual(report["catalogRecords"], 3)
        self.assertEqual(report["uniqueCatalogImages"], 2)
        self.assertEqual(report["pages"], 2)
        self.assertEqual(report["resources"], len(self.files))
        self.assertCountEqual(requests, self.files)
        self.assertEqual([r["path"] for r in report["results"]], sorted(self.files))
        self.assertIn("Does not prove Google indexing", report["limitations"])

    def test_runtime_byte_mismatch_is_reported_without_rewriting_checkout(self):
        report = self.assert_failed({"app.js": {"body": b"old deployment"}},
                                    "app.js", "Published bytes differ")
        self.assertFalse(report["failures"][0]["matchesCheckout"])

    def test_submitted_sitemap_v2_byte_mismatch_is_not_silent(self):
        self.assert_failed({"sitemap-v2.xml": {"body": self.sitemap + b"\n"}},
                           "sitemap-v2.xml", "Published bytes differ")

    def test_robots_and_404_page_byte_mismatch_are_not_silent(self):
        for path in ["robots.txt", "404.html"]:
            with self.subTest(path=path):
                self.assert_failed({path: {"body": b"stale page"}}, path, "Published bytes differ")

    def test_html_and_image_mime_mismatches_are_failures(self):
        for path, issue in [("index.html", "HTML content type"),
                            ("assets/one.png", "Image content type")]:
            with self.subTest(path=path):
                self.assert_failed({path: {"contentType": "text/plain"}}, path, issue)

    def test_non_200_response_is_failure_even_when_bytes_match(self):
        self.assert_failed({"app.js": {"status": 503}}, "app.js", "HTTP status")

    def test_http_error_is_saved_in_complete_failure_report(self):
        self.assert_failed({"assets/one.png": urllib.error.HTTPError(
            BASE + "assets/one.png", 404, "Fixture missing", {}, io.BytesIO(b"missing"))},
            "assets/one.png", "HTTP Error 404")

    def test_transport_failure_is_not_success(self):
        self.assert_failed({"app.js": urllib.error.URLError("Fixture timeout")},
                           "app.js", "Fixture timeout")

    def test_malformed_sitemap_xml_is_not_success(self):
        self.assert_failed({"sitemap.xml": {"body": b"<bad"}}, "sitemap.xml", "unclosed token")

    def test_sitemap_urls_require_exact_unique_expected_set_for_both_files(self):
        cases = [self.sitemap.replace(b"categories/clubs.html", b"categories/wrong.html"),
                 self.sitemap.replace(b"</urlset>", f"<url><loc>{BASE}</loc></url></urlset>".encode())]
        for path in ["sitemap.xml", "sitemap-v2.xml"]:
            for body in cases:
                with self.subTest(path=path, body=body):
                    self.assert_failed({path: {"body": body}}, path, "Sitemap URLs")

    def test_missing_local_expected_asset_fails_closed(self):
        code, report, _ = self.run_audit(local_missing="assets/one.png")
        self.assertEqual(code, 1)
        self.assertFalse(report["passed"])
        self.assertEqual(report["failures"][0]["path"], "assets/one.png")

    def test_bootstrap_failure_cannot_create_success_report_or_request_http(self):
        with self.assertRaisesRegex(RuntimeError, "Fixture catalog failure"):
            self.run_audit(bootstrap_error=RuntimeError("Fixture catalog failure"))
        self.assertFalse(self.output.exists())
        self.assertEqual(self.requests, [])

    def test_commit_metadata_failure_after_checks_cannot_create_success_report(self):
        with self.assertRaisesRegex(RuntimeError, "Fixture git metadata failure"):
            self.run_audit(commit_error=RuntimeError("Fixture git metadata failure"))
        self.assertCountEqual(self.requests, self.files)
        self.assertFalse(self.output.exists())


class RetryWorkflowTests(unittest.TestCase):
    def run_retry(self, failures_before_success, early_failures=0):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            python = root / "python3"
            python.write_text('''#!/bin/sh
test "$1" = scripts/check-live.py && test "$2" = --output || exit 99
n=0
test ! -f "$RUNNER_TEMP/count" || n=$(cat "$RUNNER_TEMP/count")
n=$((n+1))
printf '%s' "$n" > "$RUNNER_TEMP/count"
if test "$n" -le "$FIXTURE_EARLY_FAILURES"; then exit 3; fi
if test "$n" -le "$FIXTURE_FAILURES"; then ok=false; code=1; else ok=true; code=0; fi
printf '{"attempt":%s,"passed":%s,"fixture":true}\\n' "$n" "$ok" > "$3"
exit "$code"
''')
            python.chmod(0o755)
            sleep = root / "sleep"
            sleep.write_text('#!/bin/sh\ntest "$1" = 15 || exit 98\nprintf "%s\\n" "$1" >> "$RUNNER_TEMP/sleeps"\n')
            sleep.chmod(0o755)
            env = {**os.environ, "PATH": str(root) + os.pathsep + os.defpath,
                   "RUNNER_TEMP": str(root), "FIXTURE_FAILURES": str(failures_before_success),
                   "FIXTURE_EARLY_FAILURES": str(early_failures)}
            result = subprocess.run(["bash", "-e", "-c", workflow_step("Wait for Pages and verify published files")],
                                    env=env, text=True, capture_output=True, timeout=10)
            count = int((root / "count").read_text())
            sleeps = (root / "sleeps").read_text().splitlines() if (root / "sleeps").exists() else []
            path = root / "guts-live-report.json"
            report = json.loads(path.read_text()) if path.exists() else None
            return result.returncode, count, sleeps, report

    def test_first_success_stops_immediately(self):
        code, count, sleeps, report = self.run_retry(0)
        self.assertEqual((code, count, sleeps), (0, 1, []))
        self.assertTrue(report["passed"])

    def test_cache_delay_recovers_and_preserves_final_success_report(self):
        code, count, sleeps, report = self.run_retry(2)
        self.assertEqual((code, count, len(sleeps)), (0, 3, 2))
        self.assertEqual(report, {"attempt": 3, "passed": True, "fixture": True})

    def test_last_allowed_attempt_can_succeed(self):
        code, count, sleeps, report = self.run_retry(11)
        self.assertEqual((code, count, len(sleeps)), (0, 12, 11))
        self.assertTrue(report["passed"])

    def test_exhaustion_fails_and_retains_last_report_without_thirteenth_request(self):
        code, count, sleeps, report = self.run_retry(12)
        self.assertEqual((code, count, len(sleeps)), (1, 12, 11))
        self.assertEqual(report, {"attempt": 12, "passed": False, "fixture": True})

    def test_failure_before_report_creation_can_recover_with_a_fresh_report(self):
        code, count, sleeps, report = self.run_retry(2, early_failures=2)
        self.assertEqual((code, count, len(sleeps)), (0, 3, 2))
        self.assertEqual(report, {"attempt": 3, "passed": True, "fixture": True})

    def test_permanent_pre_report_failure_cannot_pass_or_fabricate_artifact(self):
        code, count, sleeps, report = self.run_retry(12, early_failures=12)
        self.assertEqual((code, count, len(sleeps)), (1, 12, 11))
        self.assertIsNone(report)

    def test_report_artifact_remains_always_with_original_retention(self):
        workflow = (ROOT / ".github/workflows/catalog-check.yml").read_text()
        self.assertIn('      - name: Save live release report\n        if: always()\n', workflow)
        self.assertIn('          path: ${{ runner.temp }}/guts-live-report.json', workflow)
        self.assertIn('          if-no-files-found: error\n          retention-days: 14', workflow)


if __name__ == "__main__":
    unittest.main()
