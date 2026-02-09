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

    def test_error_response_shape_for_404(self):
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        res = client.get("/api/templates/__missing__/latest")
        self.assertEqual(res.status_code, 404)
        data = res.json()
        self.assertIsInstance(data, dict)
        self.assertEqual(data.get("code"), "HTTP_ERROR")
        self.assertIsInstance(data.get("message"), str)
        self.assertTrue(bool(data.get("message")))

    def test_error_response_shape_for_validation(self):
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        res = client.post("/api/diff", json={})
        self.assertEqual(res.status_code, 422)
        data = res.json()
        self.assertIsInstance(data, dict)
        self.assertEqual(data.get("code"), "VALIDATION_ERROR")
        self.assertIsInstance(data.get("message"), str)
        self.assertTrue(bool(data.get("message")))
