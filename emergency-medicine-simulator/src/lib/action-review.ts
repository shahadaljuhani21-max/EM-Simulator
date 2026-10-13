import type { Decision, PackAction, PackCase } from './case-pack';

function uniqueActions(actions: PackAction[]) {
  return [...new Map(actions.map(action => [action.id, action])).values()];
}

export function hasCompletedReassessment(current: PackCase, decisions: Decision[]) {
  return decisions.some(decision => {
    const step = current.steps.find(candidate => candidate.id === decision.stepId);
    const appropriateAction = decision.action.classification === 'optimal' || decision.action.classification === 'acceptable';
    return appropriateAction && (decision.action.reassessment || step?.kind === 'reassessment');
  });
}

export function buildActionReview(current: PackCase, decisions: Decision[]) {
  const allActions = uniqueActions(current.steps.flatMap(step => step.actions));
  const completedIds = new Set(decisions.map(decision => decision.action.id));
  const groups = current.criticalActionGroups ?? [];
  const groupedIds = new Set(groups.flatMap(group => group.actionIds));
  const actionById = new Map(allActions.map(action => [action.id, action]));
  const completedCritical = [
    ...allActions.filter(action => action.critical && !groupedIds.has(action.id) && completedIds.has(action.id)).map(action => action.text),
    ...groups.filter(group => group.actionIds.some(id => completedIds.has(id))).map(group => `${group.label}: ${group.actionIds.filter(id => completedIds.has(id)).map(id => allActions.find(action => action.id === id)?.text ?? id).join(' / ')}`),
  ];
  const missedCritical = [
    ...allActions
      .filter(action => action.critical && !groupedIds.has(action.id) && !completedIds.has(action.id))
      .map(action => ({ id: action.id, text: action.text, rationale: action.feedback })),
    ...groups
      .filter(group => !group.actionIds.some(id => completedIds.has(id)))
      .map(group => {
        const alternatives = group.actionIds.map(id => actionById.get(id)).filter((action): action is PackAction => !!action);
        return {
          id: group.id,
          text: `${group.label}: ${alternatives.map(action => action.text).join(' or ')}`,
          rationale: alternatives.map(action => `${action.text}: ${action.feedback}`).join(' '),
        };
      }),
  ];
  const visitedSteps = current.steps.filter(step => decisions.some(decision => decision.stepId === step.id));
  const optimalTakenSteps = new Set(decisions
    .filter(decision => decision.action.classification === 'optimal')
    .map(decision => decision.stepId));
  const potentialMissed = visitedSteps.flatMap(step => {
    if (optimalTakenSteps.has(step.id)) return [];
    return step.actions
      .filter(action => action.classification === 'optimal' && !completedIds.has(action.id))
      .map(action => ({ stepId: step.id, action }));
  });
  const late = decisions.filter((decision, index) =>
    (decision.action.mustPrecedeActionIds ?? []).some(requiredLaterActionId =>
      decisions.slice(0, index).some(earlier => earlier.action.id === requiredLaterActionId),
    ),
  );

  return {
    wellDone: decisions.filter(decision => decision.action.classification === 'optimal'),
    acceptable: decisions.filter(decision => decision.action.classification === 'acceptable'),
    completedCritical: current.interactionModel === 'action_based' ? completedCritical : [],
    missedCritical: current.interactionModel === 'action_based' ? missedCritical : [],
    potentialMissed,
    performedTooLate: late,
    optionalTaken: decisions.filter(decision => decision.action.optional),
    unnecessary: decisions.filter(decision => decision.action.unnecessary),
    unsafe: decisions.filter(decision => decision.action.unsafe || decision.action.classification === 'dangerous'),
  };
}