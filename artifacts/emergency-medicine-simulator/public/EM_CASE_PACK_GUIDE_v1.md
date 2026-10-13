# EM Case Pack authoring guide — schemaVersion "1.0"

Give this guide, EM_CASE_PACK_SCHEMA_v1.json and EM_CASE_PACK_TEMPLATE_v1.json to your case author or AI authoring tool. The template is a fully runnable file, not pseudocode. Replace its fictional content; do not change the field names. Have every clinical case reviewed by a qualified clinician before teaching with it.

## Permanent core sources and optional lectures

The normal workflow is **Download AI Case Pack Files** → extract the ZIP and attach its files to ChatGPT → optionally attach lectures → copy the short message → download ONE multi-case JSON → upload it to the simulator. Students never need to collect objectives or handle the schema separately.

The ZIP contains the self-contained Creator, official EMED615 objectives, the First Aid citation/original study-alignment guide and a readme. It does not contain the copyrighted textbook or administrative staff details. A citation is not access to the book: never claim unseen First Aid content was checked.

Source priority is official objectives for scope, current authoritative medical guidance for mandatory verification, designated First Aid study context for alignment, and optional lectures for additional instructor emphasis. Slides are never a prerequisite. The provided 2016 reference does not supersede current medical guidance.

## Structured objective mapping

New packs must include `objectiveCoverage`: `{sourceId, scope, topicIds, items}`. For the permanent catalog use sourceId `EMED615-2025`; scope is `full_course` or an explicitly requested `selected_topics`. Use official topic IDs for topics and topicIds. Full-course means 38 distinct topic groups and 76 cases. Identical source rows 12/13 are consolidated as documented; other source wording is retained.

Each item contains `{objectiveId, text, status, caseIds, note}`. Audit every supplied topic objective and course outcome, including exclusions. Preserve exact IDs/text. Status is `covered`, `partially_covered` or `intentionally_not_applicable`; describe evidence, gaps or non-applicability in note. Included-topic objectives cannot be excluded. Course outcomes about physical procedures/professional behavior may be only partially assessable here; do not claim practical competency from keyword-matched written responses.

Each case contains `objectiveMappings`: `[{objectiveId, stepIds, review}]`. This maps objectives to existing decision steps and an end-of-case objective review. Coverage case IDs and case mappings must agree in both directions. Do not expose objective-specific answer explanations before Challenge decisions; the mapping review appears only after completion.

Upload validation checks unique IDs, references, decision existence, bidirectional mapping, official catalog completeness and scope. It does not establish that the case truly teaches an objective, or that the learner mastered it. The coverage panel reports author declarations, not independent educational verification.

These fields are optional only for legacy packs. New AI-generated packs require them. The template's EXAMPLE mapping is deliberately not an official full-course claim: replace it, never copy it into a course pack.

## File and storage rules

- UTF-8 JSON file, .json extension, at most 2 MB. No comments, trailing commas, executable code, HTML, external asset requirements or extra fields.
- schemaVersion must be exactly "1.0". Future schema versions require an engine update.
- Every topic must have **exactly two cases**. Use one or more topics.
- Topic IDs and titles must be unique. Case IDs must be unique across the pack; step IDs within each case; action IDs within each step.
- IDs use letters, numbers, underscores and hyphens, up to 100 characters.
- One case definition works in Guided, Independent and Challenge. Never create learning-level-specific case copies or add Guided/Independent/Challenge properties.
- Uploaded packs and progress stay in the current browser. They are not uploaded to a server or synchronized across devices. Keep your JSON file as a backup. Do not include real patient information.
- Loading a different pack replaces the active library only after confirmation. Existing progress remains stored separately. Reuploading identical content restores its associated progress; modified content gets a separate progress record.

## Three learning levels, one clinical truth

Create exactly **two distinct clinical cases per lecture/topic**, not two cases per level. Each case is stored once and played unchanged in Guided, Independent and Challenge. Do not add level-specific patients, branches, doses or duplicate case definitions. Branches depend on clinical decisions, never on the learning level.

Learning level controls the amount and timing of educational assistance. Clinical difficulty is a separate case property: `difficulty` is `beginner`, `intermediate` or `advanced`. An advanced case can be played in Guided; a beginner case can be played in Challenge. Guided is not easier medicine and Challenge is not different or artificially harder medicine.

History, examination, diagnosis, investigation results, appropriate treatment, medication dose, clinical progression and disposition must remain identical across levels for the same sequence of choices.

### Written responses and hidden answer keywords

All newly generated cases must set `responseMode` to `keyword_written`. For every action in every step:

- Give each clinical action one `answerKeywords` array of short, specific words or phrases a learner might write when intending that action. The action’s existing `feedback` is the explanation shown after the response.
- Include common clinical synonyms, abbreviations and spelling variants, but avoid broad terms that could match several actions. Keywords are normalized for case, accents and punctuation, then matched as whole words/phrases—not by substring or semantic similarity.
- Each action’s keywords must be unique within that step. A phrase near negation such as “not,” “without,” “avoid,” or “withhold” is not counted as a positive match. Author positive, unambiguous phrases; do not make a dangerous action match a negated recommendation.
- Any one positive keyword mapped to an `optimal` or `acceptable` action makes that step’s written answer correct. Extra matching keywords do not add extra credit. If several actions match, the engine prefers an optimal action, then an acceptable action; only when no correct action matches can an incorrect or dangerous action be selected.
- Add exactly one `responseFallback` action to every step. It must be classified `incorrect`, not unsafe, unnecessary or critical, contain no `answerKeywords`, reveal no findings and make no patient-state changes. Give it a neutral consequence and route it to the next safe decision (or the terminal disposition). It is recorded when no answer keyword matches; do not invent worsening patient status to punish an unrecognized phrase.
- Keep `answerKeywords` and `responseFallback` hidden from during-play text. The learner sees the question and a writing field, not the action list or answer key. Show the matched action, keyword result and explanation after every submitted answer in Guided, Independent and Challenge. Challenge must not reveal them before the learner submits.

Existing v1.0 packs without `responseMode` remain loadable and keep their action-choice interface. Update or regenerate a legacy pack to get the writing interface.

### Guided — learning mode

Write `step.guidance` as a meaningful reasoning prompt or hint about what to focus on, not an answer key. For example: “Think about the immediate threats in the ABCDE assessment. What needs to be checked or treated before obtaining a full history?” Avoid “Choose option A” or simply repeating the optimal action.

Use `action.feedback` for the clinical explanation of WHY the mapped action is optimal, acceptable, incorrect or dangerous. Include relevant investigation/treatment interpretation and a concise teaching point after important decisions. These explanations are authored once; Guided displays the keyword result and action feedback immediately after a written answer. Guidance may help the learner reason about the next step.

### Independent — practice mode

Use the same clinical facts and action mapping. Guidance is available only when requested. In keyword-written cases, show keyword correctness, the mapped action and its explanation immediately after each submission in every level; do not reveal them before the learner responds. Write neutral clinical prompts that remain manageable without a hint.

Initial presentation, vital signs and `step.findings` contain information already available. Put history answers, examination findings and investigation results that require a request into the relevant `action.reveals`. Do not automatically disclose an entire workup. Preserve clinically plausible consequences of poor decisions.

### Challenge — assessment mode

The engine hides `step.guidance`, `action.answerKeywords`, action classifications and `action.feedback` before submission. In `keyword_written` cases, it shows the prompt and writing field, not the action list. After each submission, it shows the written answer, keyword result, mapped action, explanation and clinical consequence; the end review repeats the decisions and adds the case summary. Clinical findings, condition and vitals remain visible after submission. Assess clinical management, prioritization and sequencing, not obscure trivia.

Never put answer keys, coaching, “optimal/incorrect/dangerous,” preferred-action explanations or hidden diagnostic conclusions into fields visible during play. Audit case/topic titles, demographics, learning objectives, initial presentation, prompt, action text, findings, reveals, consequence and patientChanges. Clinically observed responses are allowed; evaluative teaching belongs in feedback/guidance or the end summary. Learning objectives are accessible during play, so they must not disclose the answer.

Encode clinically relevant sequencing in the step graph. The same intervention can have different classifications and consequences at different clinical stages. Feedback must explain when an action was too early or too late, what should have preceded it, unsafe decisions and better alternatives. This is decision-sequence reasoning, not elapsed-time measurement: the engine has no clinical clock.

Use `endOfCaseSummary.idealApproach` for the ordered essential actions, important omissions to look for and better alternatives; `summary` for reasoning; `learningPoints` for teaching points; and `references` for sources. The engine records the actual ordered decisions for comparison. It does **not** automatically infer every omitted action or generate personalized early/late labels. Do not claim that it does, and do not assert in a static summary that the learner missed an action they may have performed. Phrase omission advice conditionally, for example “If reassessment was omitted, compare your sequence with…”.

### Field mapping — no additional or duplicated fields

| Educational or clinical content | Supported field | Visibility |
| --- | --- | --- |
| Neutral clinical question | step.prompt | All levels |
| Learner writing field | responseMode = keyword_written | All levels |
| Hidden response matches | action.answerKeywords | Matched internally after submission; never shown during play |
| Neutral unmatched-response route | action.responseFallback | Exactly one per keyword-written step; hidden during play |
| Mapped action | action.text | After written submission in keyword-written cases; visible choices in legacy packs |
| Reasoning prompt / hint / focus | step.guidance | Guided/Independent on request; hidden in Challenge |
| Action classification | action.classification | After each keyword-written submission in all levels |
| Explanation and teaching point | action.feedback | After each keyword-written submission in all levels |
| Observable clinical consequence | action.consequence | All levels; no evaluative coaching |
| Requested clinical information | action.reveals | After choosing that action, all levels |
| Clinical progression | action.patientChanges / nextStepId | Same clinical response and graph in all levels |
| Ideal sequence, omission review, learning and sources | endOfCaseSummary | End review in all levels |

Do not invent `hint`, `reasoningPrompt`, `teachingPoint` or mode-specific properties: use responseMode, answerKeywords, responseFallback, guidance and feedback as mapped above. Important feedback should include both explanation and teaching point in one string.

### Required three-level audit before export

For **every major decision in each of the two cases**, ask internally:

1. Guided: Is there enough information to teach the learner how to reason through this?
2. Independent: Can the learner reasonably manage this without receiving a hint?
3. Challenge: Can the simulator evaluate the learner without revealing the answer beforehand?

If any answer is NO, revise the step before exporting. Walk through both cases in all three levels, including poor-choice branches: confirm meaningful Guided teaching, no hint required to progress, no accidental Challenge answer exposure, requested-information availability, coherent consequences and sequencing, identical medical facts, and no three duplicate copies. This is an authoring audit unless the simulator was actually run; do not claim runtime testing without performing it.

## Complete structure

## Mandatory verification for newly generated packs

Use the permanent **Copy Case Pack Generator Prompt** on the Case Packs page. It requires a medical verification pass after drafting, rechecking critical management/doses against two reliable sources whenever possible, followed by a separate independent reference verification pass. Disclose single-source limitations and guideline/lecture conflicts. These are generator reports, not guarantees or verification performed by the simulator.

Newly authored packs must include `metadata`: `verificationStatus` (not_verified / partially_verified / verified), `verificationDate` (YYYY-MM-DD or null), `sourcesCrossChecked` (source-and-claim strings), `referenceVerificationCompleted`, `medicalContentChecked`, `criticalManagementRechecked`, `citationClaimsChecked` (booleans), and `sourceNotes` (strings describing limitations/conflicts). The template truthfully defaults to not_verified.

For backward compatibility, existing v1.0 packs without metadata remain loadable and display “Not reported.” When metadata is supplied, every metadata field is required. Reported verification requires a date and sources; verified requires all four completed-check flags. A single checked source requires a limitation note. Dates cannot be in the future. Upload validation checks structure and declaration consistency only; it cannot establish medical accuracy, source existence, source authority or claim support.

References remain strings in `endOfCaseSummary.references`; include actual organization/author, title, publication, year and verified URL/DOI. Stable labels such as [R1] may be included in these strings and in action feedback; authors must check their links manually. There is no structured reference-ID field in schema v1.0.

The JSON Schema describes required fields, enums, types and limits. The template demonstrates the structural fields, including optional patient changes and a small example objective mapping.

- Pack: schemaVersion, packId, title, description, topics, objectiveCoverage (required for new authoring, optional for legacy imports).
- Topic: id, title, cases (exactly two).
- Case: id, title, difficulty (beginner / intermediate / advanced), interactionModel, responseMode, learningObjectives, objectiveMappings, demographics (age / sex / context), initialPresentation (complaint / appearance / condition), vitalSigns, initialStepId, steps, endOfCaseSummary.
- Vital: label, value (string with units), tone (normal / watch / critical).
- Step: id, kind (assessment / history / examination / investigation / management / reassessment / disposition), prompt, guidance, findings, actions.
- Finding: category (history / examination / investigation / reassessment), label, text.
- Action: id, text, classification (optimal / acceptable / incorrect / dangerous), feedback, consequence, reveals, patientChanges, nextStepId, answerKeywords or responseFallback.
- patientChanges: an object; condition and vitalSigns are optional. Use {} for no change. Vitals merge by exact label, retaining other existing vital signs. Use consistent labels.
- End summary: diagnosis, summary, idealApproach, disposition, learningPoints, references.

All strings must be nonempty except arrays explicitly allowed to be empty. findings and reveals may be []; learningObjectives, learningPoints and references must not be empty. Each step needs 2–12 actions.

## Progression and visibility

1. Start at initialStepId. The current step's findings appear automatically.
2. In `keyword_written` cases, the learner submits text. The engine maps it to the authored action whose hidden `answerKeywords` match. Any positive keyword for an optimal or acceptable action makes that answer correct; one answer earns at most one correct mark. The action's consequence, reveals, condition and vital changes appear after submission. The action's nextStepId controls progression when the learner continues. If no keyword matches, the single neutral `responseFallback` is recorded and progression continues without inventing a patient-state change.
3. Packs without `responseMode` are legacy packs. They retain the action-choice interface.
4. nextStepId must reference a step in the same case or be null. **Only a disposition step can use null**, which completes the attempt and opens the debrief.
5. Every step must be reachable from the initial step, and every step must have some route to a terminal disposition action. Retry loops and branches are supported; loops with no exit are rejected.
6. Do not put a hidden diagnosis, preferred option or answer key in any during-play field. Initial presentation, demographics and learning objectives are visible to learners. A diagnosis already established in the clinical scenario may be stated, but do not leak what the learner is being asked to determine.
7. Guided mode displays guidance on request and immediate keyword/action feedback after submission. Independent makes hints available on request and holds evaluation until the debrief. Challenge withholds guidance, keyword matches and evaluative feedback until the debrief. Clinical consequences and findings remain visible in every mode.
8. The debrief shows all written responses, matched keywords, mapped actions with their classifications, explanations and consequences, followed by the authored summary, disposition and learning points.
9. On `keyword_written` cases, case performance includes written-response accuracy alongside action quality and any authored critical-action, sequencing, safety, reassessment or disposition measures. This is a learning indicator, not a validated competency assessment. Completion is recorded only at a terminal disposition, separately by mode. Replays replace the latest result for that case/mode rather than duplicating the completed-case count.

## Clinical authoring

Focus prompts on “What should I do next?” Provide realistic urgency, targeted findings, plausible alternatives, patient responses and reassessment. Make dangerous choices explicitly dangerous, and distinguish acceptable alternatives from optimal choices. Do not hide essential safety information solely in guidance: Challenge learners do not see it.

Put initial facts in initialPresentation/vitalSigns or a step's findings. Put requested history, examination results and investigations in action.reveals. Put post-intervention changes in patientChanges and objective reassessment findings in reveals. Always include a disposition step. Explain why an action is appropriate or unsafe, cite reliable current references, and defer drug doses and local policy decisions to current reviewed protocols.

The template's two hypoglycemia examples exist only to verify the format and engine. They are not a clinical curriculum. Replace or review them before educational use.