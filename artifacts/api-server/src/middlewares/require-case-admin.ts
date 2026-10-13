import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const requireCaseAdmin: RequestHandler = (req, res, next) => {
  const configuredKey = process.env.CASE_STUDIO_ADMIN_KEY;
  if (!configuredKey) {
    res.status(503).json({ error: "Case Studio is not configured. Add CASE_STUDIO_ADMIN_KEY as a Replit Secret." });
    return;
  }
  const supplied = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBuffer = Buffer.from(configuredKey);
  const suppliedBuffer = Buffer.from(supplied);
  const authorized = suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
  if (!authorized) { res.status(401).json({ error: "Administrator access required." }); return; }
  next();
};
