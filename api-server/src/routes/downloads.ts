import { Router } from "express";
import creator from "../../../emergency-medicine-simulator/public/EM_CASE_PACK_AI_CREATOR_v1.md";
import coreFiles from "../../../emergency-medicine-simulator/public/EM_CASE_PACK_FILES_v1.zip";

const router = Router();

router.get("/downloads/ai-case-pack-files", (_req, res) => {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="EM_CASE_PACK_FILES_v1.zip"');
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.send(Buffer.from(coreFiles, "base64"));
});

router.get("/downloads/ai-case-pack-creator", (_req, res) => {
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", 'attachment; filename="EM_CASE_PACK_AI_CREATOR_v1.md"');
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.send(Buffer.from(creator, "utf8"));
});

export default router;