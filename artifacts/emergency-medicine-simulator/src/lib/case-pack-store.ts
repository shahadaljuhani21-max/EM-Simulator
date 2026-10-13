import { useSyncExternalStore } from 'react';
import { parseCasePack, type CasePack, type PackCase, type Mode, type Decision } from './case-pack';
import { hasCompletedReassessment } from './action-review';

const storageKey = 'emc-case-pack-v1';
const listeners = new Set<() => void>();
let state: { pack: CasePack | null; error: string | null } = { pack: null, error: null };
export let lectureNames: string[] = [];
export let allCases: ReturnType<typeof catalogCase>[] = [];
export let casesByLevel = { guided: allCases, independent: allCases, challenge: allCases };
let namespace = 'empty';

function catalogCase(c: PackCase, lecture: string) {
  return {
    id: c.id, levelId: 'guided' as Mode, lecture, title: c.title,
    triage: c.initialPresentation.complaint, appearance: c.initialPresentation.appearance,
    initialCondition: c.initialPresentation.condition, initialVitals: c.vitalSigns, rules: [],
    feedback: {
      diagnosis: c.endOfCaseSummary.diagnosis, timeline: [] as string[], wellDone: [] as string[],
      missed: [] as string[], unnecessary: [] as string[], unobtained: [] as string[],
      idealApproach: c.endOfCaseSummary.idealApproach, learningPoints: c.endOfCaseSummary.learningPoints,
      reference: c.endOfCaseSummary.references.join('\n'), score: '0 / 100',
    },
  };
}
function apply(pack: CasePack | null) {
  state = { pack, error: null };
  lectureNames = pack?.topics.map(t => t.title) ?? [];
  allCases = pack?.topics.flatMap(t => t.cases.map(c => catalogCase(c, t.title))) ?? [];
  // All modes share one catalog; the engine controls support, not case copies.
  casesByLevel = { guided: allCases, independent: allCases, challenge: allCases };
  let hash = 2166136261;
  for (const char of JSON.stringify(pack)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  namespace = pack ? `${pack.packId}-${(hash >>> 0).toString(16)}` : 'empty';
}
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) apply(parseCasePack(saved));
} catch (error) { state = { pack: null, error: `Saved pack could not be loaded: ${String(error)}` }; }

export const progressStorageKey = () => `emc-pack-progress-v1-${namespace}`;
export const lectureStorageKey = () => `emc-pack-lectures-v1-${namespace}`;
export const packIdentity = () => namespace;
export function useCasePack() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);
}
export function installCasePack(pack: CasePack) {
  // Persist before changing UI: quota/storage failures leave the previous pack intact.
  try { localStorage.setItem(storageKey, JSON.stringify(pack)); }
  catch { throw new Error('The pack could not be saved in this browser. Free browser storage or enable local storage, then try again. The previous pack is unchanged.'); }
  apply(pack);
  listeners.forEach(l => l());
  window.dispatchEvent(new Event('emc-progress-updated'));
}

const classificationScore = { optimal: 1, acceptable: 0.7, incorrect: 0, dangerous: 0 } as const;

export function calculateClinicalScore(c: PackCase, decisions: Decision[]) {
  const decisionQuality = decisions.length
    ? decisions.reduce((sum, decision) => sum + classificationScore[decision.action.classification], 0) / decisions.length
    : 0;
  if (c.interactionModel !== 'action_based') return Math.round(decisionQuality * 100);

  const components = [decisionQuality];
  const allActions = [...new Map(c.steps.flatMap(step => step.actions).map(action => [action.id, action])).values()];
  const completedIds = new Set(decisions.map(decision => decision.action.id));
  const groups = c.criticalActionGroups ?? [];
  const groupedIds = new Set(groups.flatMap(group => group.actionIds));
  const individualCritical = allActions.filter(action => action.critical && !groupedIds.has(action.id));
  const criticalTotal = individualCritical.length + groups.length;
  if (criticalTotal > 0) {
    const completedCritical = individualCritical.filter(action => completedIds.has(action.id)).length
      + groups.filter(group => group.actionIds.some(id => completedIds.has(id))).length;
    components.push(completedCritical / criticalTotal);
  }

  const firstDecisionIndex = new Map<string, number>();
  decisions.forEach((decision, index) => {
    if (!firstDecisionIndex.has(decision.action.id)) firstDecisionIndex.set(decision.action.id, index);
  });
  const activeSequenceRules = allActions.flatMap(action =>
    (action.mustPrecedeActionIds ?? [])
      .filter(laterId => firstDecisionIndex.has(laterId))
      .map(laterId => [action.id, laterId] as const),
  );
  if (activeSequenceRules.length > 0) {
    const satisfiedRules = activeSequenceRules.filter(([earlierId, laterId]) => {
      const earlierIndex = firstDecisionIndex.get(earlierId);
      const laterIndex = firstDecisionIndex.get(laterId);
      return earlierIndex !== undefined && laterIndex !== undefined && earlierIndex < laterIndex;
    }).length;
    components.push(satisfiedRules / activeSequenceRules.length);
  }

  if (decisions.length > 0) {
    const unnecessaryCount = decisions.filter(decision => decision.action.unnecessary).length;
    const unsafeCount = decisions.filter(decision => decision.action.unsafe || decision.action.classification === 'dangerous').length;
    components.push(1 - unnecessaryCount / decisions.length);
    components.push(1 - unsafeCount / decisions.length);
  }

  const reassessmentRequired = c.steps.some(step =>
    step.kind === 'reassessment' || step.actions.some(action => action.reassessment),
  );
  if (reassessmentRequired) components.push(hasCompletedReassessment(c, decisions) ? 1 : 0);

  const dispositionStepIds = new Set(c.steps.filter(step => step.kind === 'disposition').map(step => step.id));
  if (dispositionStepIds.size > 0) {
    const dispositionDecision = [...decisions].reverse().find(decision => dispositionStepIds.has(decision.stepId));
    components.push(dispositionDecision ? classificationScore[dispositionDecision.action.classification] : 0);
  }

  const writtenResponses = decisions.filter(decision => decision.responseCorrect !== undefined);
  if (writtenResponses.length > 0) {
    components.push(writtenResponses.filter(decision => decision.responseCorrect).length / writtenResponses.length);
  }

  return Math.round(components.reduce((sum, value) => sum + value, 0) / components.length * 100);
}

export function recordAttempt(c: PackCase, mode: Mode, decisions: Decision[]) {
  const raw = localStorage.getItem(progressStorageKey());
  const progress = raw ? JSON.parse(raw) : { completedCaseIds: [], completedCases: [], lectureStatuses: {} };
  const byClass = (classification: string) => decisions.filter(d => d.action.classification === classification).map(d => `${d.action.text}: ${d.action.feedback}`);
  const feedback = {
    diagnosis: c.endOfCaseSummary.diagnosis,
    timeline: decisions.map(d => [
      d.writtenResponse === undefined ? null : `Your response: ${d.writtenResponse}`,
      d.responseCorrect === undefined ? null : `Keyword result: ${d.responseCorrect ? 'correct' : 'no correct keyword matched'}`,
      `Action: ${d.action.text} — ${d.action.consequence}`,
    ].filter(Boolean).join('\n')),
    wellDone: byClass('optimal'), acceptable: byClass('acceptable'),
    missed: byClass('incorrect'), unsafe: byClass('dangerous'), unnecessary: [], unobtained: [],
    idealApproach: `${c.endOfCaseSummary.summary}\n${c.endOfCaseSummary.idealApproach}\nDisposition: ${c.endOfCaseSummary.disposition}`,
    learningPoints: c.endOfCaseSummary.learningPoints,
    reference: c.endOfCaseSummary.references.join('\n'),
    score: `${calculateClinicalScore(c, decisions)} / 100`,
  };
  const entry = { caseId: c.id, levelId: mode, lecture: state.pack?.topics.find(t => t.cases.some(item => item.id === c.id))?.title ?? '', title: c.title, completedAt: new Date().toISOString(), feedback };
  progress.completedCaseIds = [...new Set([...progress.completedCaseIds, c.id])];
  progress.completedCases = [...progress.completedCases.filter((p: { caseId: string; levelId: string }) => p.caseId !== c.id || p.levelId !== mode), entry];
  localStorage.setItem(progressStorageKey(), JSON.stringify(progress));
  window.dispatchEvent(new Event('emc-progress-updated'));
  return feedback;
}