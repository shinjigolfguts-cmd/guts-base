"""Offline source-audit regressions. Every HTTP response is a local fixture."""
import contextlib
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("source_checker", ROOT / "scripts/check_sources.py")
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)
URL = "https://example.test/product"


def workflow_step(name):
    """Extract the literal shell block from the checked-in source workflow."""
    lines = (ROOT / ".github/workflows/source-health.yml").read_text().splitlines()
    start = lines.index("      - name: " + name)
    run = lines.index("        run: |", start) + 1
    result = []
    for line in lines[run:]:
        if line and not line.startswith("          "):
            break
        result.append(line[10:])
    return "\n".join(result) + "\n"


class ClassificationTests(unittest.TestCase):
    def test_fixed_classification_cases(self):
        cases = [
            (200, "Product details", URL, "http_ok_content_unverified"),
            (200, "只今メンテナンス中", URL, "maintenance"),
            (200, "ただいまメンテナンス中", URL, "maintenance"),
            (503, "ただいまメンテナンスのため", URL, "maintenance"),
            (503, "Service unavailable", URL, "http_error"),
            (404, "Not found", URL, "not_found"),
            (410, "Gone", URL, "not_found"),
            (429, "Too many requests", URL, "rate_limited"),
            (200, "Verify you are human", URL, "verification_required"),
            (403, "Checking your browser", URL, "verification_required"),
            (200, "", URL + "/DDUser-Challenge", "verification_required"),
            (500, "Server error", URL, "http_error"),
        ]
        for status, body, final_url, expected in cases:
            with self.subTest(status=status, body=body, final_url=final_url):
                self.assertEqual(checker.classify(status, body, final_url), expected)


class RequestTests(unittest.TestCase):
    def setUp(self):
        # An unexpected request fails rather than reaching any external host.
        self.patcher = mock.patch.object(checker.urllib.request, "urlopen",
                                         side_effect=AssertionError("Unmocked HTTP request"))
        self.urlopen = self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def response(self, status, body, url=URL):
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.status, response.url = status, url
        response.read.return_value = body.encode()
        self.urlopen.side_effect = None
        self.urlopen.return_value = response
        return response

    def error(self, status, body, url=URL):
        self.urlopen.side_effect = urllib.error.HTTPError(
            url, status, "Fixture error", {}, io.BytesIO(body.encode()))
        return checker.check(URL)

    def test_success_is_reachable_but_content_unverified(self):
        response = self.response(200, "Product")
        result = checker.check(URL)
        self.assertTrue(result["reachable"])
        self.assertFalse(result["brokenLink"])
        self.assertEqual(result["state"], "http_ok_content_unverified")
        response.read.assert_called_once_with(65536)
        self.assertEqual(self.urlopen.call_args.kwargs["timeout"], 15)

    def test_200_maintenance_is_not_healthy_or_broken(self):
        self.response(200, "ただいまメンテナンス中")
        result = checker.check(URL)
        self.assertEqual(result["state"], "maintenance")
        self.assertFalse(result["reachable"])
        self.assertFalse(result["brokenLink"])

    def test_503_maintenance_and_generic_503_stay_distinct(self):
        for body, state in [("ただいまメンテナンス中", "maintenance"),
                            ("Service unavailable", "http_error")]:
            with self.subTest(body=body):
                result = self.error(503, body)
                self.assertEqual(result["state"], state)
                self.assertFalse(result["reachable"])
                self.assertFalse(result["brokenLink"])

    def test_true_404_and_410_are_not_found(self):
        for status in [404, 410]:
            with self.subTest(status=status):
                result = self.error(status, "Resource unavailable")
                self.assertEqual(result["state"], "not_found")
                self.assertTrue(result["brokenLink"])

    def test_404_and_410_challenge_or_maintenance_are_not_broken_links(self):
        for status in [404, 410]:
            for body, state in [("verify you are human", "verification_required"),
                                ("ただいまメンテナンス中", "maintenance")]:
                with self.subTest(status=status, state=state):
                    result = self.error(status, body)
                    self.assertEqual(result["state"], state)
                    self.assertFalse(result["reachable"])
                    self.assertFalse(result["brokenLink"])

    def test_redirect_error_is_not_a_broken_link(self):
        for status in [301, 302, 303, 307, 308]:
            with self.subTest(status=status):
                result = self.error(status, "Redirect")
                self.assertEqual(result["state"], "redirect_error")
                self.assertFalse(result["brokenLink"])

    def test_rate_limit_is_not_a_broken_link(self):
        result = self.error(429, "Too many requests")
        self.assertEqual(result["state"], "rate_limited")
        self.assertFalse(result["brokenLink"])

    def test_transport_failure_never_infers_closure(self):
        self.urlopen.side_effect = urllib.error.URLError("Fixture transport failure")
        result = checker.check(URL)
        self.assertEqual(result["state"], "transport_error")
        self.assertIsNone(result["status"])
        self.assertFalse(result["reachable"])
        self.assertFalse(result["brokenLink"])


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.data = [{"id": 1, "cat": 1, "source": URL},
                     {"id": 2, "cat": 2, "source": URL},
                     {"id": 3, "cat": 2, "source": URL + "/other"}]
        self.catalog = "const catalogData = " + json.dumps(self.data) + ";\n"
        (self.root / "catalog.js").write_text(self.catalog)
        self.report = self.root / "report.json"

    def run_main(self, checked, extra=()):
        with mock.patch.object(checker, "ROOT", self.root), \
             mock.patch.object(checker, "check", side_effect=checked) as check, \
             mock.patch.object(checker.urllib.request, "urlopen", side_effect=AssertionError("No HTTP allowed")), \
             mock.patch.object(sys, "argv", ["check_sources.py", "--output", str(self.report), *extra]), \
             contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit) as exit_result:
                checker.main()
        self.assertEqual((self.root / "catalog.js").read_text(), self.catalog)
        return exit_result.exception.code, json.loads(self.report.read_text()), check

    @staticmethod
    def healthy(url):
        return {"url": url, "status": 200, "reachable": True,
                "state": "http_ok_content_unverified", "brokenLink": False}

    def test_full_report_deduplicates_urls_without_rewriting_catalog(self):
        code, report, check = self.run_main(self.healthy)
        self.assertEqual(code, 0)
        self.assertTrue(report["fullCatalog"])
        self.assertFalse(report["catalogModified"])
        self.assertEqual(report["totalUrls"], 2)
        self.assertEqual(report["reachableUrls"], 2)
        self.assertEqual(check.call_count, 2)
        self.assertEqual(report["categories"]["2"], {"entries": 2, "reachable": 2, "attempted": 2})
        self.assertEqual([r["url"] for r in report["results"]], [URL, URL + "/other"])

    def test_review_report_is_saved_before_exit_two(self):
        def review(url):
            result = self.healthy(url)
            if url == URL:
                result.update(status=503, reachable=False, state="maintenance")
            return result
        code, report, _ = self.run_main(review)
        self.assertEqual(code, 2)
        self.assertEqual(report["reachableUrls"], 1)
        self.assertEqual(len(report["results"]), 2)
        self.assertFalse(any(r["brokenLink"] for r in report["results"]))

    def test_subset_reports_attempted_counts_and_is_not_full_audit(self):
        selection = self.root / "urls.json"
        selection.write_text(json.dumps([URL, URL]))
        code, report, check = self.run_main(self.healthy, ["--urls", str(selection)])
        self.assertEqual(code, 0)
        self.assertFalse(report["fullCatalog"])
        self.assertEqual(report["totalUrls"], 1)
        self.assertEqual(check.call_count, 1)
        self.assertEqual(report["categories"]["2"], {"entries": 2, "reachable": 1, "attempted": 1})

    def test_invalid_subset_is_rejected_before_any_request(self):
        for requested in [["https://unlisted.test/"], URL, [None]]:
            with self.subTest(requested=requested):
                selection = self.root / "urls.json"
                selection.write_text(json.dumps(requested))
                with mock.patch.object(checker, "ROOT", self.root), \
                     mock.patch.object(checker, "check") as check, \
                     mock.patch.object(sys, "argv", ["check_sources.py", "--urls", str(selection)]):
                    with self.assertRaises(ValueError):
                        checker.main()
                check.assert_not_called()
                self.assertFalse(self.report.exists())

    def test_unexpected_audit_failure_is_not_a_success_report(self):
        with self.assertRaisesRegex(RuntimeError, "Fixture failure"):
            self.run_main(RuntimeError("Fixture failure"))
        self.assertFalse(self.report.exists())


class WorkflowTests(unittest.TestCase):
    def test_real_shell_block_preserves_success_review_and_failure_outcomes(self):
        block = workflow_step("Check all catalog source URLs")
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            shim = root / "python"
            shim.write_text('#!/bin/sh\nexit "$FIXTURE_EXIT"\n')
            shim.chmod(0o755)
            for expected_cli, expected_shell, warning in [(0, 0, False), (2, 0, True), (1, 1, False), (3, 3, False)]:
                with self.subTest(cli=expected_cli):
                    env = {**os.environ, "PATH": str(root) + os.pathsep + os.environ["PATH"],
                           "RUNNER_TEMP": str(root), "FIXTURE_EXIT": str(expected_cli)}
                    result = subprocess.run(["bash", "-e", "-c", block], env=env, text=True, capture_output=True)
                    self.assertEqual(result.returncode, expected_shell, result.stderr)
                    self.assertEqual("::warning::" in result.stdout, warning)

    def test_real_summary_block_retains_review_states_and_scope_limitations(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            report = {"totalUrls": 3, "reachableUrls": 1, "results": [
                {"state": "http_ok_content_unverified"}, {"state": "maintenance"}, {"state": "redirect_error"}]}
            (root / "source-health.json").write_text(json.dumps(report))
            summary = root / "summary.md"
            env = {**os.environ, "RUNNER_TEMP": str(root), "GITHUB_STEP_SUMMARY": str(summary)}
            block = workflow_step("Summarize evidence and limitations")
            result = subprocess.run(["bash", "-e", "-c", block], env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            text = summary.read_text()
            self.assertIn("Checked 3 unique URLs; HTTP reachable: 1", text)
            self.assertIn("maintenance: 1", text)
            self.assertIn("redirect_error: 1", text)
            self.assertIn("not a declaration that all URLs are healthy", text)
            self.assertIn("No catalog data is rewritten", text)


if __name__ == "__main__":
    unittest.main()
