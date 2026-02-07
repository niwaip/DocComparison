import os
import tempfile
import unittest

from app.models import Block, BlockKind, BlockMeta, GlobalPromptConfig, Ruleset, TemplateSnapshot
from app.services.prompt_store import get_global_prompt_config, upsert_global_prompt_config
from app.services.ruleset_store import get_ruleset, upsert_ruleset
from app.services.template_store import get_latest_template, upsert_template


def _make_block(block_id: str, text: str) -> Block:
    return Block(
        blockId=block_id,
        kind=BlockKind.PARAGRAPH,
        structurePath="body.p[0]",
        stableKey=block_id,
        text=text,
        htmlFragment=f"<p>{text}</p>",
        meta=BlockMeta(),
    )


class StoreRoundtripTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        os.environ["DOC_COMPARISON_DATA_DIR"] = self._tmp.name

    def tearDown(self) -> None:
        try:
            os.environ.pop("DOC_COMPARISON_DATA_DIR", None)
        finally:
            self._tmp.cleanup()

    def test_template_store_roundtrip(self):
        snapshot = TemplateSnapshot(
            templateId="t1",
            name="Template 1",
            version="2026-02-07",
            signature="sig",
            blocks=[_make_block("b1", "hello")],
        )
        upsert_template(snapshot)
        got = get_latest_template("t1")
        self.assertIsNotNone(got)
        self.assertEqual(got.templateId, "t1")
        self.assertEqual(got.version, "2026-02-07")
        self.assertEqual(got.name, "Template 1")
        self.assertEqual(got.blocks[0].text, "hello")

    def test_ruleset_store_roundtrip(self):
        rs = Ruleset(templateId="t1", name="Template 1", version="2026-02-07", referenceData={}, points=[])
        upsert_ruleset(rs)
        got = get_ruleset("t1")
        self.assertIsNotNone(got)
        self.assertEqual(got.templateId, "t1")
        self.assertEqual(got.version, "2026-02-07")

    def test_prompt_store_roundtrip(self):
        cfg = GlobalPromptConfig(defaultPrompt="d", byTemplateId={"t1": "p1"})
        upsert_global_prompt_config(cfg)
        got = get_global_prompt_config()
        self.assertEqual(got.defaultPrompt, "d")
        self.assertEqual(got.byTemplateId["t1"], "p1")
