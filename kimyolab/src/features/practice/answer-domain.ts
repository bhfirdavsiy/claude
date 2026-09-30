// P2.1 — closed answer domains. A learner must never have to TYPE an internal canonical token ("acidic",
// "polybutadiene-repeat-unit", "no-shift"): when the domain/config defines the complete set of canonical values for a
// field, the field becomes a choice. The option set comes ONLY from the domain constant or the model data the engine
// itself uses — never from the expected answer, never invented here. Where the repository holds only the target value
// (generic simulations, bounded-choice), no option set exists: the field stays free text and the gap is reported
// (OPTION_SET_MISSING, reports/learner-answer-input-audit.json) instead of fabricating distractors.
import type {StudentPracticePageModel} from './model.ts';
import {ManganeseRedoxModel} from '../../domain/chemistry/manganese-redox-model.ts';
import {KINETICS_EFFECTS} from '../../domain/chemistry/kinetics-model.ts';
import {EQUILIBRIUM_SHIFTS} from '../../domain/chemistry/equilibrium-model.ts';

export type AnswerCategory='ENUM'|'SPECIES'|'REACTION_TYPE'|'POLYMER_STRUCTURE'|'MEDIUM'|'PROCESS'|'OTHER';
export interface AnswerDomain {
  /** localization namespace: labels are `answer.<domain>.<value>` */
  domain:string;
  /** canonical tokens, exactly as the engine compares them */
  values:string[];
  valueType:'text'|'boolean';
  /** where the set comes from (audit) */
  source:string;
}

const uniq=(xs:string[])=>[...new Set(xs)];
const BOOLEAN:AnswerDomain={domain:'boolean',values:['true','false'],valueType:'boolean',source:'boolean'};

/** The closed answer domain of one form field, or null when the field is open (formula, number, constructed answer)
 *  or when the repository has no option set for it. */
export function answerDomainOf(page:StudentPracticePageModel,field:string):AnswerDomain|null{
  const plan=page.executionPlan, c=page.referenceConfig??{};
  if(plan.runtime==='beta2-advanced'&&plan.capability==='manganese-redox-simulation'&&field==='medium'){
    try{ return {domain:'manganese-medium',values:ManganeseRedoxModel.from(page.chemistry.manganeseRedox).media(),valueType:'text',source:'chemistry/manganese-redox.json'}; }
    catch{ return null; }
  }
  if(plan.runtime==='beta3-advanced'){
    if(c.task==='kinetics-factor') return {domain:'kinetics-effect',values:[...KINETICS_EFFECTS],valueType:'text',source:'KINETICS_EFFECTS'};
    if(c.task==='equilibrium-shift') return {domain:'equilibrium-shift',values:[...EQUILIBRIUM_SHIFTS],valueType:'text',source:'EQUILIBRIUM_SHIFTS'};
    if(c.task==='nuclear-conservation'||c.task==='equal-rates') return BOOLEAN;
    return null;
  }
  if(plan.runtime==='beta2-organic'){
    const o=page.chemistry.organic, molecules:any[]=Array.isArray(o?.molecules)?o.molecules:[], reactions:any[]=Array.isArray(o?.reactions)?o.reactions:[];
    if(c.task==='molecule-property'&&c.property==='class') return {domain:'organic-class',values:uniq(molecules.map(m=>String(m.class))),valueType:'text',source:'chemistry/organic.json#molecules.class'};
    if(c.task==='molecule-property'&&c.property==='name') return {domain:'organic-name',values:uniq(molecules.map(m=>String(m.name))),valueType:'text',source:'chemistry/organic.json#molecules.name'};
    if(c.task==='molecule-property'&&c.property==='aromatic') return BOOLEAN;
    if(c.task==='reaction-type') return {domain:'organic-reaction-type',values:uniq(reactions.map(r=>String(r.reactionType))),valueType:'text',source:'chemistry/organic.json#reactions.reactionType'};
    if(c.task==='reaction-product') return {domain:'organic-product',values:uniq(reactions.flatMap(r=>Array.isArray(r.productIds)?r.productIds.map(String):[])),valueType:'text',source:'chemistry/organic.json#reactions.productIds'};
  }
  return null;
}

/** Audit category of a closed domain (reports only). */
export function categoryOfDomain(domain:string):AnswerCategory{
  if(domain==='manganese-medium') return 'MEDIUM';
  if(domain==='organic-reaction-type') return 'REACTION_TYPE';
  if(domain==='organic-product'||domain==='organic-name') return 'SPECIES';
  if(domain==='kinetics-effect'||domain==='equilibrium-shift') return 'PROCESS';
  return domain==='boolean'||domain==='organic-class'?'ENUM':'OTHER';
}
