type ApiVitals = {
  heartRate: number;
  bloodPressure: { systolic: number; diastolic: number };
  respiratoryRate: number;
  oxygenSaturation: number;
  temperatureC: number;
  gcs: number;
  rhythm?: string;
};

type Matchers = { phrases: string[]; abbreviations?: string[] };

export type ApiCase = {
  caseId: string;
  level: 'guided' | 'independent' | 'challenge';
  lecture: string;
  status: 'draft' | 'review' | 'published' | 'inactive';
  metadata: { internalTitle: string; finalDiagnosis: string };
  opening: { triageStatement: string; visibleAppearance: string[]; initialVitals: ApiVitals; initialStateId: string };
  hiddenInformation: {
    history: Array<{ findingId: string; promptMatchers: Matchers; response: string; availableFromStateIds: string[] }>;
    examination: Array<{ findingId: string; promptMatchers: Matchers; response: string; availableFromStateIds: string[] }>;
  };
  investigations: Array<{ investigationId: string; name: string; requestMatchers: Matchers; result: string; availableFromStateIds: string[] }>;
  actions: Array<{
    actionId: string; label: string; matchers: Matchers; allowedFromStateIds: string[]; response: string;
    nextStateId?: string | null; onceOnly?: boolean; scoreEvents: Array<{ points: number }>;
  }>;
  states: Array<{ stateId: string; conditionSummary: string; vitals: ApiVitals; automaticMessage?: string }>;
  scoring: { maximumScore: number };
  feedback: {
    finalDiagnosis: string; importantDifferentials: string[]; idealApproach: string[]; learningPoints: string[];
    criticalActionExplanations: Record<string, string>; unsafeActionExplanations: Record<string, string>;
  };
};

function vitalList(vitals: ApiVitals) {
  return [
    { label: 'Heart rate', value: `${vitals.heartRate} bpm`, tone: vitals.heartRate > 120 ? 'critical' : vitals.heartRate > 100 ? 'watch' : 'normal' },
    { label: 'Blood pressure', value: `${vitals.bloodPressure.systolic}/${vitals.bloodPressure.diastolic} mmHg`, tone: vitals.bloodPressure.systolic < 90 ? 'critical' : 'normal' },
    { label: 'Respiratory rate', value: `${vitals.respiratoryRate} /min`, tone: vitals.respiratoryRate > 24 ? 'watch' : 'normal' },
    { label: 'Oxygen saturation', value: `${vitals.oxygenSaturation}%`, tone: vitals.oxygenSaturation < 90 ? 'critical' : vitals.oxygenSaturation < 94 ? 'watch' : 'normal' },
    { label: 'Temperature', value: `${vitals.temperatureC} °C`, tone: vitals.temperatureC >= 38.5 ? 'watch' : 'normal' },
    { label: 'GCS', value: `${vitals.gcs} / 15`, tone: vitals.gcs < 15 ? 'watch' : 'normal' },
  ];
}

function keywords(matchers: Matchers) {
  return [...matchers.phrases, ...(matchers.abbreviations ?? [])].map((item) => item.toLowerCase());
}

export function adaptApiCase(caseData: ApiCase) {
  const stateMap = new Map(caseData.states.map((state) => [state.stateId, state]));
  const findings = [...caseData.hiddenInformation.history, ...caseData.hiddenInformation.examination].map((finding) => ({
    id: `finding-${finding.findingId}`,
    keywords: keywords(finding.promptMatchers),
    response: finding.response,
    allowedFromStateIds: finding.availableFromStateIds,
    onceOnly: true,
    scorePoints: 0,
  }));
  const investigations = caseData.investigations.map((investigation) => ({
    id: `investigation-${investigation.investigationId}`,
    keywords: keywords(investigation.requestMatchers),
    response: investigation.result,
    allowedFromStateIds: investigation.availableFromStateIds,
    onceOnly: true,
    scorePoints: 0,
  }));
  const actions = caseData.actions.map((action) => {
    const next = action.nextStateId ? stateMap.get(action.nextStateId) : undefined;
    return {
      id: action.actionId,
      keywords: keywords(action.matchers),
      response: action.response,
      allowedFromStateIds: action.allowedFromStateIds,
      nextStateId: action.nextStateId ?? undefined,
      onceOnly: action.onceOnly ?? false,
      scorePoints: action.scoreEvents.reduce((sum, event) => sum + event.points, 0),
      updatedVitals: next ? vitalList(next.vitals) : undefined,
      updatedCondition: next?.conditionSummary,
      reveal: next?.automaticMessage ? { label: 'Patient update', text: next.automaticMessage } : undefined,
    };
  });

  return {
    id: caseData.caseId,
    levelId: caseData.level,
    lecture: caseData.lecture,
    title: caseData.metadata.internalTitle,
    triage: caseData.opening.triageStatement,
    appearance: caseData.opening.visibleAppearance.join(' '),
    initialCondition: stateMap.get(caseData.opening.initialStateId)?.conditionSummary ?? caseData.opening.visibleAppearance.join(' '),
    initialStateId: caseData.opening.initialStateId,
    initialVitals: vitalList(caseData.opening.initialVitals),
    maximumScore: caseData.scoring.maximumScore,
    rules: [...actions, ...findings, ...investigations],
    feedback: {
      diagnosis: caseData.feedback.finalDiagnosis,
      timeline: ['The case began with the visible triage statement.', 'Requested findings and patient-state changes are recorded in the transcript.'],
      wellDone: Object.values(caseData.feedback.criticalActionExplanations),
      missed: ['Compare completed actions with the ideal approach below.'],
      unnecessary: Object.values(caseData.feedback.unsafeActionExplanations),
      unobtained: ['Any available history, examination, or investigation not requested remains unobtained.'],
      idealApproach: caseData.feedback.idealApproach.join(' '),
      learningPoints: caseData.feedback.learningPoints,
      score: `0 / ${caseData.scoring.maximumScore}`,
    },
  };
}

export async function fetchPublishedSimulatorCases() {
  const response = await fetch('/api/cases');
  if (!response.ok) throw new Error('Published cases could not be loaded.');
  const payload = await response.json() as { cases: ApiCase[] };
  return payload.cases.map(adaptApiCase);
}

export async function caseStudioRequest(path: string, adminKey: string, init?: RequestInit) {
  const response = await fetch(`/api/admin/cases${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminKey}`, ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string; errors?: string[]; invalid?: unknown };
    throw new Error([payload.error, ...(payload.errors ?? []), payload.invalid ? JSON.stringify(payload.invalid) : ''].filter(Boolean).join('\n'));
  }
  return response.status === 204 ? null : response.json();
}
