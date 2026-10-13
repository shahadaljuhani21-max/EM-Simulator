import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, casesTable } from "@workspace/db";
import { casePayloadSchema, levelValues, validateCaseLinks, type CasePayload } from "../lib/case-validation";
import { requireCaseAdmin } from "../middlewares/require-case-admin";

const router: IRouter = Router();

function rowValues(caseData: CasePayload) {
  return {
    caseId: caseData.caseId, contentVersion: caseData.contentVersion, status: caseData.status,
    level: caseData.level, lecture: caseData.lecture, internalTitle: caseData.metadata.internalTitle,
    finalDiagnosis: caseData.metadata.finalDiagnosis, caseData, updatedAt: new Date(),
  };
}

function parseCase(input: unknown) {
  const parsed = casePayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  const linkErrors = validateCaseLinks(parsed.data);
  if (linkErrors.length) return { ok: false as const, errors: linkErrors };
  return { ok: true as const, data: parsed.data };
}

router.get("/cases", async (req, res, next) => {
  try {
    const level = typeof req.query.level === "string" ? req.query.level : undefined;
    if (level && !levelValues.includes(level as (typeof levelValues)[number])) { res.status(400).json({ error: "Invalid level." }); return; }
    const where = level ? and(eq(casesTable.status, "published"), eq(casesTable.level, level)) : eq(casesTable.status, "published");
    const rows = await db.select({ caseData: casesTable.caseData }).from(casesTable).where(where).orderBy(casesTable.caseId);
    res.json({ cases: rows.map((row) => row.caseData) });
  } catch (error) { next(error); }
});

router.get("/admin/cases", requireCaseAdmin, async (_req, res, next) => {
  try { res.json({ cases: await db.select().from(casesTable).orderBy(desc(casesTable.updatedAt)) }); }
  catch (error) { next(error); }
});

router.post("/admin/cases/import", requireCaseAdmin, async (req, res, next) => {
  try {
    const inputs = Array.isArray(req.body) ? req.body : [req.body];
    if (!inputs.length || inputs.length > 200) { res.status(400).json({ error: "Import must contain between 1 and 200 cases." }); return; }
    const validated = inputs.map(parseCase);
    const invalid = validated.flatMap((item, index) => item.ok ? [] : [{ index, errors: item.errors }]);
    if (invalid.length) { res.status(400).json({ error: "Case validation failed.", invalid }); return; }
    const cases = validated.map((item) => (item as { ok: true; data: CasePayload }).data);
    for (const caseData of cases) {
      const values = rowValues(caseData);
      await db.insert(casesTable).values(values).onConflictDoUpdate({ target: casesTable.caseId, set: values });
    }
    res.status(201).json({ imported: cases.map((item) => item.caseId) });
  } catch (error) { next(error); }
});

router.put("/admin/cases/:caseId", requireCaseAdmin, async (req, res, next) => {
  try {
    const caseId = String(req.params.caseId);
    const parsed = parseCase(req.body);
    if (!parsed.ok) { res.status(400).json({ error: "Case validation failed.", errors: parsed.errors }); return; }
    if (parsed.data.caseId !== caseId) { res.status(400).json({ error: "The caseId in the URL and JSON must match." }); return; }
    const values = rowValues(parsed.data);
    await db.insert(casesTable).values(values).onConflictDoUpdate({ target: casesTable.caseId, set: values });
    res.json({ case: parsed.data });
  } catch (error) { next(error); }
});

router.patch("/admin/cases/:caseId/status", requireCaseAdmin, async (req, res, next) => {
  try {
    const caseId = String(req.params.caseId);
    const status = req.body?.status;
    if (!["draft", "review", "published", "inactive"].includes(status)) { res.status(400).json({ error: "Invalid status." }); return; }
    const rows = await db.select({ caseData: casesTable.caseData }).from(casesTable).where(eq(casesTable.caseId, caseId));
    if (!rows[0]) { res.status(404).json({ error: "Case not found." }); return; }
    const caseData = { ...(rows[0].caseData as CasePayload), status } as CasePayload;
    await db.update(casesTable).set({ status, caseData, updatedAt: new Date() }).where(eq(casesTable.caseId, caseId));
    res.json({ caseId, status });
  } catch (error) { next(error); }
});

router.delete("/admin/cases/:caseId", requireCaseAdmin, async (req, res, next) => {
  try { await db.delete(casesTable).where(eq(casesTable.caseId, String(req.params.caseId))); res.status(204).send(); }
  catch (error) { next(error); }
});

export default router;
