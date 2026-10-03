// P2.12 — Content Studio (ADR-P2-013): the pedagogical ROLE of a piece of content comes first, the renderer/runtime
// second. A role is chosen by the author ("what is this material?"), never guessed from words such as "tajriba",
// "elektroliz" or "amaliy ish". Only content authored AS a laboratory instruction reaches the instruction parser.
//
// The roles map onto the canonical contracts that already exist (learning unit → theory / practice / assessment);
// P2.12 adds no parallel content model. Each role states honestly what the Studio can do with it today.
export type ContentRole=
  |'EXPLANATION'           // reading / explanation
  |'TEXTBOOK_EXCERPT'      // a human-cut, rights-checked excerpt of a textbook (PDF)
  |'VISUAL'                // visual material
  |'QUESTION'              // a question
  |'INTERACTIVE_TASK'      // an interactive task
  |'PRACTICAL_ACTIVITY'    // a practical activity (not automatically a lab)
  |'LAB_INSTRUCTION'       // a physical / procedural lab instruction (the ONLY role the instruction parser sees)
  |'SAFETY'                // safety information (a constraint, never a chemistry action)
  |'LEARNER_RESPONSE'      // compare / explain / infer / record — never a chemistry handler
  |'ASSESSMENT';           // assessment

/** implemented: a full Studio lane · not-yet-supported: the role exists in the architecture, no Studio lane yet */
export type RoleSupport='implemented'|'not-yet-supported';

export interface ContentRoleDefinition {
  role:ContentRole;
  /** the author-facing name key (content-src/locales/uz-latn/content-studio.json) */
  labelKey:string;
  support:RoleSupport;
  /** the canonical contract this role lands in (internal; never shown to the author) */
  canonicalContract:string;
  /** the learner renderer that shows it (internal) */
  learnerRenderer:string|null;
  /** whether the lab-instruction parser may run on it */
  instructionParser:boolean;
}

export const CONTENT_ROLES:readonly ContentRoleDefinition[]=Object.freeze([
  {role:'TEXTBOOK_EXCERPT',labelKey:'studio.role.textbook-excerpt',support:'implemented',canonicalContract:'kimyolab.textbook-excerpt.v1 + kimyolab.source-intake.v1',learnerRenderer:'src/features/textbook-excerpt/render.ts',instructionParser:false},
  {role:'LAB_INSTRUCTION',labelKey:'studio.role.lab-instruction',support:'implemented',canonicalContract:'practice-activity legacyContent.steps + kimyolab.topic-lab-profile.v1',learnerRenderer:'src/features/dynamic-lab/render.ts',instructionParser:true},
  {role:'EXPLANATION',labelKey:'studio.role.explanation',support:'not-yet-supported',canonicalContract:'kimyolab.structured-theory (theory:apply)',learnerRenderer:'src/features/learning-hub',instructionParser:false},
  {role:'VISUAL',labelKey:'studio.role.visual',support:'not-yet-supported',canonicalContract:'theory representationModes',learnerRenderer:null,instructionParser:false},
  {role:'QUESTION',labelKey:'studio.role.question',support:'not-yet-supported',canonicalContract:'assessment-items',learnerRenderer:'src/features/practice',instructionParser:false},
  {role:'INTERACTIVE_TASK',labelKey:'studio.role.interactive-task',support:'not-yet-supported',canonicalContract:'practice-activity (trainer / simulation)',learnerRenderer:'src/features/practice',instructionParser:false},
  {role:'PRACTICAL_ACTIVITY',labelKey:'studio.role.practical-activity',support:'not-yet-supported',canonicalContract:'practice-activity (case / calculation)',learnerRenderer:'src/features/practice',instructionParser:false},
  {role:'SAFETY',labelKey:'studio.role.safety',support:'not-yet-supported',canonicalContract:'legacyContent.safety (profile safety notes)',learnerRenderer:'src/features/dynamic-lab/render.ts',instructionParser:false},
  {role:'LEARNER_RESPONSE',labelKey:'studio.role.learner-response',support:'not-yet-supported',canonicalContract:'learner-response checkers',learnerRenderer:null,instructionParser:false},
  {role:'ASSESSMENT',labelKey:'studio.role.assessment',support:'not-yet-supported',canonicalContract:'assessment-bank (review:import)',learnerRenderer:'src/features/practice',instructionParser:false},
]);

export const roleDefinition=(role:ContentRole)=>CONTENT_ROLES.find(r=>r.role===role);

/** The instruction parser runs only on content explicitly authored as a lab instruction — never on a keyword match. */
export function mayParseInstruction(role:ContentRole):boolean{ return roleDefinition(role)?.instructionParser===true; }
