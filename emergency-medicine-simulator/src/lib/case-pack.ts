import { z } from 'zod/v4';
import { objectiveMappingSchema, objectiveCoverageSchema, validateObjectiveMapping } from './objective-mapping';

const text = z.string().trim().min(1).max(10000);
const id = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Use letters, numbers, hyphens or underscores').max(100);
const vital = z.object({
  label: text, value: text, tone: z.enum(['normal', 'watch', 'critical']),
}).strict();
const finding = z.object({
  category: z.enum(['history', 'examination', 'investigation', 'reassessment']),
  label: text, text,
}).strict();
const answerKeyword = z.string().trim().min(1).max(120);
export const actionCategories = ['assess', 'history', 'examine', 'investigate', 'treat', 'procedure', 'consult', 'disposition'] as const;
const action = z.object({
  id, text,
  classification: z.enum(['optimal', 'acceptable', 'incorrect', 'dangerous']).describe('Evaluation of this action at this clinical stage; not a label in the visible action text.'),
  feedback: text.describe('Explanation of WHY, better alternatives and teaching points. Shown after each submitted keyword-written response in all learning levels; legacy action-choice cases retain their existing mode-specific feedback timing.'),
  consequence: text.describe('Observable clinical consequence visible in every level. No evaluative coaching or answer keys.'),
  reveals: z.array(finding).max(30),
  patientChanges: z.object({
    condition: text.optional(),
    vitalSigns: z.array(vital).max(20).optional(),
  }).strict(),
  nextStepId: id.nullable(),
  answerKeywords: z.array(answerKeyword).min(1).max(30).optional().describe('Hidden exact words or phrases that map a written response to this action. Any positive match can count as correct when this action is optimal or acceptable.'),
  responseFallback: z.boolean().optional().describe('Exactly one neutral, no-state-change action per step is used when no answer keyword matches.'),
  category: z.enum(actionCategories).optional(),
  synonyms: z.array(text).min(1).max(30).optional(),
  priority: z.enum(['immediate', 'urgent', 'routine', 'nonurgent']).optional(),
  critical: z.boolean().optional(),
  optional: z.boolean().optional(),
  unsafe: z.boolean().optional(),
  unnecessary: z.boolean().optional(),
  reassessment: z.boolean().optional(),
  disposition: z.boolean().optional(),
  repeatable: z.boolean().optional(),
  requiresReassessment: z.boolean().optional(),
  prerequisiteActionIds: z.array(id).max(100).optional(),
  mustPrecedeActionIds: z.array(id).max(100).optional(),
}).strict();
const criticalActionGroup = z.object({
  id, label: text, actionIds: z.array(id).min(1).max(100),
}).strict();
const clinicalCase = z.object({
  id, title: text, difficulty: z.enum(['beginner', 'intermediate', 'advanced']).describe('Clinical difficulty, not Guided/Independent/Challenge learning level.'),
  interactionModel: z.literal('action_based').optional().describe('New packs use action_based; omitted only for backward-compatible imports.'),
  responseMode: z.literal('keyword_written').optional().describe('New packs use keyword_written: learners type a response and the engine maps hidden action keywords to the authored action. Omitted for legacy action-choice packs.'),
  learningObjectives: z.array(text).min(1).max(20),
  objectiveMappings: z.array(objectiveMappingSchema).min(1).max(100).optional(),
  criticalActionGroups: z.array(criticalActionGroup).max(100).optional(),
  demographics: z.object({ age: z.number().int().min(0).max(120), sex: text, context: text }).strict(),
  initialPresentation: z.object({ complaint: text, appearance: text, condition: text }).strict(),
  vitalSigns: z.array(vital).min(1).max(20),
  initialStepId: id,
  steps: z.array(z.object({
    id,
    kind: z.enum(['assessment', 'history', 'examination', 'investigation', 'management', 'reassessment', 'disposition']),
    prompt: text.describe('Neutral clinical question that is actionable without guidance, visible in all levels.'),
    guidance: text.describe('Reasoning prompt and hint, not the correct answer. Automatic in Guided, on request in Independent, hidden in Challenge.'),
    findings: z.array(finding).max(30),
    actions: z.array(action).min(2).max(12),
  }).strict()).min(1).max(100),
  endOfCaseSummary: z.object({
    diagnosis: text, summary: text, idealApproach: text, disposition: text,
    learningPoints: z.array(text).min(1).max(30),
    references: z.array(text).min(1).max(20),
  }).strict(),
}).strict();

export const casePackSchema = z.object({
  schemaVersion: z.literal('1.0'),
  packId: id,
  title: text,
  description: text,
  objectiveCoverage: objectiveCoverageSchema.optional(),
  metadata: z.object({
    verificationStatus: z.enum(['not_verified', 'partially_verified', 'verified']),
    verificationDate: z.iso.date().nullable(),
    sourcesCrossChecked: z.array(text).max(200),
    referenceVerificationCompleted: z.boolean(),
    medicalContentChecked: z.boolean(),
    criticalManagementRechecked: z.boolean(),
    citationClaimsChecked: z.boolean(),
    sourceNotes: z.array(text).max(200),
  }).strict().optional(),
  topics: z.array(z.object({
    id, title: text,
    cases: z.array(clinicalCase).length(2, 'Each topic must contain exactly 2 cases'),
  }).strict()).min(1).max(100),
}).strict().superRefine((pack, ctx) => {
  const seenTopics = new Set<string>();
  const seenCases = new Set<string>();
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  validateObjectiveMapping(pack, issue);
  const m = pack.metadata;
  if (m) {
    if (m.verificationDate && m.verificationDate > new Date().toISOString().slice(0, 10)) issue(['metadata', 'verificationDate'], 'Verification date cannot be in the future');
    if (m.verificationStatus !== 'not_verified' && (!m.verificationDate || !m.sourcesCrossChecked.length)) issue(['metadata'], 'Reported verification requires a date and identified sources');
    if (m.verificationStatus === 'verified' && (!m.medicalContentChecked || !m.criticalManagementRechecked || !m.citationClaimsChecked || !m.referenceVerificationCompleted)) issue(['metadata'], 'Verified status requires all medical and independent reference checks');
    if (m.verificationStatus !== 'not_verified' && m.sourcesCrossChecked.length < 2 && !m.sourceNotes.length) issue(['metadata', 'sourceNotes'], 'Explain the single-source limitation');
    if (m.verificationStatus === 'not_verified' && (m.medicalContentChecked || m.criticalManagementRechecked || m.citationClaimsChecked || m.referenceVerificationCompleted)) issue(['metadata'], 'Reported completed checks require partially_verified or verified status');
  }
  pack.topics.forEach((topic, ti) => {
    if (seenTopics.has(topic.id)) issue(['topics', ti, 'id'], 'Duplicate topic ID');
    if (pack.topics.some((other, oi) => oi < ti && other.title === topic.title)) issue(['topics', ti, 'title'], 'Topic titles must be unique');
    seenTopics.add(topic.id);
    topic.cases.forEach((c, ci) => {
      const path = ['topics', ti, 'cases', ci];
      if (seenCases.has(c.id)) issue([...path, 'id'], 'Case IDs must be unique across the pack');
      seenCases.add(c.id);
      const steps = new Map(c.steps.map(s => [s.id, s]));
      if (steps.size !== c.steps.length) issue([...path, 'steps'], 'Step IDs must be unique within a case');
      if (!steps.has(c.initialStepId)) issue([...path, 'initialStepId'], 'Initial step does not exist');
      const allActions = c.steps.flatMap((s, si) => s.actions.map((a, ai) => ({ action: a, step: s, path: [...path, 'steps', si, 'actions', ai] as (string | number)[] })));
      const allActionIds = new Map<string, typeof allActions[number]>();
      if (c.interactionModel === 'action_based') {
        allActions.forEach(({ action: a, step: containingStep, path: aPath }) => {
          if (allActionIds.has(a.id)) issue([...aPath, 'id'], 'Action IDs must be unique across an action-based case');
          else allActionIds.set(a.id, { action: a, step: containingStep, path: aPath });
          if (!a.category || !a.synonyms?.length || !a.priority ||
            typeof a.critical !== 'boolean' || typeof a.optional !== 'boolean' ||
            typeof a.unsafe !== 'boolean' || typeof a.unnecessary !== 'boolean' ||
            typeof a.reassessment !== 'boolean' || typeof a.disposition !== 'boolean' ||
            typeof a.repeatable !== 'boolean' || typeof a.requiresReassessment !== 'boolean') {
            issue(aPath, 'Action-based cases require category, synonyms, priority and every clinical-review flag');
          }
          if (a.critical && a.priority !== 'immediate') issue([...aPath, 'priority'], 'Critical actions must have immediate priority');
          if (a.critical && a.optional) issue(aPath, 'An action cannot be both critical and optional');
          if (a.unnecessary && a.critical) issue(aPath, 'An action cannot be both unnecessary and critical');
          if (a.reassessment && a.category !== 'assess' && a.category !== 'investigate') issue([...aPath, 'category'], 'Reassessment actions must use assess or investigate');
          if (a.disposition !== (containingStep.kind === 'disposition')) {
            issue([...aPath, 'disposition'], 'Disposition flags must match the containing disposition step');
          }
          if (new Set((a.synonyms ?? []).map(normalizeActionText)).size !== (a.synonyms ?? []).length) {
            issue([...aPath, 'synonyms'], 'Action synonyms must be unique after normalization');
          }
        });
        c.steps.forEach((s, si) => {
          const aliases = new Map<string, string>();
          s.actions.forEach((a, ai) => {
            const allAliases = [a.text, ...(a.synonyms ?? [])].map(normalizeActionText);
            allAliases.forEach(alias => {
              if (!alias) return;
              const previous = aliases.get(alias);
              if (previous && previous !== a.id) issue([...path, 'steps', si, 'actions', ai, 'synonyms'], 'Action phrases must identify only one action at this step');
              else aliases.set(alias, a.id);
            });
          });
        });
        allActions.forEach(({ action: a, path: aPath }) => {
          for (const ref of [...(a.prerequisiteActionIds ?? []), ...(a.mustPrecedeActionIds ?? [])]) {
            if (!allActionIds.has(ref)) issue(aPath, `Action reference "${ref}" does not exist in this case`);
          }
          if (a.prerequisiteActionIds?.includes(a.id) || a.mustPrecedeActionIds?.includes(a.id)) issue(aPath, 'An action cannot reference itself');
          if (new Set(a.prerequisiteActionIds ?? []).size !== (a.prerequisiteActionIds ?? []).length) issue([...aPath, 'prerequisiteActionIds'], 'Prerequisite action IDs must be unique');
          if (new Set(a.mustPrecedeActionIds ?? []).size !== (a.mustPrecedeActionIds ?? []).length) issue([...aPath, 'mustPrecedeActionIds'], 'Sequence action IDs must be unique');
          if (a.requiresReassessment) {
            const visited = new Set<string>();
            const hasLaterReassessment = (stepId: string | null): boolean => {
              if (!stepId || visited.has(stepId)) return false;
              visited.add(stepId);
              const target = steps.get(stepId);
              if (!target) return false;
              return target.actions.some(candidate => candidate.reassessment) ||
                target.actions.some(candidate => hasLaterReassessment(candidate.nextStepId));
            };
            if (!hasLaterReassessment(allActionIds.get(a.id)!.action.nextStepId)) {
              issue(aPath, 'Actions that require reassessment must have a reachable reassessment action after them');
            }
          }
        });
        const groupedCriticalIds = new Set<string>();
        const groups = new Set<string>();
        (c.criticalActionGroups ?? []).forEach((group, gi) => {
          if (groups.has(group.id)) issue([...path, 'criticalActionGroups', gi, 'id'], 'Critical action group IDs must be unique');
          groups.add(group.id);
          if (new Set(group.actionIds).size !== group.actionIds.length) issue([...path, 'criticalActionGroups', gi, 'actionIds'], 'Critical action IDs in a group must be unique');
          group.actionIds.forEach((actionId, ai) => {
            if (!allActionIds.has(actionId)) issue([...path, 'criticalActionGroups', gi, 'actionIds', ai], 'Critical action group references an unknown action');
            if (groupedCriticalIds.has(actionId)) issue([...path, 'criticalActionGroups', gi, 'actionIds', ai], 'An action may belong to only one critical action group');
            groupedCriticalIds.add(actionId);
            if (!allActionIds.get(actionId)?.action.critical) issue([...path, 'criticalActionGroups', gi, 'actionIds', ai], 'Every grouped action must be marked critical');
          });
        });
      }
      if (c.responseMode === 'keyword_written') {
        if (c.interactionModel !== 'action_based') {
          issue([...path, 'interactionModel'], 'Keyword-written cases must use the action_based interaction model');
        }
        c.steps.forEach((s, si) => {
          const stepPath = [...path, 'steps', si];
          const fallbacks = s.actions.filter(a => a.responseFallback === true);
          if (fallbacks.length !== 1) {
            issue([...stepPath, 'actions'], 'Keyword-written steps require exactly one responseFallback action');
          }
          const fallback = fallbacks[0];
          if (fallback && (
            fallback.answerKeywords !== undefined
            || fallback.classification !== 'incorrect'
            || fallback.unsafe === true
            || fallback.critical === true
            || fallback.unnecessary === true
            || fallback.reveals.length > 0
            || Object.keys(fallback.patientChanges).length > 0
          )) {
            const fallbackIndex = s.actions.indexOf(fallback);
            issue([...stepPath, 'actions', fallbackIndex], 'The response fallback must be incorrect, safe and necessary, with no keywords, revealed findings or patient-state changes');
          }

          const seenKeywords = new Set<string>();
          s.actions.forEach((a, ai) => {
            if (a === fallback) return;
            if (!a.answerKeywords?.length) {
              issue([...stepPath, 'actions', ai, 'answerKeywords'], 'Every non-fallback action in a keyword-written step requires answerKeywords');
              return;
            }
            a.answerKeywords.forEach((keyword, ki) => {
              const normalized = normalizeActionText(keyword);
              if (!normalized) {
                issue([...stepPath, 'actions', ai, 'answerKeywords', ki], 'Answer keywords must contain letters or numbers');
              } else if (seenKeywords.has(normalized)) {
                issue([...stepPath, 'actions', ai, 'answerKeywords', ki], 'Answer keywords must be unique across actions within a step');
              } else {
                seenKeywords.add(normalized);
              }
            });
          });
        });
      } else if (c.steps.some(step => step.actions.some(a => a.answerKeywords !== undefined || a.responseFallback !== undefined))) {
        issue([...path, 'responseMode'], 'Cases with answer keywords or a response fallback must set responseMode to keyword_written');
      }
      c.steps.forEach((step, si) => {
        if (new Set(step.actions.map(a => a.id)).size !== step.actions.length) issue([...path, 'steps', si, 'actions'], 'Action IDs must be unique within a step');
        step.actions.forEach((a, ai) => {
          if (a.nextStepId !== null && !steps.has(a.nextStepId)) issue([...path, 'steps', si, 'actions', ai, 'nextStepId'], 'Next step does not exist');
          if (a.nextStepId === null && step.kind !== 'disposition') issue([...path, 'steps', si, 'actions', ai, 'nextStepId'], 'Only a disposition step may end the case (null)');
        });
      });
      const reachable = new Set<string>();
      const visit = (sid: string) => {
        if (reachable.has(sid) || !steps.has(sid)) return;
        reachable.add(sid);
        steps.get(sid)!.actions.forEach(a => { if (a.nextStepId) visit(a.nextStepId); });
      };
      visit(c.initialStepId);
      if (reachable.size !== steps.size) issue([...path, 'steps'], 'All steps must be reachable from the initial step');
      const canEnd = new Set(c.steps.filter(s => s.actions.some(a => a.nextStepId === null)).map(s => s.id));
      for (let i = 0; i < c.steps.length; i++) c.steps.forEach(s => {
        if (s.actions.some(a => a.nextStepId && canEnd.has(a.nextStepId))) canEnd.add(s.id);
      });
      if (canEnd.size !== steps.size) issue([...path, 'steps'], 'Every step must have a route to a disposition ending; avoid trapped loops');
    });
  });
});

export type CasePack = z.infer<typeof casePackSchema>;
export type PackCase = CasePack['topics'][number]['cases'][number];
export type PackAction = PackCase['steps'][number]['actions'][number];
export type Mode = 'guided' | 'independent' | 'challenge';
export function shouldShowImmediateDecisionFeedback(mode: Mode, responseMode?: PackCase['responseMode']) {
  return mode === 'guided' || responseMode === 'keyword_written';
}
export type Decision = {
  stepId: string;
  prompt: string;
  action: PackAction;
  writtenResponse?: string;
  matchedKeywords?: string[];
  responseCorrect?: boolean;
};
export function normalizeActionText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function hasPositiveKeywordMatch(response: string, keyword: string) {
  const phrase = normalizeActionText(keyword);
  if (!phrase) return false;
  const clauses = response
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
    .split(/[.!?;,\n]+|\b(?:but|however|although|except|unless)\b/g);
  const negation = /(?:^|\s)(?:no|not|never|without|avoid|avoids|avoiding|withhold|withholds|withheld|cannot|can t|do not|does not|did not|should not|must not|will not|would not|don t|doesn t|didn t|shouldn t|mustn t|won t)(?:\s+\w+){0,6}$/;
  return clauses.some(clause => {
    const normalized = normalizeActionText(clause);
    const padded = ` ${normalized} `;
    let index = padded.indexOf(` ${phrase} `);
    while (index >= 0) {
      const before = padded.slice(0, index).trim().replace(/\bnot only\b/g, '').split(/\s+/).slice(-8).join(' ');
      if (!negation.test(before)) return true;
      index = padded.indexOf(` ${phrase} `, index + phrase.length + 2);
    }
    return false;
  });
}

export function resolveKeywordResponse(actions: PackAction[], response: string) {
  const matchedActions = actions.filter(action =>
    !action.responseFallback && action.answerKeywords?.some(keyword => hasPositiveKeywordMatch(response, keyword)),
  );
  const correctActions = matchedActions.filter(action => action.classification === 'optimal' || action.classification === 'acceptable');
  const candidates = correctActions.length ? correctActions : matchedActions;
  const rank: Record<PackAction['classification'], number> = { optimal: 0, acceptable: 1, incorrect: 2, dangerous: 3 };
  const selected = [...candidates].sort((a, b) => rank[a.classification] - rank[b.classification])[0]
    ?? actions.find(action => action.responseFallback);
  if (!selected) throw new Error('This keyword-written step has no authored responseFallback action.');
  const matchedKeywords = (selected.answerKeywords ?? []).filter(keyword => hasPositiveKeywordMatch(response, keyword));
  return { action: selected, matchedKeywords, correct: correctActions.length > 0 };
}

export function parseCasePack(raw: string): CasePack {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('Invalid JSON. Check commas, quotation marks and brackets.'); }
  const result = casePackSchema.safeParse(data);
  if (!result.success) throw new Error(result.error.issues.slice(0, 15).map(i => `${i.path.join('.') || 'file'}: ${i.message}`).join('\n'));
  return result.data;
}