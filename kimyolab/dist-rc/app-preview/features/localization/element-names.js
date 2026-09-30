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

/** A localization key → display text, or null when there is none (the caller then shows the formula/symbol).
 *  Keys: `element.<Symbol>` (element names) and species `nameKey`s (`species.<id>.name`). */
                                               
export function createLocalizer(catalogs                                                                              )         {
  const el=catalogs?.elementNames?.names??{}, sp=catalogs?.speciesNames?.names??{};
  const own=(o                                ,k       )=>Object.prototype.hasOwnProperty.call(o,k)?o[k] :null;
  return (key)=>key.startsWith('element.')?own(el,key.slice('element.'.length)):own(sp,key);
}

export function elementNameMapper(catalog                             )                  {
  const names=catalog?.names??{};
  return (symbol)=>Object.prototype.hasOwnProperty.call(names,symbol)?names[symbol] :symbol;
}
