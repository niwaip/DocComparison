import os
import tempfile
import unittest

from app.models import Block, BlockKind, BlockMeta, GlobalPromptConfig, Ruleset, TemplateSnapshot
from app.services.prompt_store import get_global_prompt_config, upsert_global_prompt_config
from app.services.ruleset_store import get_ruleset, upsert_ruleset
from app.services.template_store import get_latest_template, upsert_template
from app.models import CheckRule, RuleType, CheckStatus
from app.services.check_service import _eval_required_after_colon, _has_underline_placeholder, _refine_block_for_label_rules


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

    def test_underline_placeholder_detection(self):
        html_only_placeholder = "<p>运输方式：<span style='text-decoration: underline'>&nbsp;&nbsp;&nbsp;</span></p>"
        self.assertTrue(_has_underline_placeholder(html_only_placeholder))

        html_mixed_filled = (
            "<p>运输方式："
            "<span style='text-decoration: underline'>a</span>"
            "<span style='text-decoration: underline'>&nbsp;&nbsp;&nbsp;</span>"
            "</p>"
        )
        self.assertFalse(_has_underline_placeholder(html_mixed_filled))

        block = Block(
            blockId="b1",
            kind=BlockKind.PARAGRAPH,
            structurePath="body.p[0]",
            stableKey="b1",
            text="运输方式：a",
            htmlFragment=html_mixed_filled,
            meta=BlockMeta(),
        )
        st, _ = _eval_required_after_colon(CheckRule(type=RuleType.REQUIRED_AFTER_COLON, params={"labelRegex": "运输方式"}), block)
        self.assertEqual(st, CheckStatus.PASS)

    def test_required_after_colon_pass_when_value_filled_but_underline_placeholder_exists(self):
        html_has_placeholder_elsewhere = (
            "<p>最终用户：ccc"
            "<span style='text-decoration: underline'>&nbsp;&nbsp;&nbsp;</span>"
            "</p>"
        )
        block = Block(
            blockId="b2",
            kind=BlockKind.PARAGRAPH,
            structurePath="body.p[0]",
            stableKey="b2",
            text="最终用户：ccc",
            htmlFragment=html_has_placeholder_elsewhere,
            meta=BlockMeta(),
        )
        st, _ = _eval_required_after_colon(CheckRule(type=RuleType.REQUIRED_AFTER_COLON, params={"labelRegex": "最终用户"}), block)
        self.assertEqual(st, CheckStatus.PASS)

    def test_refine_anchor_block_when_text_regex_is_ambiguous(self):
        header = Block(
            blockId="h",
            kind=BlockKind.PARAGRAPH,
            structurePath="body.p[0]",
            stableKey="h",
            text="二、 交货方式、日期及最终用户： ·",
            htmlFragment="",
            meta=BlockMeta(),
        )
        field = Block(
            blockId="f",
            kind=BlockKind.PARAGRAPH,
            structurePath="body.p[1]",
            stableKey="f",
            text="5. 最终用户：ccc",
            htmlFragment="",
            meta=BlockMeta(),
        )
        chosen = _refine_block_for_label_rules([header, field], header, "最终用户")
        self.assertEqual(chosen.blockId, "f")

    def test_required_after_colon_prefers_field_line_over_heading_line(self):
        block = Block(
            blockId="b3",
            kind=BlockKind.PARAGRAPH,
            structurePath="body.p[0]",
            stableKey="b3",
            text="二、 交货方式、日期及最终用户： ·\n5. 最终用户：ccc",
            htmlFragment="",
            meta=BlockMeta(),
        )
        st, _ = _eval_required_after_colon(CheckRule(type=RuleType.REQUIRED_AFTER_COLON, params={"labelRegex": "最终用户"}), block)
        self.assertEqual(st, CheckStatus.PASS)
