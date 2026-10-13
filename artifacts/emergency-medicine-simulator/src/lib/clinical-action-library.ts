import { actionCategories, type PackAction, type PackCase } from './case-pack';

export type ActionCategory = (typeof actionCategories)[number];
type StepKind = PackCase['steps'][number]['kind'];

export const actionCategoryLabels: Record<ActionCategory, string> = {
  assess: 'Assess',
  history: 'History',
  examine: 'Examine',
  investigate: 'Investigate',
  treat: 'Treat',
  procedure: 'Procedures',
  consult: 'Call / Consult',
  disposition: 'Disposition',
};

// A general request catalogue, deliberately independent of each case's hidden answer key.
export type ClinicalActionLibraryItem = { category: ActionCategory; label: string };
export const clinicalActionLibrary: ClinicalActionLibraryItem[] = [
  { category: 'assess', label: 'Assess airway' },
  { category: 'assess', label: 'Assess breathing' },
  { category: 'assess', label: 'Assess circulation' },
  { category: 'assess', label: 'Assess mental status / GCS' },
  { category: 'assess', label: 'Repeat vital signs' },
  { category: 'assess', label: 'Perform ABCDE reassessment' },
  { category: 'history', label: 'Obtain focused history' },
  { category: 'history', label: 'Review current medications' },
  { category: 'history', label: 'Check allergies' },
  { category: 'history', label: 'Obtain collateral history' },
  { category: 'examine', label: 'Perform focused physical examination' },
  { category: 'examine', label: 'Perform focused neurologic examination' },
  { category: 'examine', label: 'Assess swallow safety' },
  { category: 'investigate', label: 'Check bedside glucose' },
  { category: 'investigate', label: 'Obtain a 12-lead ECG' },
  { category: 'investigate', label: 'Order a complete blood count' },
  { category: 'investigate', label: 'Check electrolytes and renal function' },
  { category: 'investigate', label: 'Obtain a blood gas' },
  { category: 'investigate', label: 'Request indicated imaging' },
  { category: 'investigate', label: 'Obtain urinalysis' },
  { category: 'investigate', label: 'Check troponin' },
  { category: 'treat', label: 'Give oxygen' },
  { category: 'treat', label: 'Give IV fluids' },
  { category: 'treat', label: 'Give medication according to protocol' },
  { category: 'treat', label: 'Give oral carbohydrate' },
  { category: 'treat', label: 'Give IV dextrose' },
  { category: 'treat', label: 'Start antibiotics' },
  { category: 'treat', label: 'Treat pain' },
  { category: 'treat', label: 'Treat nausea' },
  { category: 'procedure', label: 'Establish IV access' },
  { category: 'procedure', label: 'Place the patient on a cardiac monitor' },
  { category: 'procedure', label: 'Perform an airway intervention' },
  { category: 'procedure', label: 'Control bleeding' },
  { category: 'procedure', label: 'Immobilize an injury' },
  { category: 'consult', label: 'Call a senior emergency clinician' },
  { category: 'consult', label: 'Consult an appropriate specialist' },
  { category: 'consult', label: 'Activate the resuscitation team' },
  { category: 'disposition', label: 'Reassess treatment response' },
  { category: 'disposition', label: 'Arrange hospital admission' },
  { category: 'disposition', label: 'Plan discharge and follow-up' },
  { category: 'disposition', label: 'Arrange transfer to a higher level of care' },
];

export function findActionMatch(actions: PackAction[], request: string): PackAction[] {
  const normalized = normalize(request);
  if (!normalized) return [];
  return actions.filter(action =>
    [action.text, ...(action.synonyms ?? [])].some(phrase => normalize(phrase) === normalized),
  );
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function categoryForAction(kind: StepKind, actionOrText: PackAction | string): ActionCategory {
  if (typeof actionOrText !== 'string' && actionOrText.category) return actionOrText.category;
  const text = typeof actionOrText === 'string' ? actionOrText : actionOrText.text;
  const value = text.toLowerCase();
  if (/\b(call|consult|specialist|senior clinician|resuscitation team)\b/.test(value)) return 'consult';
  if (/\b(discharge|admit|admission|disposition|transfer|observation)\b/.test(value)) return 'disposition';
  if (/\b(procedure|intubat|insert|establish iv|catheter|reduc|splint|drain|suture)\b/.test(value)) return 'procedure';
  if (/\b(history|ask about|collateral|medication history)\b/.test(value)) return 'history';
  if (/\b(examin|swallow|neurologic|physical exam)\b/.test(value)) return 'examine';
  if (/\b(glucose|ecg|electrocardiogram|cbc|fbc|electrolyte|blood gas|abg|vbg|imaging|x.?ray|ct|mri|investigat|test|troponin|result)\b/.test(value)) return 'investigate';
  if (/\b(treat|give |administer|oxygen|fluid|antibiotic|medication|carbohydrate|dextrose|insulin|analgesi|pain relief)\b/.test(value)) return 'treat';
  if (/\b(assess|reassess|airway|breath|circulation|vital|gcs|monitor|repeat)\b/.test(value)) return 'assess';
  return ({
    assessment: 'assess',
    history: 'history',
    examination: 'examine',
    investigation: 'investigate',
    management: 'treat',
    reassessment: 'assess',
    disposition: 'disposition',
  } satisfies Record<StepKind, ActionCategory>)[kind];
}