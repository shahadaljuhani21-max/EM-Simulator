import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCasePack, resolveKeywordResponse, shouldShowImmediateDecisionFeedback, type CasePack } from '../src/lib/case-pack';
import { buildActionReview, hasCompletedReassessment } from '../src/lib/action-review';
import { categoryForAction } from '../src/lib/clinical-action-library';
import catalog from '../src/data/official-objectives.json';

const raw = readFileSync(new URL('../public/EM_CASE_PACK_TEMPLATE_v1.json', import.meta.url), 'utf8');
const fresh = () => JSON.parse(raw) as CasePack;
test('objective mappings validate both directions and preserve legacy imports', () => {
  const legacy = fresh();
  delete legacy.objectiveCoverage;
  legacy.topics.forEach(t => t.cases.forEach(c => {
    delete c.objectiveMappings;
    delete c.responseMode;
    c.steps.forEach(step => step.actions.forEach(action => {
      delete action.answerKeywords;
      delete action.responseFallback;
    }));
  }));
  assert.equal(parseCasePack(JSON.stringify(legacy)).objectiveCoverage, undefined);
  invalid(p => { p.topics[0].cases[0].objectiveMappings![0].stepIds = ['missing']; }, /Mapped decision/);
  invalid(p => { p.objectiveCoverage!.items[0].caseIds = ['unknown-case']; }, /Mapping|coverage case/);
  invalid(p => { p.topics[0].cases[0].objectiveMappings![0].objectiveId = 'unknown-objective'; }, /Unknown objective/);
  invalid(p => { p.objectiveCoverage!.items[0].status = 'intentionally_not_applicable'; }, /status|not-applicable/);
  invalid(p => { delete p.topics[0].cases[0].objectiveMappings; }, /Each case/);
});
test('official source coverage audits the entire catalog and prevents false full-course scope', () => {
  assert.equal(catalog.topics.length, 38);
  assert.equal(catalog.courseOutcomes.length, 7);
  assert.equal(catalog.topics.flatMap(t => t.objectives).length, 202);
  const p = fresh();
  const topic = catalog.topics.find(t => t.id === 'EMED615-T22')!;
  p.topics[0].id = topic.id;
  p.objectiveCoverage = {
    sourceId: catalog.sourceId, scope: 'selected_topics', topicIds: [topic.id],
    items: [...catalog.courseOutcomes, ...catalog.topics.flatMap(t => t.objectives)].map(o => ({
      objectiveId: o.id, text: o.text,
      status: topic.objectives.some(t => t.id === o.id) ? 'partially_covered' : 'intentionally_not_applicable',
      caseIds: topic.objectives.some(t => t.id === o.id) ? p.topics[0].cases.map(c => c.id) : [],
      note: 'Structural validation fixture only; no educational coverage claim.',
    })),
  };
  p.topics[0].cases.forEach(c => {
    c.objectiveMappings = topic.objectives.map(o => ({
      objectiveId: o.id, stepIds: ['reassessment'], review: 'Test review, not a medical coverage assertion.',
    }));
  });
  assert.ok(parseCasePack(JSON.stringify(p)));
  p.objectiveCoverage.scope = 'full_course';
  assert.throws(() => parseCasePack(JSON.stringify(p)), /every official topic/);
  p.objectiveCoverage.scope = 'selected_topics';
  p.objectiveCoverage.items.pop();
  assert.throws(() => parseCasePack(JSON.stringify(p)), /all official objectives/);
});
test('self-contained Creator embeds current schema, complete template and the three-level authoring audit', () => {
  const creator = readFileSync(new URL('../public/EM_CASE_PACK_AI_CREATOR_v1.md', import.meta.url), 'utf8');
  const blocks = [...creator.matchAll(/```json\n([\s\S]*?)```/g)].map(m => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0], JSON.parse(readFileSync(new URL('../public/EM_CASE_PACK_SCHEMA_v1.json', import.meta.url), 'utf8')));
  assert.deepEqual(blocks[1], fresh());
  assert.equal(parseCasePack(JSON.stringify(blocks[1])).topics[0].cases.length, 2);
  for (const question of [
    'Guided: Is there enough information to teach the learner how to reason through this?',
    'Independent: Can the learner reasonably manage this without receiving a hint?',
    'Challenge: Can the simulator evaluate the learner without revealing the answer beforehand?',
  ]) assert.ok(creator.includes(question));
  assert.ok(creator.includes('responseMode'));
  assert.ok(creator.includes('answerKeywords'));
  assert.ok(creator.includes('responseFallback'));
  assert.ok(creator.includes('does not automatically infer every missed action'));
  assert.ok(creator.includes('Clinical difficulty'));
  assert.ok(creator.includes('after every submitted answer in Guided, Independent and Challenge'));
});
function invalid(change: (p: CasePack) => void, message: RegExp) {
  const p = fresh(); change(p);
  assert.throws(() => parseCasePack(JSON.stringify(p)), message);
}
test('hypoglycemia template validates, follows the ED priority sequence and separates the two clinical presentations', () => {
  const p = parseCasePack(raw);
  assert.equal(p.objectiveCoverage?.sourceId, catalog.sourceId);
  assert.deepEqual(p.objectiveCoverage?.topicIds, ['EMED615-T22']);
  assert.equal(p.topics[0].cases.length, 2);
  assert.equal(new Set(p.topics[0].cases[0].steps.map(s => s.kind)).size, 7);
  assert.equal(new Set(p.topics[0].cases[0].steps.flatMap(s => s.actions.map(a => a.classification))).size, 4);
  const [missedMeal, activityLow] = p.topics[0].cases;
  assert.deepEqual(missedMeal.steps.map(s => s.id), ['assessment', 'investigation', 'examination', 'management', 'reassessment', 'history', 'disposition']);
  assert.deepEqual(activityLow.steps.map(s => s.id), ['assessment', 'investigation', 'examination', 'management', 'reassessment', 'history', 'disposition']);
  assert.equal(missedMeal.difficulty, 'beginner');
  assert.equal(activityLow.difficulty, 'intermediate');
  assert.match(missedMeal.steps.find(s => s.id === 'examination')!.actions.find(a => a.id === 'swallow')!.reveals[0].text, /swallows safely/);
  assert.match(activityLow.steps.find(s => s.id === 'examination')!.actions.find(a => a.id === 'swallow')!.reveals[0].text, /cannot follow commands or safely swallow/);
  const mildTreatment = missedMeal.steps.find(s => s.id === 'management')!.actions;
  assert.equal(mildTreatment.find(a => a.id === 'oral')!.classification, 'optimal');
  assert.equal(mildTreatment.find(a => a.id === 'iv')!.classification, 'acceptable');
  const severeTreatment = activityLow.steps.find(s => s.id === 'management')!.actions;
  assert.equal(severeTreatment.find(a => a.id === 'iv')!.classification, 'optimal');
  assert.equal(severeTreatment.find(a => a.id === 'glucagon')!.classification, 'acceptable');
  assert.equal(severeTreatment.find(a => a.id === 'oral-unsafe')!.classification, 'dangerous');
  assert.match(activityLow.steps.find(s => s.id === 'history')!.actions.find(a => a.id === 'focused-history')!.reveals[1].text, /sulfonylurea.*kidney disease|kidney disease.*sulfonylurea/i);
  assert.equal(activityLow.steps.find(s => s.id === 'disposition')!.actions.find(a => a.id === 'admit-risk')!.classification, 'optimal');
  assert.equal(activityLow.steps.find(s => s.id === 'disposition')!.actions.find(a => a.id === 'discharge-now')!.classification, 'dangerous');
  assert.equal(p.metadata?.verificationStatus, 'partially_verified');
  assert.ok(p.metadata?.referenceVerificationCompleted && p.metadata?.medicalContentChecked && p.metadata?.criticalManagementRechecked && p.metadata?.citationClaimsChecked);
  assert.equal(p.objectiveCoverage?.items.find(o => o.objectiveId === 'EMED615-T22-O01')?.status, 'covered');
  assert.equal(p.objectiveCoverage?.items.find(o => o.objectiveId === 'EMED615-T22-O02')?.status, 'covered');
  for (const id of ['EMED615-T22-O03', 'EMED615-T22-O04', 'EMED615-T22-O05', 'EMED615-T22-O06']) {
    assert.equal(p.objectiveCoverage?.items.find(o => o.objectiveId === id)?.status, 'partially_covered');
    for (const c of p.topics[0].cases) assert.ok(c.objectiveMappings?.some(m => m.objectiveId === id));
  }
  for (const c of p.topics[0].cases) {
    assert.equal(c.responseMode, 'keyword_written');
    for (const step of c.steps) {
      assert.equal(step.actions.filter(action => action.responseFallback).length, 1);
      assert.ok(step.actions.filter(action => !action.responseFallback).every(action => action.answerKeywords?.length));
    }
  }
});
test('written responses match whole phrases, count any correct keyword, and preserve the authored action', () => {
  const current = fresh().topics[0].cases[0];
  const investigation = current.steps.find(step => step.id === 'investigation')!;
  const glucose = resolveKeywordResponse(investigation.actions, 'I would check point-of-care glucose first.');
  assert.equal(glucose.action.id, 'glucose');
  assert.equal(glucose.correct, true);
  assert.deepEqual(glucose.matchedKeywords, ['point of care glucose']);

  const management = current.steps.find(step => step.id === 'management')!;
  const multipleMatches = resolveKeywordResponse(management.actions, 'Give IV glucose and oral glucose.');
  assert.equal(multipleMatches.action.id, 'oral');
  assert.equal(multipleMatches.correct, true);

  const dangerous = resolveKeywordResponse(management.actions, 'Give additional insulin.');
  assert.equal(dangerous.action.id, 'insulin');
  assert.equal(dangerous.correct, false);

  const negated = resolveKeywordResponse(management.actions, 'Do not give oral glucose.');
  assert.equal(negated.action.responseFallback, true);
  assert.equal(negated.correct, false);
  assert.deepEqual(negated.matchedKeywords, []);
  assert.equal(resolveKeywordResponse(management.actions, "I don't think I should give oral glucose.").action.responseFallback, true);

  const substringOnly = resolveKeywordResponse(investigation.actions, 'Check capillary.');
  assert.equal(substringOnly.action.responseFallback, true);
  assert.equal(substringOnly.correct, false);
});
test('keyword-written answers reveal their result and explanation after submission in every level', () => {
  for (const mode of ['guided', 'independent', 'challenge'] as const) {
    assert.equal(shouldShowImmediateDecisionFeedback(mode, 'keyword_written'), true);
  }
  assert.equal(shouldShowImmediateDecisionFeedback('guided'), true);
  assert.equal(shouldShowImmediateDecisionFeedback('independent'), false);
  assert.equal(shouldShowImmediateDecisionFeedback('challenge'), false);
});
test('keyword-written schema requires a single safe fallback and unique action keywords; legacy packs remain valid', () => {
  invalid(p => { delete p.topics[0].cases[0].responseMode; }, /responseMode/);
  invalid(p => { p.topics[0].cases[0].steps[0].actions.find(a => a.responseFallback)!.unsafe = true; }, /response fallback/);
  invalid(p => { p.topics[0].cases[0].steps[0].actions.find(a => a.responseFallback)!.responseFallback = false; }, /exactly one responseFallback/);
  invalid(p => {
    const actions = p.topics[0].cases[0].steps[0].actions;
    const action = actions.find(a => !a.responseFallback)!;
    action.answerKeywords!.push(action.answerKeywords![0]);
  }, /unique across actions/);
  const legacy = fresh();
  legacy.topics.forEach(topic => topic.cases.forEach(c => {
    delete c.responseMode;
    c.steps.forEach(step => step.actions.forEach(action => {
      delete action.answerKeywords;
      delete action.responseFallback;
    }));
  }));
  assert.equal(parseCasePack(JSON.stringify(legacy)).topics[0].cases[0].responseMode, undefined);
});
test('player action categories stay broad and the final review uses existing pack metadata', () => {
  assert.equal(categoryForAction('investigation', 'Obtain rapid capillary glucose result'), 'investigate');
  assert.equal(categoryForAction('management', 'Give oral carbohydrate'), 'treat');
  assert.equal(categoryForAction('history', 'Ask about current medicines'), 'history');

  const current = structuredClone(fresh().topics[0].cases[0]);
  delete current.interactionModel;
  delete current.responseMode;
  delete current.criticalActionGroups;
  current.steps.forEach(step => step.actions.forEach(action => {
    delete action.answerKeywords;
    delete action.responseFallback;
  }));
  const assessment = current.steps.find(step => step.id === 'assessment')!;
  const unsafeChoice = assessment.actions.find(action => action.classification === 'dangerous')!;
  const review = buildActionReview(current, [{ stepId: assessment.id, prompt: assessment.prompt, action: unsafeChoice }]);
  assert.equal(review.unsafe.length, 1);
  assert.equal(review.wellDone.length, 0);
  assert.equal(review.missedCritical.length, 0);
  assert.equal(review.potentialMissed.length, 1);
  assert.equal(review.potentialMissed[0].action.feedback, assessment.actions.find(action => action.classification === 'optimal')!.feedback);

  const reassessment = current.steps.find(step => step.kind === 'reassessment')!;
  const appropriateReassessment = reassessment.actions.find(action => action.classification === 'optimal')!;
  const inadequateReassessment = reassessment.actions.find(action => action.classification === 'incorrect')!;
  assert.equal(hasCompletedReassessment(current, [{ stepId: reassessment.id, prompt: reassessment.prompt, action: appropriateReassessment }]), true);
  assert.equal(hasCompletedReassessment(current, [{ stepId: reassessment.id, prompt: reassessment.prompt, action: inadequateReassessment }]), false);

  const actionBased = structuredClone(current);
  actionBased.interactionModel = 'action_based';
  actionBased.steps.forEach(step => step.actions.forEach(action => { action.critical = false; }));
  const criticalAction = actionBased.steps.find(step => step.id === 'assessment')!.actions.find(action => action.classification === 'optimal')!;
  criticalAction.critical = true;
  actionBased.criticalActionGroups = [{ id: 'critical-group', label: 'Critical action group', actionIds: [criticalAction.id] }];
  const metadataReview = buildActionReview(actionBased, [{ stepId: assessment.id, prompt: assessment.prompt, action: unsafeChoice }]);
  assert.deepEqual(metadataReview.missedCritical, [{
    id: 'critical-group',
    text: `Critical action group: ${criticalAction.text}`,
    rationale: `${criticalAction.text}: ${criticalAction.feedback}`,
  }]);
  assert.equal(categoryForAction('assessment', { ...criticalAction, category: 'procedure' }), 'procedure');
});
test('invalid JSON and incompatible versions fail explicitly', () => {
  assert.throws(() => parseCasePack('{'), /Invalid JSON/);
  assert.throws(() => parseCasePack('null'), /file/);
  assert.throws(() => parseCasePack(raw.replace('"1.0"', '"2.0"')), /schemaVersion/);
});
test('verification declarations must be consistent; legacy packs remain explicitly unreported', () => {
  const legacy = fresh(); delete legacy.metadata;
  assert.equal(parseCasePack(JSON.stringify(legacy)).metadata, undefined);
  invalid(p => { p.metadata!.verificationStatus = 'verified'; p.metadata!.citationClaimsChecked = false; }, /metadata/);
  invalid(p => { p.metadata!.verificationDate = '2099-01-01'; }, /future/);
  const p = fresh();
  p.metadata = { verificationStatus: 'verified', verificationDate: '2026-01-01', sourcesCrossChecked: ['Source A'], referenceVerificationCompleted: true, medicalContentChecked: true, criticalManagementRechecked: true, citationClaimsChecked: true, sourceNotes: [] };
  assert.throws(() => parseCasePack(JSON.stringify(p)), /single-source/);
  p.metadata.sourceNotes = ['Only one applicable authoritative source was accessible.'];
  assert.equal(parseCasePack(JSON.stringify(p)).metadata!.verificationStatus, 'verified');
});
test('requires exactly two cases and nonempty pack', () => {
  invalid(p => { p.topics[0].cases.pop(); }, /exactly 2 cases/);
  invalid(p => { p.topics = []; }, /topics/);
});
test('rejects duplicates, missing fields and unsupported fields', () => {
  invalid(p => { p.topics[0].cases[1].id = p.topics[0].cases[0].id; }, /unique/);
  invalid(p => { p.topics[0].cases[0].steps[1].id = 'assessment'; }, /unique/);
  invalid(p => { p.topics[0].cases[0].steps[0].actions[1].id = 'abcde'; }, /unique/);
  assert.throws(() => parseCasePack(raw.replace('"complaint":', '"notSupported":')), /complaint|Unrecognized/);
});
test('rejects invalid progression, unreachable steps, trapped loops and early completion', () => {
  invalid(p => { p.topics[0].cases[0].initialStepId = 'missing'; }, /Initial step/);
  invalid(p => { p.topics[0].cases[0].steps[0].actions[0].nextStepId = 'missing'; }, /Next step/);
  invalid(p => { p.topics[0].cases[0].steps[0].actions[0].nextStepId = null; }, /Only a disposition/);
  invalid(p => { p.topics[0].cases[0].steps[0].actions.forEach(a => { a.nextStepId = 'assessment'; }); }, /reachable|route/);
  invalid(p => { p.topics[0].cases[0].steps.at(-1)!.actions.forEach(a => { a.nextStepId = 'disposition'; }); }, /route/);
});
test('optimal branches complete both examples, with revealed findings and corrected vitals', () => {
  for (const c of parseCasePack(raw).topics[0].cases) {
    let next: string | null = c.initialStepId;
    const findings = [];
    const vitals = new Map(c.vitalSigns.map(v => [v.label, v.value]));
    let count = 0;
    while (next) {
      assert.ok(count++ < 20);
      const step = c.steps.find(s => s.id === next)!;
      const choice = step.actions.find(a => a.classification === 'optimal')!;
      findings.push(...step.findings, ...choice.reveals);
      choice.patientChanges.vitalSigns?.forEach(v => vitals.set(v.label, v.value));
      next = choice.nextStepId;
      if (!next) assert.equal(step.kind, 'disposition');
    }
    assert.equal(count, 7);
    assert.equal(vitals.get('Blood glucose'), c.id === 'missed-meal' ? '4.2 mmol/L (76 mg/dL)' : '4.3 mmol/L (77 mg/dL)');
    assert.equal(new Set(findings.map(f => f.category)).size, 4);
  }
});
test('pack storage retains catalog on failed replacement and tracks mode-specific results without duplicate cases', async () => {
  const memory = new Map<string, string>();
  let full = false;
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => { if (full) throw new Error('quota'); memory.set(k, v); },
    },
    window: { dispatchEvent: () => true },
  });
  const store = await import('../src/lib/case-pack-store');
  const p = parseCasePack(raw);
  const c = p.topics[0].cases[0];
  const decisions = c.steps.map(s => ({ stepId: s.id, prompt: s.prompt, action: s.actions[0] }));
  const actionBasedCase = structuredClone(c);
  actionBasedCase.interactionModel = 'action_based';
  assert.equal(store.calculateClinicalScore(actionBasedCase, decisions), 100);
  const assessment = c.steps.find(step => step.id === 'assessment')!;
  const unsafeAction = assessment.actions.find(action => action.classification === 'dangerous')!;
  assert.ok(store.calculateClinicalScore(actionBasedCase, [{ stepId: assessment.id, prompt: assessment.prompt, action: unsafeAction }]) < 100);
  store.installCasePack(p);
  assert.equal(store.casesByLevel.guided, store.casesByLevel.challenge);
  const originalKey = store.progressStorageKey();
  assert.equal(store.recordAttempt(c, 'guided', decisions).score, '100 / 100');
  store.recordAttempt(c, 'guided', decisions);
  store.recordAttempt(c, 'challenge', decisions);
  const progress = JSON.parse(memory.get(originalKey)!);
  assert.equal(progress.completedCases.length, 2);
  assert.equal(progress.completedCaseIds.length, 1);
  const changed = fresh(); changed.title += ' revised';
  full = true;
  assert.throws(() => store.installCasePack(changed), /previous pack is unchanged/);
  assert.equal(store.progressStorageKey(), originalKey);
  full = false;
  store.installCasePack(changed);
  assert.notEqual(store.progressStorageKey(), originalKey);
  store.installCasePack(p);
  assert.equal(store.progressStorageKey(), originalKey);
  assert.equal(JSON.parse(memory.get(originalKey)!).completedCases.length, 2);
});