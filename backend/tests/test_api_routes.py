import unittest


class ApiRoutesTests(unittest.TestCase):
    def test_expected_routes_exist(self):
        from app.main import app

        paths = {r.path for r in app.routes}

        expected = {
            "/api/parse",
            "/api/diff",
            "/api/templates",
            "/api/templates/generate",
            "/api/prompts/global",
            "/api/skills/export",
            "/api/skills/import",
            "/api/check/rulesets",
            "/api/check/run",
            "/api/health",
        }
        missing = sorted(expected - paths)
        self.assertEqual(missing, [])
