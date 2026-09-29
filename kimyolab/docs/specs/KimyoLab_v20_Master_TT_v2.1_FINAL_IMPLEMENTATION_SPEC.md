# KimyoLab v20 — Master TT v2.1
## FINAL IMPLEMENTATION SPEC

**Status:** FINAL / implementation uchun muzlatilgan spetsifikatsiya  
**Versiya:** 2.1.0  
**Asos:** Master TT v2 + Black Swan / x10think / Brainstorm100 audit  
**Mahsulot:** KimyoLab — 7–11-sinflar uchun interaktiv kimyo ta’lim muhiti  
**Asosiy maqsad:** joriy data/catalog prototipni real interaktiv, ilmiy ishonchli, yengil, accessibility talablari bajarilgan, update va rollback qilish oson mahsulotga aylantirish.

---

# 0. NORMATIV TERMINLAR

Ushbu TTda:

- **MUST / SHART** — release’ni bloklaydigan majburiy talab.
- **MUST NOT / TAQIQLANADI** — buzilishi release’ni bloklaydi.
- **SHOULD / TAVSIYA ETILADI** — kuchli tavsiya; chetga chiqish ADR bilan asoslanadi.
- **MAY / MUMKIN** — ixtiyoriy.

Har bir talab `REQ-ID` bilan belgilanadi va:

```text
Requirement
→ Implementation module
→ Automated test
→ Approval
→ Release gate
```

zanjirida kuzatiladi.

---

# 1. PRODUCT DEFINITION

## PROD-001 — Product mohiyati

KimyoLab foydalanuvchiga texnik mapping yoki “mavzular katalogi”ni emas, **o‘rganish jarayoni**ni berishi SHART.

Minimal learning loop:

```text
Learning outcome
→ Theory
→ Interactive model / Practice
→ Evidence
→ Scientific explanation
→ Assessment
→ Progress
→ Mastery / Review
```

## PROD-002 — Macro–Micro–Symbolic

Kimyoviy jihatdan tegishli mavzularda:

```text
Macro
→ Micro
→ Symbolic
```

ko‘prigi bo‘lishi SHART.

## PROD-003 — Student UI

Student UI’da quyidagilar ko‘rsatilmaydi:

- Excel mapping;
- coverageStatus;
- lifecycleStatus;
- approval metadata;
- internal IDs;
- legacy IDs;
- schema/version debug data;
- developer diagnostics.

## PROD-004 — Product copy

Bosh sahifa:

**Kicker**
> 7–11-sinflar uchun interaktiv kimyo muhiti

**Title**
> Kimyoni tajribalar orqali o‘rganing va tushuning.

**Body**
> Virtual tajribalar, interaktiv modellar, hisoblashlar va mashqlar orqali kimyoviy hodisalarni bosqichma-bosqich o‘rganing.

**CTA**
- O‘rganishni boshlash
- Virtual laboratoriyaga kirish

---

# 2. ARXITEKTURA PRINSIPLARI

## ARCH-001 — Layering

```text
Authoring Source
→ Import/Migration
→ Canonical Content
→ Versioned Runtime Content Pack
→ Domain
→ Learning Runtime
→ Activity Engines
→ Features
→ UI
→ Infrastructure
```

## ARCH-002 — Dependency direction

```text
UI
↓
Features
↓
Learning Runtime
↓
Engines
↓
Domain
↓
Canonical Contracts
```

Teskari dependency TAQIQLANADI.

## ARCH-003 — UI va chemistry ajratilishi

Chemistry Core:
- DOM;
- CSS;
- Sinco;
- browser layout

haqida bilmasligi SHART.

## ARCH-004 — Data va engine ajratilishi

Activity kontenti va engine implementatsiyasi alohida versionlanadi.

## ARCH-005 — Bitta monolit fayl taqiqlanadi

Engine, data, state va UI bitta katta HTML/JS faylga aralashtirilmaydi.

---

# 3. TEXNOLOGIK STACK

## STACK-001 — Majburiy

- Vite
- TypeScript
- ES Modules
- Vitest
- Playwright
- Zod yoki JSON Schema
- IndexedDB
- Service Worker/PWA
- CSS Design Tokens
- semantic HTML

## STACK-002 — Framework

Default:
- TypeScript;
- native web platform;
- kichik reusable components.

React/Vue/Svelte faqat ADR bilan.

ADR quyidagilarni ko‘rsatadi:
- nima muammo hal qilinadi;
- bundle ta’siri;
- accessibility ta’siri;
- maintainability;
- migration cost.

---

# 4. TARGET REPOSITORY

```text
kimyolab/
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
│
├─ content-src/
│  ├─ manifest.yaml
│  ├─ aliases.yaml
│  ├─ concepts/
│  ├─ learning-units/
│  ├─ theory/
│  ├─ practices/
│  ├─ chemistry/
│  ├─ questions/
│  ├─ misconceptions/
│  └─ locales/
│
├─ public/
│  ├─ assets/
│  └─ content/
│     ├─ manifest.json
│     └─ <contentVersion>/
│
├─ src/
│  ├─ app/
│  │  ├─ bootstrap.ts
│  │  ├─ router.ts
│  │  ├─ routes.ts
│  │  ├─ shell.ts
│  │  └─ error-boundary.ts
│  │
│  ├─ domain/
│  │  ├─ content/
│  │  ├─ curriculum/
│  │  ├─ chemistry/
│  │  ├─ assessment/
│  │  └─ mastery/
│  │
│  ├─ runtime/
│  │  ├─ learning-runner/
│  │  ├─ evidence/
│  │  ├─ progress/
│  │  ├─ remediation/
│  │  └─ compatibility/
│  │
│  ├─ engines/
│  │  ├─ experiment/
│  │  ├─ simulation/
│  │  ├─ trainer/
│  │  ├─ calculation/
│  │  └─ case/
│  │
│  ├─ features/
│  │  ├─ home/
│  │  ├─ learning-hub/
│  │  ├─ periodic-table/
│  │  ├─ practice-runner/
│  │  ├─ search/
│  │  ├─ worksheet/
│  │  └─ progress/
│  │
│  ├─ ui/
│  │  ├─ tokens/
│  │  ├─ components/
│  │  ├─ layouts/
│  │  └─ icons/
│  │
│  └─ infra/
│     ├─ storage/
│     ├─ pwa/
│     ├─ security/
│     ├─ telemetry/
│     └─ deployment/
│
├─ scripts/
│  ├─ import-xlsx.ts
│  ├─ migrate-v19.ts
│  ├─ build-content-pack.ts
│  ├─ validate-content.ts
│  ├─ validate-mapping.ts
│  ├─ generate-traceability.ts
│  ├─ release-check.ts
│  └─ rollback.ts
│
├─ tests/
│  ├─ unit/
│  ├─ property/
│  ├─ integration/
│  ├─ e2e/
│  ├─ visual/
│  ├─ fixtures/
│  └─ chemistry-corpus/
│
└─ docs/
   ├─ adr/
   ├─ architecture/
   ├─ content/
   ├─ approvals/
   └─ releases/
```

---

# 5. SOURCE OF TRUTH

## DATA-001 — Authoritative authoring source

Production uchun yagona authoring source:

```text
/content-src/
```

## DATA-002 — XLSX roli

XLSX:
- migration input;
- bulk import;
- metodik review/export.

XLSX va canonical source parallel qo‘lda tahrir qilinmaydi.

## DATA-003 — Runtime source

Runtime faqat:

```text
/public/content/<contentVersion>/
```

content packlardan ishlaydi.

## DATA-004 — Generated artifact

Runtime JSON:
- build qilinadi;
- checksumlanadi;
- qo‘lda tahrir qilinmaydi.

---

# 6. VERSIONING

## VER-001 — Mustaqil versiyalar

```text
appVersion
schemaVersion
contentVersion
curriculumVersion
chemistryRulesVersion
assessmentVersion
scoringVersion
engineVersion
```

## VER-002 — Content manifest

```ts
interface ContentPackManifest {
  contentVersion: string;
  curriculumVersion: string;
  schemaVersion: string;
  chemistryRulesVersion: string;
  assessmentVersion: string;
  scoringVersion: string;

  createdAt: string;
  checksum: string;

  compatibility: {
    minAppVersion: string;
    maxAppVersion?: string;
  };

  grades: number[];

  files: Array<{
    path: string;
    checksum: string;
    size: number;
  }>;
}
```

## VER-003 — Compatibility

```ts
interface CompatibilityRule {
  appRange: string;
  schemaRange: string;
  contentRange: string;
  chemistryRulesRange: string;
  assessmentRange: string;
}
```

Error:
- `CONTENT_VERSION_INCOMPATIBLE`
- `SCHEMA_VERSION_INCOMPATIBLE`
- `ENGINE_CONFIG_INCOMPATIBLE`

---

# 7. FINAL COMPATIBILITY MATRIX

| App | Schema | Content | Qaror |
|---|---|---|---|
| compatible | compatible | compatible | ALLOW |
| compatible | old migratable | compatible | MIGRATE |
| compatible | newer unsupported | any | BLOCK |
| old incompatible | any | newer content | BLOCK + old pack |
| new app | compatible | old compatible | ALLOW |
| new app | compatible | old deprecated | WARN + migrate |
| any | checksum fail | any | BLOCK + ROLLBACK |
| any | manifest partial | any | KEEP PREVIOUS |

Migration avtomatik bo‘lsa:
- idempotent;
- testlangan;
- rollbackable

bo‘lishi SHART.

---

# 8. STABLE IDS VA ALIASES

## ID-001

ID title’dan qayta generatsiya qilinmaydi.

## ID-002

Misollar:

```text
lu.7.atom
concept.atomic-structure
theory.7.atom
practice.sim.atom-builder
practice.lab.salt-purification
assessment.7.atom.mastery
```

## ID-003 — Alias

```ts
interface IdAlias {
  from: string;
  to: string;
  reason: 'rename'|'merge'|'split'|'legacy-migration';
  effectiveFrom: string;
}
```

## ID-004 — Split

Concept split bo‘lsa:
- eski evidence avtomatik yangi masteryga ko‘chmaydi;
- explicit migration mapping talab qilinadi.

## ID-005 — Merge

Merge:
- duplicate evidence dedupe;
- mastery recalculate.

---

# 9. SOURCE/PROVENANCE

## SRC-001

```ts
interface SourceRef {
  id: string;

  type:
    | 'textbook'
    | 'curriculum'
    | 'standard'
    | 'reference'
    | 'expert-review'
    | 'internal';

  title: string;

  edition?: string;
  page?: string;
  url?: string;
  publisher?: string;
  year?: number;

  license?: string;
}
```

## SRC-002

Chemical fact/reaction uchun:
- SourceRef
yoki
- chemistry expert approval

bo‘lishi SHART.

---

# 10. LOCALIZATION

## I18N-001

Minimal locale:
- `uz-Latn`
- `uz-Cyrl`
- `ru`

## I18N-002

Canonical IDs locale’dan mustaqil.

## I18N-003

Search synonymlari locale-aware.

---

# 11. CANONICAL DOMAIN SCHEMAS

## DATA-010 — Concept

```ts
interface Concept {
  id: string;
  nameKey: string;

  gradeRange: number[];

  prerequisiteIds: string[];
  relatedConceptIds: string[];

  representations:
    Array<'macro'|'micro'|'symbolic'>;

  misconceptionIds: string[];

  synonyms: Record<string,string[]>;

  sourceRefs: SourceRef[];
}
```

### Example

```json
{
  "id": "concept.atomic-structure",
  "nameKey": "concept.atomic-structure.name",
  "gradeRange": [7, 8],
  "prerequisiteIds": ["concept.element"],
  "relatedConceptIds": ["concept.isotope"],
  "representations": ["micro", "symbolic"],
  "misconceptionIds": ["misconception.electron-in-nucleus"],
  "synonyms": {
    "uz-Latn": ["atom tuzilishi"],
    "ru": ["строение атома"]
  },
  "sourceRefs": ["src.curriculum.7"]
}
```

---

## DATA-011 — LearningUnit

Relation arrays saqlanmaydi.

```ts
interface LearningUnit {
  id: string;

  grade: 7|8|9|10|11;

  titleKey: string;
  chapterKey?: string;

  learningOutcomeKeys: string[];

  conceptIds: string[];
  prerequisiteConceptIds: string[];

  lessonTemplates: string[];

  curriculumVersion: string;

  sourceRefs: SourceRef[];

  legacyIds: string[];
}
```

---

## DATA-012 — TheoryActivity

```ts
interface TheoryActivity {
  id: string;

  conceptIds: string[];

  explanationBlocks: TheoryBlock[];

  representationModes:
    Array<'macro'|'micro'|'symbolic'>;

  interactionType?: TheoryInteractionType;
  interactionConfig?: Record<string, unknown>;

  misconceptionCheckIds: string[];

  lifecycleStatus: ActivityLifecycleStatus;

  approvals: ApprovalState;

  version: string;
  legacyIds: string[];
}
```

---

## DATA-013 — PracticeBase

```ts
interface PracticeBase {
  id: string;

  type:
    | 'experiment'
    | 'simulation'
    | 'trainer'
    | 'calculation'
    | 'case';

  titleKey: string;
  goalKey: string;

  conceptIds: string[];
  prerequisiteConceptIds: string[];

  lifecycleStatus: ActivityLifecycleStatus;

  approvals: ApprovalState;

  accessibilityProfile: AccessibilityProfile;

  engineCompatibility: EngineCompatibility;

  version: string;

  legacyIds: string[];
}
```

---

## DATA-014 — MappingLink

Yagona relation authority.

```ts
interface MappingLink {
  id: string;

  learningUnitId: string;

  theoryActivityId?: string;
  practiceActivityId: string;

  conceptIds: string[];

  role:
    | 'primary'
    | 'supporting'
    | 'remediation'
    | 'extension';

  required: boolean;

  coverageStatus:
    | 'none'
    | 'partial'
    | 'full'
    | 'not_applicable';
}
```

---

# 12. LIFECYCLE VA APPROVAL

## LIFE-001

```ts
type ActivityLifecycleStatus =
  | 'draft'
  | 'planned'
  | 'in_progress'
  | 'implemented'
  | 'ready'
  | 'deprecated';
```

## APR-001

```ts
interface ApprovalState {
  technical: ApprovalRecord;
  chemistry: ApprovalRecord | 'not_applicable';
  didactic: ApprovalRecord;
  accessibility: ApprovalRecord;
}
```

```ts
interface ApprovalRecord {
  status: 'pending'|'approved'|'rejected';

  reviewerId: string;
  reviewerRole: string;

  reviewedVersion: string;
  reviewedHash: string;

  reviewedAt: string;

  notes?: string;
}
```

## APR-002 — Invalidation

Quyidagilar o‘zgarsa tegishli approval `pending`:

- content hash;
- chemistry record;
- scoring;
- engine config;
- safety;
- accessibility behavior.

---

# 13. CONTENT IMPORT PIPELINE

## PIPE-001

```text
XLSX
→ parse
→ normalize
→ legacy ID resolve
→ canonical ID match
→ schema validate
→ controlled dedupe
→ relation validate
→ canonical source diff
→ human review
→ content pack build
→ checksum
```

## PIPE-002 — Dedupe

Automatic merge faqat stable key bilan.

Semantic dedupe:
- avtomatik merge QILMAYDI;
- suggestion report chiqaradi;
- human approval talab qiladi.

## PIPE-003 — Commands

```bash
npm run content:import -- source.xlsx
npm run content:validate
npm run mapping:validate
npm run content:pack
npm run test
npm run build
npm run release:check
```

---

# 14. VALIDATORLAR

## VAL-001 — Mapping

```text
duplicateCanonicalIds = 0
unknownLearningUnitRefs = 0
unknownTheoryRefs = 0
unknownPracticeRefs = 0
unknownConceptRefs = 0
forwardReverseMismatch = 0
orphanRequiredEntities = 0
schemaErrors = 0
```

## VAL-002 — Concept Graph

```text
cycle = 0
orphanPrerequisite = 0
unknownRelatedConcept = 0
invalidGradeDependency = 0
```

## VAL-003 — Orphans

CI report:
- unused practice;
- unused theory;
- unused concept;
- unused question;
- dead reaction.

Required orphan release’ni bloklaydi.

---

# 15. QUANTITY / UNIT / PRECISION

## CHEM-001 — Quantity

```ts
interface Quantity {
  value: number;
  unit: UnitId;
}
```

Supported:
- g
- kg
- mol
- L
- mL
- Pa
- kPa
- °C
- K
- mol/L
- %
- C
- A
- s

## CHEM-002 — Precision

Har CalculationActivity:
- accepted units;
- tolerance;
- significant figures;
- rounding mode

belgilaydi.

Direct float equality TAQIQLANADI.

---

# 16. SPECIES REGISTRY

## CHEM-010

```ts
interface Species {
  id: string;

  formula: string;
  nameKey: string;

  structuralVariant?: string;
  allotrope?: string;

  phase:
    | 's'
    | 'l'
    | 'g'
    | 'aq'
    | 'unknown';

  charge: number;

  color?: string;

  solubilityClass?: string;

  acidBaseClass?: string;

  electrolyteStrength?:
    | 'strong'
    | 'weak'
    | 'none';

  oxidationStates: number[];

  hazards: HazardCode[];

  properties: Record<string,string|number|boolean>;

  sourceRefs: SourceRef[];
}
```

Formula identity uchun yetarli emas.

---

# 17. FORMULA PARSER

## CHEM-020

Qo‘llab-quvvatlaydi:
- nested parentheses;
- hydrates;
- charge notation;
- atom counting;
- supported isotopic notation;
- malformed input;
- max input length.

Errors:
- `FORMULA_INVALID`
- `FORMULA_SYNTAX_UNSUPPORTED`
- `INPUT_TOO_LONG`

## CHEM-021 — Corpus

Kamida:
- valid formulas;
- malformed;
- deep nested;
- hydrate;
- charged ions;
- fuzz/property tests.

---

# 18. EQUATION BALANCING

## CHEM-030

Molecular balancer:
- atom conservation.

## CHEM-031

Redox balancer:
- acidic;
- basic;
- neutral medium.

## CHEM-032

Balancer chemical validityni aniqlamaydi.

## CHEM-033

Kamida 200 expert-approved equation.

Valid corpus = 100%.

---

# 19. OBSERVATION MODEL

## CHEM-040

```ts
type Observation =
  | { type:'color-change'; from?:string; to:string }
  | { type:'precipitate'; speciesId?:string; color?:string }
  | { type:'gas'; speciesId?:string; descriptionKey?:string }
  | { type:'temperature-change'; delta?:number; direction:'up'|'down' }
  | { type:'odor'; descriptionKey:string }
  | { type:'light'; descriptionKey:string }
  | { type:'state-change'; from:string; to:string }
  | { type:'no-visible-change' };
```

Odor real sniff instruction emas.

---

# 20. REACTION KNOWLEDGE BASE

## CHEM-050

```ts
interface ReactionRecord {
  id: string;

  reactants: ReactionSpeciesRef[];
  products: ReactionSpeciesRef[];

  conditions: ReactionConditions;

  direction:
    | 'forward'
    | 'reversible';

  reactionType: string;

  molecularEquation: string;

  ionicModel?: IonicModel;

  observations: Observation[];

  safety: SafetyRule[];

  curriculumRefs: string[];

  sourceRefs: SourceRef[];

  approvals: {
    chemistry: ApprovalRecord;
  };

  version: string;
}
```

---

# 21. REACTION CONDITIONS

## CHEM-051

```ts
interface ReactionConditions {
  temperatureRange?: {
    min?: number;
    max?: number;
    unit: 'C'|'K';
  };

  solvent?: string;

  medium?:
    | 'acidic'
    | 'basic'
    | 'neutral';

  catalystIds?: string[];

  pressureRange?: QuantityRange;

  concentrationRules?: ConcentrationRule[];

  lightRequired?: boolean;

  electricalCurrent?: boolean;
}
```

---

# 22. REACTION MATCHER

## CHEM-060

Match order:

1. canonical reactants;
2. stoichiometric compatibility;
3. phase;
4. medium;
5. solvent;
6. temperature;
7. concentration;
8. catalyst;
9. pressure;
10. electricity/light.

## CHEM-061

0 match:
`REACTION_NOT_MODELED`

## CHEM-062

>1 equally valid:
`REACTION_CONDITION_REQUIRED`

## CHEM-063

Unknown chemistry taxmin qilinmaydi.

---

# 23. IONIC / SOLUTION ENGINE

## CHEM-070

Alohida model:
- phase;
- solubility;
- electrolyte strength;
- dissociation;
- spectator ions;
- precipitation;
- acid/base;
- curriculum-scope hydrolysis;
- net ionic equation.

String replacement TAQIQLANADI.

---

# 24. ORGANIC CHEMISTRY

## CHEM-080

```ts
interface OrganicReactionTemplate {
  id: string;
  family: string;
  functionalGroups: string[];
  conditions: ReactionConditions;
  transform: string;
  curriculumScope: string[];
  sourceRefs: SourceRef[];
}
```

General inorganic matcher organik productni taxmin qilmaydi.

---

# 25. TYPED EVIDENCE

## LEARN-001

```ts
type Evidence =
  | ObservationEvidence
  | AnswerEvidence
  | CalculationEvidence
  | DecisionEvidence
  | ConstructionEvidence
  | ProcedureEvidence;
```

`unknown` value TAQIQLANADI.

## LEARN-002

Har evidence:
- id;
- conceptId;
- activityId;
- activityVersion;
- contentVersion;
- scoringVersion;
- createdAt

saqlaydi.

---

# 26. MINIMAL LEARNING RUNNER

## LEARN-010

```text
load LearningUnit
→ resolve mapping
→ theory
→ primary practice
→ evidence
→ assessment
→ mastery
→ persist
```

Full Learning Hubdan oldin mavjud bo‘lishi SHART.

---

# 27. PRACTICE ROUTER

## ENG-001

```ts
runPractice(activityId, runtimeContext)
```

Routing:
- experiment → ExperimentEngine
- simulation → SimulationEngine
- trainer → TrainerEngine
- calculation → CalculationEngine
- case → CaseEngine

## ENG-002

Ready bo‘lmasa:
`ACTIVITY_NOT_READY`

---

# 28. EXPERIMENT ENGINE

## ENG-010 — Apparatus

```ts
interface ApparatusState {
  instanceId: string;
  apparatusType: string;

  contents: MaterialState[];

  volume?: Quantity;
  temperature?: Quantity;

  connectedTo?: string[];

  position?: string;
  stateFlags: string[];
}
```

## ENG-011 — Material

```ts
interface MaterialState {
  speciesId: string;

  amount?: Quantity;
  concentration?: Quantity;

  phase: string;

  temperature?: Quantity;
}
```

## ENG-012 — State

```ts
interface ExperimentState {
  scenarioId: string;

  status:
    | 'not_started'
    | 'in_progress'
    | 'waiting_for_observation'
    | 'complete'
    | 'blocked';

  apparatus: ApparatusState[];

  completedStepIds: string[];

  observations: ObservationEvidence[];

  actions: ActionRecord[];

  warnings: string[];
}
```

## ENG-013 — Step

```ts
interface ExperimentStep {
  id: string;

  dependencies: string[];

  mode:
    | 'required'
    | 'optional'
    | 'repeatable';

  allowedActions: LabAction[];

  inputRules: RequiredInputRule[];

  expectedObservations: Observation[];

  scientificReasonKey: string;

  reactionIds: string[];

  safetyRules: SafetyRule[];

  completionRule: StepCompletionRule;
}
```

## ENG-014 — Action result

```ts
type ActionResult =
  | { status:'accepted'; evidence?:Evidence[] }
  | { status:'invalid'; code:string; feedbackKey:string }
  | { status:'unsafe'; code:string; feedbackKey:string };
```

Invalid/unsafe actiondan recovery mumkin.

---

# 29. SIMULATION ENGINE

## ENG-020

```ts
interface SimulationAdapter<State,Config> {
  mount(
    container: HTMLElement,
    config: Config,
    initialState?: State
  ): void;

  dispatch(action: SimulationAction): void;

  getState(): State;

  getEvidence(): Evidence[];

  serialize(): string;

  restore(serialized: string): void;

  reset(): void;

  destroy(): void;
}
```

## ENG-021

Random simulation deterministic seedga ega.

## ENG-022

Capabilities:

```ts
interface EngineCapabilities {
  keyboard: boolean;
  touch: boolean;
  offline: boolean;
  reducedMotion: boolean;
  lowEndFallback: boolean;
  serializable: boolean;
}
```

---

# 30. TRAINER ENGINE

## ENG-030

Flow:

```text
question
→ attempt
→ validation
→ specific feedback
→ hint
→ retry
→ explanation
→ evidence
```

## ENG-031

```ts
interface TrainerAttemptPolicy {
  maxAttempts?: number;
  hintAfterAttempts: number[];
  explanationAfter: number|'success';
}
```

## ENG-032 — Hint ladder

1. concept reminder;
2. strategy;
3. partial worked step.

---

# 31. CALCULATION ENGINE

## ENG-040

Flow:

```text
Problem
→ Given
→ Required
→ Formula
→ Substitution
→ Unit
→ Result
→ Interpretation
```

## ENG-041

```ts
interface CalculationStepResponse {
  stepId: string;
  value: number;
  unit: UnitId;
}
```

Validation:
- formula;
- value;
- unit;
- tolerance;
- significant figures;
- reasoning.

---

# 32. CASE ENGINE

## ENG-050

Flow:

```text
Problem
→ Evidence
→ Alternatives
→ Decision
→ Scientific justification
→ Reflection
```

## ENG-051

```ts
interface CaseRubric {
  evidenceUse: number;
  scientificAccuracy: number;
  reasoning: number;
  decisionQuality: number;
}
```

Total = 100%.

---

# 33. QUESTION BANK

## ASSESS-001

```ts
interface Question {
  id: string;

  conceptIds: string[];

  type:
    | 'single-choice'
    | 'multi-choice'
    | 'numeric'
    | 'ordering'
    | 'matching'
    | 'short-response'
    | 'construction';

  cognitiveLevel:
    | 'remember'
    | 'understand'
    | 'apply'
    | 'analyze'
    | 'evaluate';

  difficulty: 1|2|3|4|5;

  promptKey: string;

  scoringRuleId: string;

  sourceRefs: SourceRef[];

  version: string;
}
```

## ASSESS-002

Question randomization seed bilan reproducible.

---

# 34. ASSESSMENT RESULT

## ASSESS-010

```ts
interface AssessmentResult {
  id: string;
  learningUnitId: string;

  score: number;

  conceptEvidenceIds: string[];

  misconceptionIds: string[];
  weakConceptIds: string[];

  recommendedRemediationIds: string[];

  assessmentVersion: string;
  scoringVersion: string;

  createdAt: string;
}
```

---

# 35. MASTERY ALGORITHM v1

## MASTER-001 — Default weights

```text
Practice observation     0.15
Trainer/calculation      0.20
Concept assessment       0.35
Transfer/case            0.30
```

Concept config override mumkin.

## MASTER-002 — Minimum evidence

Mastered uchun:
- ≥3 independent evidence;
- ≥1 assessment;
- ≥1 application/transfer evidence, agar applicable.

## MASTER-003 — Confidence

```text
weighted recent evidence average
```

Recent evidence yuqori weight.

## MASTER-004 — Status

```text
< 0.45      → needs_review
0.45–0.74   → developing
>= 0.75     → mastered
```

Minimum evidence bajarilmasa `mastered` bo‘lmaydi.

## MASTER-005 — Conflicting evidence

Old evidence o‘chirilmaydi.

Recent evidence weighting ishlaydi.

## MASTER-006

Schema:
- lastEvidenceAt
- reviewDueAt

saqlaydi.

Automatic time decay v1’da SHART emas.

---

# 36. REMEDIATION

## LEARN-020

```text
concept misunderstanding → theory
visual misconception      → simulation
procedure error           → experiment step
formula error             → trainer
equation error            → balancing
calculation error          → calculation hint
reasoning error            → case/example
```

---

# 37. PROGRESS

## PROG-001

```ts
interface LearningUnitProgress {
  learningUnitId: string;

  status:
    | 'not_started'
    | 'in_progress'
    | 'practice_complete'
    | 'assessment_complete'
    | 'mastered'
    | 'needs_review';

  activityStates: Record<string,string>;

  lastVisitedAt: string;

  contentVersion: string;
  schemaVersion: string;
}
```

---

# 38. INDEXEDDB

## PROG-010

Stores:
- progress;
- activityState;
- evidence;
- assessmentAttempts;
- mastery;
- appMeta.

## PROG-011

Transactions atomic.

## PROG-012

Write failure:
`PROGRESS_SAVE_FAILED`

Silent failure TAQIQLANADI.

## PROG-013 — Quota

1. detect;
2. heavy cache purge;
3. progress protected;
4. user notified.

## PROG-014 — Corruption

- migration/recovery attempt;
- diagnostic;
- affected store reset only when necessary.

---

# 39. LEARNING HUB

## UX-001

Har LearningUnit:

```text
Title
Learning outcome
Prerequisite
Concept map
Theory
Interactive model
Primary practice
Supporting practice
Worksheet
Assessment
Progress
Next recommendation
```

## UX-002

Technical metadata student UI’dan chiqariladi.

---

# 40. DESIGN SYSTEM

## UX-010 — Component inventory

Majburiy:
- Button
- Link
- Card
- TopicCard
- PracticeCard
- Modal
- Drawer
- Tabs
- Stepper
- Progress
- Feedback
- Alert
- Toast
- FormField
- Select
- NumericInput
- SearchBox
- EmptyState
- ErrorState
- LoadingSkeleton
- Tooltip
- Accordion

Har komponent:
- default;
- hover;
- focus;
- disabled;
- loading;
- error

holatiga ega.

## UX-011 — Sinco

Sinco:
- visual language;
- typography inspiration;
- layout rhythm;
- illustration style

uchun ishlatiladi.

Unused Sinco:
- pages;
- plugins;
- scripts;
- assets

productionga kirmaydi.

---

# 41. ROUTES

## ROUTE-001

```text
/
/learn/:learningUnitId
/theory/:theoryActivityId
/practice/:practiceActivityId
/element/:symbol
/search
/progress
```

## ROUTE-002

Refresh contextni saqlaydi.

## ROUTE-003

Legacy route canonical routega redirect.

---

# 42. GLOBAL SEARCH

## SEARCH-001

Index:
- LearningUnit;
- Concept;
- TheoryActivity;
- PracticeActivity;
- Element.

## SEARCH-002

Grade pack yuklanganda local index.

## SEARCH-003

Locale-aware synonyms.

---

# 43. ACCESSIBILITY

## A11Y-001

Standard:
**WCAG 2.2 AA**

## A11Y-002

Majburiy:
- keyboard-only completion;
- visible focus;
- semantic HTML;
- accessible form errors;
- 200% zoom;
- 320 CSS px reflow;
- 44×44 touch target;
- reduced motion;
- no color-only meaning;
- drag/drop alternative;
- canvas/SVG textual equivalent;
- simulation keyboard interaction.

## A11Y-003

Axe critical/serious = 0.

---

# 44. PERFORMANCE

## PERF-001 — Baseline first

Phase 0’da:
- JS;
- CSS;
- data;
- images;
- LCP;
- CLS;
- INP;
- long task

o‘lchanadi.

## PERF-002 — Core Web Vitals

Target:
- LCP ≤ 2.5s
- CLS ≤ 0.1
- INP ≤ 200ms

## PERF-003 — Route budget

Har route uchun:
- JS gzip;
- CSS gzip;
- data gzip;
- images;
- long tasks

CI’da gate.

## PERF-004 — Content chunking

```text
manifest
→ grade
→ chapter/activity
```

122 topic birinchi load’da yuklanmaydi.

## PERF-005 — Fallback

3D/WebGL muammo:
- 2D;
- static interactive;
- text diagram.

---

# 45. PROGRESSIVE ENHANCEMENT

## UX-020

JS bo‘lmasa:
- home;
- topic title;
- theory text;
- navigation

minimal ishlaydi.

Interactive practice uchun aniq JS-required message.

---

# 46. SECURITY

## SEC-001

Known path traversal Phase 0’da yopiladi.

## SEC-002

`startsWith(root)` taqiqlanadi.

## SEC-003

Prodga kirmaydi:
- source XLSX;
- `/source/`;
- tests;
- internal docs;
- review notes.

## SEC-004

Browser:
- CSP;
- no unsafe innerHTML;
- bounded input;
- schema validation;
- URL sanitization;
- trusted asset origins;
- no stack trace in student UI.

---

# 47. SERVICE WORKER / ATOMIC UPDATE

## OFF-001

Startup:

```text
load shell manifest
→ load content manifest
→ compatibility check
→ checksum
→ activate
```

## OFF-002

Partial deploy:
- previous compatible release qoladi.

## OFF-003

Cache key:
```text
appVersion
+ schemaVersion
+ contentVersion
```

---

# 48. TELEMETRY / PRIVACY

## PRIV-001

Default anonymous events:
- route opened;
- activity loaded;
- engine error code;
- performance metric.

## PRIV-002

TAQIQLANADI:
- raw free-text answers analyticsga;
- unnecessary personal identifiers;
- raw evidence without explicit need.

---

# 49. LICENSING

## LIC-001

Har external asset/source:
- owner;
- source;
- license;
- allowed use.

## LIC-002

Sinco, fonts, textbook extracts, illustrations va reference data release oldidan audit qilinadi.

---

# 50. RACI

## OPS-001

Rollar:
- Product Owner
- Technical Reviewer
- Chemistry Reviewer
- Didactic Reviewer
- Accessibility Reviewer
- Content Editor
- Release Manager

Bir odam bir nechta rolni bajarishi mumkin, lekin approval record rolni saqlaydi.

---

# 51. SEVERITY

## QA-001

### S0 — blocker
- security exploit;
- wrong chemistry;
- data corruption;
- progress loss;
- broken main flow.

### S1 — critical
- activity unusable;
- major accessibility blocker;
- wrong scoring;
- release incompatibility.

### S2 — major
- partial workflow;
- material UX/performance regression.

### S3 — minor
- cosmetic.

RC:
```text
S0 = 0
S1 = 0
```

---

# 52. CI/CD

## OPS-010

```text
lint
→ typecheck
→ content validate
→ mapping validate
→ unit
→ property/fuzz
→ integration
→ build
→ bundle/performance
→ E2E
→ accessibility
→ security
→ checksum
→ traceability
→ release gate
→ staging
→ smoke
→ promote
```

---

# 53. DEPLOYMENT / ROLLBACK

## OPS-020

App bundle va content pack mustaqil versioned.

## OPS-021

Manifest last step’da activate.

## OPS-022

Oldingi:
- app build;
- content pack;
- compatibility manifest

saqlanadi.

## OPS-023

```bash
npm run release:rollback -- <release-id>
```

---

# 54. TESTLAR

## TEST-001 — Unit

Majburiy:
- FormulaParser
- EquationBalancer
- RedoxBalancer
- UnitConverter
- PrecisionRules
- SpeciesRegistry
- ReactionMatcher
- IonicEngine
- ConceptGraph
- MappingValidator
- ExperimentReducer
- Simulation serialization
- Trainer validator
- CalculationEngine
- Case rubric
- Assessment scoring
- Mastery
- Progress
- migration

## TEST-002 — Property/Fuzz

- malformed formulas;
- nesting;
- random valid token sequences;
- numeric boundaries.

## TEST-003 — Integration

- LearningUnit → MappingLink;
- Experiment → ReactionEngine;
- Simulation → Evidence;
- Trainer → Evidence;
- Calculation → Evidence;
- Case → Evidence;
- Evidence → Assessment;
- Assessment → Mastery;
- Progress → IndexedDB;
- schema migration;
- app/content compatibility;
- service worker atomic update.

## TEST-004 — E2E

```text
open learning unit
→ theory
→ practice
→ evidence
→ assessment
→ mastery update
→ progress save
→ reload
→ restore
```

## TEST-005 — Visual

- home;
- learning hub;
- lab;
- simulation;
- trainer;
- calculation;
- case;
- periodic table;
- worksheet;
- mobile;
- 200% zoom.

---

# 55. 6 REFERENCE VERTICAL SLICE — MICRO TT

---

## SLICE-01 — 7.02 Aralashmani ajratish (Experiment)

### Maqsad

Aralashmani fizik xossalar asosida:
- eritish;
- filtrlash;
- bug‘latish

orqali ajratishni tushunish.

### Minimal apparatus
- beaker
- glass rod
- funnel
- filter paper
- evaporating dish
- heat source

### Materials
- contaminated sodium chloride mixture
- water

### State graph

```text
start
→ apparatus_selected
→ water_added
→ mixture_added
→ dissolved
→ filtered
→ filtrate_collected
→ evaporated
→ crystals_observed
→ conclusion
```

### Allowed actions
- selectApparatus
- pour
- add
- mix
- filter
- heat
- evaporate
- observe
- record

### Invalid examples
- filter before dissolve
- evaporate dirty mixture directly

### Evidence
- procedure evidence
- observation evidence
- separation-method answer

### Assessment
1. Qaysi bosqichda erimaydigan aralashma ajraladi?
2. Nima uchun bug‘latish ishlatiladi?
3. Filtrat nima?

### DoD
- full experiment state-machine;
- progress restore;
- no fake chemistry required;
- keyboard completion.

---

## SLICE-02 — 7.07 Atom Builder (Simulation)

### Controls
- proton +/−
- neutron +/−
- electron +/−

### Derived
- atomic number
- mass number
- net charge
- isotope
- element identity

### Rules
- Z = proton count
- A = proton + neutron
- charge = proton − electron

### Evidence
- construct requested atom
- identify ion/neutral state
- isotope recognition

### Assessment example
“6 proton, 8 neutron, 6 elektronli zarrachani yarating.”

### Determinism
No random required.

### Serialization
Full state serializable.

---

## SLICE-03 — 7.11 Valentlik → formula (Trainer)

### Question model

```ts
{
  elementA,
  valencyA,
  elementB,
  valencyB,
  expectedFormula
}
```

### Flow
1. show pair;
2. learner enters formula;
3. parser validates;
4. valency balance check;
5. specific feedback;
6. hint;
7. retry;
8. explanation;
9. evidence.

### Specific feedback
- wrong element order;
- wrong index;
- reducible indices;
- invalid syntax;
- valency not balanced.

### Hint ladder
1. EKUKni toping.
2. Har elementning indeksini aniqlang.
3. Qisman yechim.

### DoD
At least 20 deterministic question templates.

---

## SLICE-04 — 7.12 Mr / molyar massa (Calculation)

### Example
H₂SO₄

### Steps
1. formula parse;
2. atom counts;
3. atomic masses;
4. contribution per element;
5. total;
6. unit/interpretation.

### Validation
- correct formula decomposition;
- numeric tolerance;
- unit;
- rounding.

### Evidence
- each step;
- final result;
- explanation.

### DoD
At least 20 formulas.

---

## SLICE-05 — 7.18 Havo ifloslanishi (Case)

### Problem
Shahar hududida:
- transport;
- sanoat;
- isitish manbalari.

### Evidence cards
- pollutant measurements;
- source clues;
- weather context.

### Learner
1. evidence selects;
2. source hypothesis;
3. decision;
4. scientific justification;
5. reflection.

### Rubric
- evidence use 25
- scientific accuracy 35
- reasoning 25
- decision quality 15

### DoD
Scientific justification required.

---

## SLICE-06 — Reactive Chemistry Experiment

### Default candidate
Precipitation reaction.

Example:
```text
AgNO₃(aq) + NaCl(aq)
→ AgCl(s)↓ + NaNO₃(aq)
```

### Must test
- Species Registry;
- Reaction matcher;
- phases;
- condition;
- precipitate observation;
- molecular equation;
- net ionic equation;
- safety;
- `REACTION_NOT_MODELED`;
- `REACTION_CONDITION_REQUIRED`.

### State
```text
select apparatus
→ add solution A
→ add solution B
→ observe precipitate
→ record
→ microscopic explanation
→ symbolic equation
→ assessment
```

### Evidence
- white precipitate observation;
- net ionic representation;
- explanation.

### DoD
Chemistry reviewer approval required.

---

# 56. PHASE 0 — BASELINE + SECURITY

## Scope
- existing Sinco/v19 baseline;
- current data snapshot;
- screenshots;
- route inventory;
- browser support baseline;
- performance baseline;
- path traversal fix.

## Files
- `docs/releases/phase-0-baseline.md`
- `docs/architecture/browser-matrix.md`
- security regression tests

## Commands

```bash
npm run test
npm run test:e2e
npm run test:security
npm run perf:baseline
```

## Gate
- known traversal fixed;
- S0 known security = 0;
- baseline documented;
- all existing useful v19 functions inventoried.

---

# 57. PHASE 1 — CANONICAL DATA + SOURCE OWNERSHIP

## Deliverables
- content-src
- schemas
- stable IDs
- aliases
- concepts
- LearningUnit
- TheoryActivity
- PracticeActivity
- MappingLink
- XLSX importer
- schema migrations
- validators
- content pack builder

## Required files
- `content-src/manifest.yaml`
- `content-src/aliases.yaml`
- schemas for all canonical entities
- `scripts/import-xlsx.ts`
- `scripts/build-content-pack.ts`
- `scripts/validate-content.ts`
- `scripts/validate-mapping.ts`

## Gate

```text
duplicateIds = 0
unknownRefs = 0
forwardReverseMismatch = 0
schemaErrors = 0
orphanRequiredEntities = 0
```

## Commands

```bash
npm run content:import
npm run content:validate
npm run mapping:validate
npm run content:pack
npm run test -- data
```

---

# 58. PHASE 2 — CHEMISTRY FOUNDATION

## Deliverables
- Unit/Quantity
- SpeciesRegistry
- FormulaParser
- Molecular Balancer
- Redox Balancer
- Observation model
- Reaction KB
- Reaction Matcher
- Ionic/Solution Engine
- chemistry sources

## Gate
- all chemistry unit tests;
- 200 equation corpus;
- fuzz tests;
- ambiguous condition tests;
- no unknown result guessing.

## Commands

```bash
npm run test -- chemistry
npm run test:property -- formula
npm run test:corpus
```

---

# 59. PHASE 3 — LEARNING RUNTIME FOUNDATION

## Deliverables
- Practice Router
- Typed Evidence
- IndexedDB progress
- Assessment core
- Mastery v1
- Remediation Router
- Minimal Learning Runner

## Gate
- evidence roundtrip;
- score;
- mastery;
- persistence;
- reload restore;
- migration.

## Commands

```bash
npm run test -- runtime
npm run test:integration -- learning-runtime
```

---

# 60. PHASE 4 — ACTIVITY ENGINES

## Deliverables
- ExperimentEngine
- SimulationEngine
- TrainerEngine
- CalculationEngine
- CaseEngine
- serialization
- capabilities
- engine/config compatibility

## Gate
Har engine isolated executable reference bilan.

```bash
npm run test -- engines
npm run test:e2e -- engine-smoke
```

---

# 61. PHASE 5 — 6 REFERENCE VERTICAL SLICES

## Gate

Har slice:

```text
Theory
→ Practice
→ Typed Evidence
→ Assessment
→ Mastery
→ Progress
→ Reload restore
```

Reactive slice:
- Chemistry Core E2E green.

## Commands

```bash
npm run test:e2e -- reference-slices
npm run test:visual -- reference-slices
```

---

# 62. PHASE 6 — PRODUCT UX / LEARNING HUB

## Deliverables
- Learning Hub
- theory interactions
- technical metadata removal
- worksheet
- print
- progress/resume
- global search
- deep link
- design system
- loading/error/empty states
- accessibility foundations

## Gate
- UX review approved;
- visual regression;
- keyboard main flow;
- WCAG critical/serious = 0.

---

# 63. PHASE 7 — BETA 1: 7–8-SINF

## Scope
47 LearningUnit.

## Gate

Har required mapping:
- `coverageStatus=full`
- activity `lifecycleStatus=ready`
- technical approval = approved
- didactic approval = approved
- chemistry = approved/not_applicable
- accessibility approval = approved

47/47.

## Additional
- no required `ACTIVITY_NOT_READY`;
- no broken mapping;
- no S0/S1 known defect.

---

# 64. PHASE 8 — PRODUCT QUALITY / OPERATIONS

## Deliverables
- calibrated route budgets
- low-end fallback
- PWA/offline
- atomic update
- security hardening
- CI/CD
- rollback
- licensing
- telemetry/privacy
- SLO baseline

## Gate

```text
S0 = 0
S1 = 0
criticalAccessibility = 0
criticalSecurity = 0
uncaughtCoreErrors = 0
LCP <= 2.5s
CLS <= 0.1
INP <= 200ms
```

---

# 65. PHASE 9 — BETA 2: 9–10-SINF

Oldin capability gap analysis.

Maxsus yangi engine faqat:
- existing engine config bilan yopib bo‘lmasa;
- reusable bo‘lsa;
- ADR tasdiqlansa

yaratiladi.

---

# 66. PHASE 10 — BETA 3: 11-SINF

Advanced:
- equilibrium
- electrolysis
- redox
- gas laws
- concentration
- Faraday
- advanced ionic chemistry

---

# 67. PHASE 11 — RELEASE CANDIDATE

## Gate
- 122/122 LearningUnit
- required coverage 100%
- S0=0
- S1=0
- required approvals complete
- full E2E
- visual regression
- offline
- accessibility
- performance
- security
- rollback drill
- source provenance complete
- traceability complete

---

# 68. PHASE 12 — STABLE

Stable:
- catalogue emas;
- real interactive product;
- content/code separated;
- rollbackable;
- scientifically traceable;
- accessible;
- low-end usable;
- persistent;
- maintainable.

---

# 69. REQUIREMENT TRACEABILITY MATRIX — CORE

| Req | Module | Test | Approval/Gate |
|---|---|---|---|
| PROD-001 | learning-runner | full-flow E2E | Phase 5 |
| PROD-002 | theory/practice renderers | macro-micro-symbolic integration | Didactic |
| DATA-001 | content-src | source ownership test | Phase 1 |
| DATA-014 | mapping registry | mapping validator | Phase 1 |
| VER-002 | content pack | checksum/manifest test | Phase 1/8 |
| ID-001 | alias/id registry | rename migration test | Phase 1 |
| CHEM-020 | FormulaParser | unit + fuzz | Phase 2 |
| CHEM-030 | EquationBalancer | 200 corpus | Phase 2 |
| CHEM-060 | ReactionMatcher | condition tests | Chemistry |
| CHEM-070 | IonicEngine | ionic corpus | Chemistry |
| LEARN-001 | Evidence | discriminated union tests | Phase 3 |
| MASTER-001 | Mastery | scoring tests | Didactic |
| PROG-010 | IndexedDB | reload integration | Phase 3 |
| ENG-010 | Experiment | reducer/E2E | Technical/Chemistry |
| ENG-020 | Simulation | serialization/E2E | Technical/A11y |
| ENG-030 | Trainer | feedback tests | Didactic |
| ENG-040 | Calculation | unit/tolerance tests | Didactic |
| ENG-050 | Case | rubric tests | Didactic |
| UX-001 | LearningHub | visual/E2E | UX |
| A11Y-001 | UI all | axe/keyboard | Accessibility |
| PERF-002 | all routes | Lighthouse/custom perf | Phase 8 |
| SEC-001 | server/deploy | traversal regression | Phase 0 |
| OFF-001 | PWA | atomic update E2E | Phase 8 |
| OPS-023 | release | rollback drill | RC |

To‘liq traceability JSON/CSV CI’da generatsiya qilinadi.

---

# 70. FINAL DEFINITION OF DONE

## Activity DONE

Activity `DONE` faqat:

- stable canonical ID;
- schema valid;
- lifecycle = ready;
- concept mapping valid;
- engine compatibility valid;
- real interaction;
- typed evidence;
- progress restore;
- accessibility;
- structured errors;
- automated tests;
- source provenance;
- applicable approvals;
- version/hash

mavjud bo‘lsa.

## LearningUnit DONE

- outcome;
- prerequisite;
- theory;
- primary practice;
- assessment;
- remediation;
- progress;
- mastery;
- next recommendation;
- E2E coverage.

## Release DONE

- phase gate green;
- S0=0;
- S1=0;
- no required approval pending;
- compatibility valid;
- rollback verified;
- performance budget;
- fatal console errors = 0.

---

# 71. BLACK SWAN HIMOYALARI

## BS-001 — Curriculum split/merge
Alias + migration + mastery recalculation.

## BS-002 — Old offline data/new app
Compatibility handshake + previous pack fallback.

## BS-003 — Chemistry rules regression
Evidence chemistryRulesVersion bilan stamp qilinadi.

## BS-004 — Ambiguous reaction
`REACTION_CONDITION_REQUIRED`.

## BS-005 — Storage quota
Heavy cache purge, progress protected.

## BS-006 — GPU crash
2D/text fallback.

## BS-007 — Stale approval
Hash o‘zgarsa pending.

## BS-008 — Partial deploy
Atomic activation.

## BS-009 — Wrong content release
One-command rollback.

## BS-010 — ID rename
Stable ID + alias.

## BS-011 — Wrong dedupe
Semantic dedupe human approval.

## BS-012 — Stale worksheet
contentVersion + assessmentVersion stamp.

---

# 72. ANTI-PATTERNLAR

TAQIQLANADI:

1. coverage=Mavjud → ready deb olish.
2. duplicate canonical relations.
3. title’dan ID regen.
4. XLSX va canonical source parallel manual tahrir.
5. step text animatsiyasini lab engine deyish.
6. unknown chemistry resultni taxmin qilish.
7. `Evidence.value: unknown`.
8. activity complete = mastery.
9. approvalni version/hashdan ajratish.
10. 122 topicni first-load qilish.
11. barcha Sinco assetlarni deploy qilish.
12. source XLSXni prodga chiqarish.
13. known security issue’ni keyinga qoldirish.
14. rollback’siz content deploy.
15. “same pipeline” bilan 9–11 complexity’ni yashirish.
16. engine configni version compatibility’siz ochish.
17. chemistry source/provenance’siz release.
18. accessibility’ni faqat yakuniy polish sifatida ko‘rish.

---

# 73. FINAL ACCEPTANCE FORMULA

KimyoLab v20 faqat quyidagi zanjir real ishlaganda **Stable Product** hisoblanadi:

```text
Authoritative content source
→ Versioned canonical content pack
→ Stable domain contracts
→ Learning Unit
→ Theory
→ Appropriate interactive activity
→ Typed scientific evidence
→ Assessment
→ Mastery
→ Persistent progress
→ Product UX
→ Quality gates
→ Atomic release / rollback
```

Foydalanuvchi esa:

```text
O‘rganish
→ Sinab ko‘rish
→ Kuzatish
→ Tushuntirish
→ Mashq
→ Natija
```

tajribasini ko‘radi.

---

# 74. SPEC FREEZE

Ushbu hujjat **v2.1 FINAL IMPLEMENTATION SPEC** sifatida muzlatiladi.

Keyingi o‘zgarishlar:
- yangi requirement;
- breaking schema;
- engine contract;
- release gate

uchun ADR + TT version bump talab qiladi.

Keyingi bosqich:

```text
PHASE 0
→ PHASE 1
```

implementation.
