// Localized element names (P1.4 closeout). Chemical identity (Z, symbol) is domain truth in
// src/domain/chemistry/periodic-table.ts; the learner-facing NAME of an element is localized text that ships as
// content (content-src/locales/<locale, lower-case>/chemistry-elements.json → pack locales/…), is reviewed with the
// chemistry data (CHEM-033 review surface) and is looked up here — the one approved presentation mapper.
//
// Nothing in the domain (formula parser, atom model, scoring) reads a name. A missing name is not an error:
// the symbol itself is shown (it is the international name of the element).
import {ELEMENT_SYMBOL_SET} from '../../domain/chemistry/periodic-table.js';

export const ELEMENT_NAMES_SCHEMA='kimyolab.locale.chemistry-elements.v1';
export const DEFAULT_LOCALE='uz-Latn';
/** pack paths are lower-case (manifest path rule); the BCP 47 tag itself keeps its case ('uz-Latn') */
export const elementNamesPackPath=(locale       )=>`locales/${locale.toLowerCase()}/chemistry-elements.json`;

                                                                                            
/** symbol → display name; never throws */
                                                      

/** Validates the locale file: known schema, every key a real element symbol, every value non-empty text. */
export function parseElementNameCatalog(raw        )                   {
  const r=raw                                                    ;
  if(!r||r.schema!==ELEMENT_NAMES_SCHEMA||typeof r.locale!=='string'||!r.locale) throw new Error('ELEMENT_NAMES_INVALID:schema');
  if(!r.names||typeof r.names!=='object'||Array.isArray(r.names)) throw new Error('ELEMENT_NAMES_INVALID:names');
  const names                      ={};
  for(const [symbol,name] of Object.entries(r.names                          )){
    if(!ELEMENT_SYMBOL_SET.has(symbol)) throw new Error(`ELEMENT_NAMES_INVALID:symbol:${symbol}`);
    if(typeof name!=='string'||!name.trim()) throw new Error(`ELEMENT_NAMES_INVALID:name:${symbol}`);
    names[symbol]=name;
  }
  return Object.freeze({locale:r.locale,names:Object.freeze(names)});
}

// ------------------------------------------------------------------ P1.7: species names + one generic lookup

export const SPECIES_NAMES_SCHEMA='kimyolab.locale.chemistry-species.v1';
export const speciesNamesPackPath=(locale       )=>`locales/${locale.toLowerCase()}/chemistry-species.json`;
                                                                                            

/** Species names keyed by the species' existing `nameKey` (species.json). Values are display text only. */
export function parseSpeciesNameCatalog(raw        )                   {
  const r=raw                                                    ;
  if(!r||r.schema!==SPECIES_NAMES_SCHEMA||typeof r.locale!=='string'||!r.locale) throw new Error('SPECIES_NAMES_INVALID:schema');
  if(!r.names||typeof r.names!=='object'||Array.isArray(r.names)) throw new Error('SPECIES_NAMES_INVALID:names');
  const names                      ={};
  for(const [key,name] of Object.entries(r.names                          )){
    if(!/^species\.[a-z0-9()._-]+\.name$/.test(key)) throw new Error(`SPECIES_NAMES_INVALID:key:${key}`);
    if(typeof name!=='string'||!name.trim()) throw new Error(`SPECIES_NAMES_INVALID:name:${key}`);
    names[key]=name;
  }
  return Object.freeze({locale:r.locale,names:Object.freeze(names)});
}

// ------------------------------------------------------------------ P2.1: learner-interaction text

export const INTERACTION_SCHEMA='kimyolab.locale.learner-interaction.v1';
export const interactionPackPath=(locale       )=>`locales/${locale.toLowerCase()}/learner-interaction.json`;
/** Namespaces of learner-interaction keys: shared UI strings, field/step/evidence/action labels, answer-choice labels. */
export const INTERACTION_KEY=/^(ui|field|step|evidence|action|answer)\.\S(?:.*\S)?$/;
/** The shared interaction strings every legacy practice page needs; the build refuses a catalog without them. */
export const REQUIRED_UI_KEYS=['ui.submit','ui.apply','ui.retry','ui.choose','ui.correct','ui.incorrect','ui.observation','ui.continue','ui.not-modeled','ui.input-invalid','ui.complete','ui.error','ui.save-failed','ui.answer','ui.formula','ui.model','ui.exercise','ui.formula-trainer','ui.next','ui.do','ui.done','ui.step-fallback','ui.evidence-fallback','ui.option-fallback','ui.empty','ui.formula-prompt','ui.hint-fallback','ui.case-title','ui.case-legend','ui.case-decision','ui.case-justification','ui.case-reflection','ui.case-submit','ui.lab-stage','ui.lab-title','ui.lab-start','ui.lab-steps','ui.lab-equipment','ui.lab-materials','ui.lab-safety','ui.net-ionic','ui.obs-done','ui.obs-recorded','ui.obs-precipitate','ui.obs-precipitate-color','ui.obs-gas','ui.obs-color','ui.obs-heat-up','ui.obs-heat','ui.obs-none','ui.obs-state','ui.obs-generic','ui.back','ui.kicker','ui.calculation','ui.theory-explanation','ui.theory-examples','ui.theory-example','ui.theory-problem','ui.theory-steps','ui.theory-answer','ui.theory-misconceptions','ui.theory-wrong','ui.theory-right','ui.theory-summary','ui.theory-sources','ui.theory-source','ui.theory-review-pending','ui.theory-review-draft','ui.theory-review-changes','ui.theory-review-stale',
  // P2.9: feedback taxonomy and the localized quiz/reflection validation
  'ui.intermediate','ui.procedure-blocked','ui.sim-target-only','ui.quiz-unanswered','ui.reflection-incomplete']         ;
                                                                                             

/** Display text only: a label never carries a canonical token's meaning into the domain (presentation maps back). */
export function parseInteractionCatalog(raw        )                   {
  const r=raw                                                     ;
  if(!r||r.schema!==INTERACTION_SCHEMA||typeof r.locale!=='string'||!r.locale) throw new Error('INTERACTION_TEXT_INVALID:schema');
  if(!r.labels||typeof r.labels!=='object'||Array.isArray(r.labels)) throw new Error('INTERACTION_TEXT_INVALID:labels');
  const labels                      ={};
  for(const [key,text] of Object.entries(r.labels                          )){
    if(!INTERACTION_KEY.test(key)) throw new Error(`INTERACTION_TEXT_INVALID:key:${key}`);
    if(typeof text!=='string'||!text.trim()) throw new Error(`INTERACTION_TEXT_INVALID:text:${key}`);
    labels[key]=text;
  }
  for(const key of REQUIRED_UI_KEYS) if(!Object.prototype.hasOwnProperty.call(labels,key)) throw new Error(`INTERACTION_TEXT_INVALID:missing:${key}`);
  return Object.freeze({locale:r.locale,labels:Object.freeze(labels)});
}

/** A localization key → display text, or null when there is none (the caller then shows the formula/symbol).
 *  Keys: `element.<Symbol>` (element names), species `nameKey`s (`species.<id>.name`) and (P2.1) learner-interaction
 *  keys (`ui.*`, `field.*`, `step.*`, `evidence.*`, `action.*`, `answer.<domain>.<value>`). */
                                               
export function createLocalizer(catalogs                                                                                                              )         {
  const el=catalogs?.elementNames?.names??{}, sp=catalogs?.speciesNames?.names??{}, ix=catalogs?.interaction?.labels??{};
  const own=(o                                ,k       )=>Object.prototype.hasOwnProperty.call(o,k)?o[k] :null;
  return (key)=>key.startsWith('element.')?own(el,key.slice('element.'.length)):key.startsWith('species.')?own(sp,key):own(ix,key);
}

export function elementNameMapper(catalog                             )                  {
  const names=catalog?.names??{};
  return (symbol)=>Object.prototype.hasOwnProperty.call(names,symbol)?names[symbol] :symbol;
}
