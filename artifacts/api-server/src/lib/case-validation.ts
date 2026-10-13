import { z } from "zod";

export const levelValues = ["guided", "independent", "challenge"] as const;
export const statusValues = ["draft", "review", "published", "inactive"] as const;

const matcherSchema = z.object({
  phrases: z.array(z.string().min(1)).min(1),
  abbreviations: z.array(z.string().min(1)).optional(),
  conceptId: z.string().optional(),
});

const vitalsSchema = z.object({
  heartRate: z.number().int().min(0).max(300),
  bloodPressure: z.object({
    systolic: z.number().int().min(0).max(300),
    diastolic: z.number().int().min(0).max(200),
  }),
  respiratoryRate: z.number().int().min(0).max(100),
  oxygenSaturation: z.number().int().min(0).max(100),
  temperatureC: z.number().min(20).max(45),
  gcs: z.number().int().min(3).max(15),
  rhythm: z.string().optional(),
});

export const casePayloadSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  caseId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  contentVersion: z.number().int().min(1),
  status: z.enum(statusValues),
  level: z.enum(levelValues),
  lecture: z.string().min(1),
  metadata: z.object({
    internalTitle: z.string().min(1),
    finalDiagnosis: z.string().min(1),
    learningObjectives: z.array(z.string().min(1)).min(1),
    estimatedMinutes: z.number().int().min(1).max(120),
    validatedBy: z.array(z.string()),
    lastReviewed: z.string().nullable(),
    notesForEditors: z.string().optional(),
  }),
  opening: z.object({
    triageStatement: z.string().min(1),
    visibleAppearance: z.array(z.string().min(1)).min(1),
    initialVitals: vitalsSchema,
    initialStateId: z.string().min(1),
  }),
  hiddenInformation: z.object({
    history: z.array(z.object({
      findingId: z.string().min(1), promptMatchers: matcherSchema,
      response: z.string().min(1), availableFromStateIds: z.array(z.string().min(1)).min(1),
    })),
    examination: z.array(z.object({
      findingId: z.string().min(1), promptMatchers: matcherSchema,
      response: z.string().min(1), availableFromStateIds: z.array(z.string().min(1)).min(1),
    })),
  }),
  investigations: z.array(z.object({
    investigationId: z.string().min(1), name: z.string().min(1), requestMatchers: matcherSchema,
    result: z.string().min(1), interpretationForFeedback: z.string().optional(),
    availableFromStateIds: z.array(z.string().min(1)).min(1), timeCostSeconds: z.number().int().min(0),
  })),
  actions: z.array(z.object({
    actionId: z.string().min(1), label: z.string().min(1), category: z.string().min(1),
    matchers: matcherSchema, allowedFromStateIds: z.array(z.string().min(1)).min(1),
    response: z.string().min(1), nextStateId: z.string().nullable().optional(),
    onceOnly: z.boolean().optional(), critical: z.boolean().optional(),
    scoreEvents: z.array(z.object({ category: z.string(), points: z.number().int().min(-100).max(100), reason: z.string().min(1) })),
    timeCostSeconds: z.number().int().min(0),
  })).min(1),
  states: z.array(z.object({
    stateId: z.string().min(1), label: z.string().min(1), conditionSummary: z.string().min(1),
    vitals: vitalsSchema, automaticMessage: z.string().optional(),
  })).min(1),
  endConditions: z.array(z.unknown()).min(1),
  scoring: z.object({
    maximumScore: z.number().int().min(1), startingScore: z.number().int().min(0),
    masteryThreshold: z.number().int().min(0), categories: z.record(z.number().int().min(0)),
  }),
  feedback: z.object({
    finalDiagnosis: z.string().min(1), importantDifferentials: z.array(z.string()),
    idealApproach: z.array(z.string().min(1)).min(1), learningPoints: z.array(z.string().min(1)).min(1),
    criticalActionExplanations: z.record(z.string()), unsafeActionExplanations: z.record(z.string()),
  }),
  references: z.array(z.unknown()).min(1),
});

export type CasePayload = z.infer<typeof casePayloadSchema>;

export function validateCaseLinks(caseData: CasePayload) {
  const stateIds = new Set(caseData.states.map((state) => state.stateId));
  const errors: string[] = [];
  if (!stateIds.has(caseData.opening.initialStateId)) errors.push(`opening.initialStateId '${caseData.opening.initialStateId}' does not exist`);
  for (const action of caseData.actions) {
    for (const stateId of action.allowedFromStateIds) {
      if (!stateIds.has(stateId)) errors.push(`action '${action.actionId}' references missing state '${stateId}'`);
    }
    if (action.nextStateId && !stateIds.has(action.nextStateId)) errors.push(`action '${action.actionId}' references missing next state '${action.nextStateId}'`);
  }
  return errors;
}
