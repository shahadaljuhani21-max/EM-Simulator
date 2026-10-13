import { z } from 'zod/v4';
import catalog from '../data/official-objectives.json';

const id = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100);
const text = z.string().trim().min(1).max(10000);
export const objectiveMappingSchema = z.object({
  objectiveId: id,
  stepIds: z.array(id).min(1).max(100),
  review: text.describe('End-of-case explanation of how this objective was taught or assessed; not a claim of learner mastery.'),
}).strict();
export const objectiveCoverageSchema = z.object({
  sourceId: id,
  scope: z.enum(['full_course', 'selected_topics']),
  topicIds: z.array(id).min(1).max(100),
  items: z.array(z.object({
    objectiveId: id,
    text,
    status: z.enum(['covered', 'partially_covered', 'intentionally_not_applicable']),
    caseIds: z.array(id).max(200),
    note: text.describe('Coverage evidence, remaining gaps or a specific reason for non-applicability.'),
  }).strict()).min(1).max(500),
}).strict();

type Mapping = z.infer<typeof objectiveMappingSchema>;
type Pack = {
  objectiveCoverage?: z.infer<typeof objectiveCoverageSchema>;
  topics: { id: string; cases: { id: string; objectiveMappings?: Mapping[]; steps: { id: string }[] }[] }[];
};
export function validateObjectiveMapping(pack: Pack, issue: (path: (string | number)[], message: string) => void) {
  const coverage = pack.objectiveCoverage;
  const cases = pack.topics.flatMap(t => t.cases);
  if (!coverage) {
    if (cases.some(c => c.objectiveMappings)) issue(['objectiveCoverage'], 'Objective mappings require a coverage catalog');
    return; // Legacy packs remain compatible.
  }
  const entries = new Map(coverage.items.map(o => [o.objectiveId, o]));
  if (entries.size !== coverage.items.length) issue(['objectiveCoverage', 'items'], 'Objective IDs must be unique');
  if (new Set(coverage.topicIds).size !== coverage.topicIds.length) issue(['objectiveCoverage', 'topicIds'], 'Topic IDs must be unique');
  const packTopicIds = pack.topics.map(t => t.id);
  if (coverage.topicIds.length !== packTopicIds.length || coverage.topicIds.some(id => !packTopicIds.includes(id))) {
    issue(['objectiveCoverage', 'topicIds'], 'Coverage topic IDs must exactly match the pack topics');
  }
  pack.topics.forEach((t, ti) => t.cases.forEach((c, ci) => {
    const path = ['topics', ti, 'cases', ci, 'objectiveMappings'];
    if (!c.objectiveMappings?.length) { issue(path, 'Each case must map to at least one objective'); return; }
    if (new Set(c.objectiveMappings.map(m => m.objectiveId)).size !== c.objectiveMappings.length) issue(path, 'Case objective mappings must be unique');
    c.objectiveMappings.forEach((m, mi) => {
      const entry = entries.get(m.objectiveId);
      if (!entry) issue([...path, mi, 'objectiveId'], 'Unknown objective ID');
      else if (!entry.caseIds.includes(c.id) || entry.status === 'intentionally_not_applicable') {
        issue([...path, mi], 'Mapping must agree with objective coverage case IDs and status');
      }
      if (new Set(m.stepIds).size !== m.stepIds.length || m.stepIds.some(id => !c.steps.some(s => s.id === id))) {
        issue([...path, mi, 'stepIds'], 'Mapped decision steps must exist and must not repeat');
      }
    });
  }));
  coverage.items.forEach((o, i) => {
    const path = ['objectiveCoverage', 'items', i];
    if (new Set(o.caseIds).size !== o.caseIds.length) issue(path, 'Coverage case IDs must be unique');
    if (o.status === 'intentionally_not_applicable' ? o.caseIds.length !== 0 : o.caseIds.length === 0) {
      issue(path, 'Covered or partial objectives require cases; not-applicable objectives must not claim cases');
    }
    for (const caseId of o.caseIds) {
      if (!cases.find(c => c.id === caseId)?.objectiveMappings?.some(m => m.objectiveId === o.objectiveId)) {
        issue(path, 'Every coverage case must exist and map back to this objective');
      }
    }
  });
  if (coverage.sourceId === catalog.sourceId) {
    const official = [...catalog.courseOutcomes, ...catalog.topics.flatMap(t => t.objectives)];
    if (entries.size !== official.length || official.some(o => entries.get(o.id)?.text !== o.text)) {
      issue(['objectiveCoverage', 'items'], 'Official coverage must audit all official objectives and preserve their exact IDs and text');
    }
    const officialTopics = catalog.topics.map(t => t.id);
    if (coverage.topicIds.some(id => !officialTopics.includes(id))) issue(['objectiveCoverage', 'topicIds'], 'Unknown official topic');
    if (coverage.scope === 'full_course' && (coverage.topicIds.length !== officialTopics.length || officialTopics.some(id => !coverage.topicIds.includes(id)))) {
      issue(['objectiveCoverage', 'scope'], 'Full-course packs must include every official topic');
    }
    for (const topic of catalog.topics) {
      if (coverage.topicIds.includes(topic.id)) {
        for (const o of topic.objectives) {
          if (entries.get(o.id)?.status === 'intentionally_not_applicable') {
            issue(['objectiveCoverage', 'items'], `Included topic objective ${o.id} cannot be excluded as not applicable; report partial coverage honestly`);
          }
        }
      }
    }
  }
}