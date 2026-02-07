import os
import tempfile
import unittest

from fastapi import HTTPException
from app.models import Block, BlockKind, BlockMeta, Ruleset, TemplateSnapshot
from app.services.ruleset_store import get_ruleset, upsert_ruleset
from app.services.skill_bundle import export_skill_bundle, import_skill_bundle
from app.services.template_store import get_template, upsert_template


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


class SkillBundleTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        os.environ["DOC_COMPARISON_DATA_DIR"] = self._tmp.name

    def tearDown(self) -> None:
        try:
            os.environ.pop("DOC_COMPARISON_DATA_DIR", None)
        finally:
            self._tmp.cleanup()

    def test_skill_bundle_export_import_roundtrip(self):
        tpl = TemplateSnapshot(
            templateId="sales_contract_cn",
            name="买卖合同（销售）",
            version="2026-02-07",
            signature="sig",
            blocks=[_make_block("b1", "签订日期：2026-02")],
        )
        upsert_template(tpl)
        upsert_ruleset(
            Ruleset(templateId=tpl.templateId, name=tpl.name, version=tpl.version, referenceData={}, points=[])
        )

        payload, filename = export_skill_bundle(template_id=tpl.templateId, version=tpl.version)
        self.assertTrue(filename.endswith(".cskill"))
        out = import_skill_bundle(bundle_bytes=payload, overwrite_same_version=True)
        self.assertEqual(out["skillId"], tpl.templateId)
        self.assertEqual(out["skillVersion"], tpl.version)

        got_tpl = get_template(tpl.templateId, tpl.version)
        self.assertIsNotNone(got_tpl)
        self.assertEqual(got_tpl.blocks[0].text, tpl.blocks[0].text)

        got_rs = get_ruleset(tpl.templateId)
        self.assertIsNotNone(got_rs)
        self.assertEqual(got_rs.templateId, tpl.templateId)

    def test_skill_bundle_import_conflict_requires_overwrite(self):
        tpl = TemplateSnapshot(
            templateId="t_conflict",
            name="Conflict",
            version="v1",
            signature="sig",
            blocks=[_make_block("b1", "x")],
        )
        upsert_template(tpl)
        upsert_ruleset(
            Ruleset(templateId=tpl.templateId, name=tpl.name, version=tpl.version, referenceData={}, points=[])
        )
        payload, _ = export_skill_bundle(template_id=tpl.templateId, version=tpl.version)

        with self.assertRaises(HTTPException) as ctx:
            import_skill_bundle(bundle_bytes=payload, overwrite_same_version=False)
        self.assertEqual(ctx.exception.status_code, 409)
