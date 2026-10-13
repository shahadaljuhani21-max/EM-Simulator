import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const casesTable = pgTable("cases", {
  caseId: text("case_id").primaryKey(),
  contentVersion: integer("content_version").notNull(),
  status: text("status").notNull().default("draft"),
  level: text("level").notNull(),
  lecture: text("lecture").notNull(),
  internalTitle: text("internal_title").notNull(),
  finalDiagnosis: text("final_diagnosis").notNull(),
  caseData: jsonb("case_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CaseRow = typeof casesTable.$inferSelect;
