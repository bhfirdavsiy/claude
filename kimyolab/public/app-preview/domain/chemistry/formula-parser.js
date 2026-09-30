import { ELEMENT_SYMBOL_SET } from './periodic-table.js';
                                                                                               
export class FormulaError extends Error {
  code                  ;
  constructor(code                  , message         = code) { super(message); this.name = 'FormulaError'; this.code = code; }
}

                                
                                
                 
                                                                          
                     
                       
 

const ELEMENTS = ELEMENT_SYMBOL_SET;
const OPEN                        = {'(':')','[':']','{':'}'};
const CLOSE = new Set(Object.values(OPEN));

function add(target                      , source                      , factor=1) {
  for (const [el,count] of Object.entries(source)) target[el] = (target[el] || 0) + count * factor;
}

function parseSegment(segment       )                        {
  let i = 0;
  function number()         {
    let digits = '';
    while (i < segment.length && /\d/.test(segment[i])) digits += segment[i++];
    if (!digits) return 1; const value=Number(digits); if(value<1) throw new FormulaError('FORMULA_INVALID','Subscript must be positive'); return value;
  }
  function group(expectedClose        )                        {
    const out                       = {};
    let tokenCount = 0;
    while (i < segment.length) {
      const ch = segment[i];
      if (CLOSE.has(ch)) {
        if (!expectedClose || ch !== expectedClose) throw new FormulaError('FORMULA_INVALID', 'Mismatched formula group');
        i++;
        return out;
      }
      if (OPEN[ch]) {
        i++;
        const inner = group(OPEN[ch]);
        const mult = number();
        add(out, inner, mult);
        tokenCount++;
        continue;
      }
      if (/[A-Z]/.test(ch)) {
        let symbol = segment[i++];
        if (i < segment.length && /[a-z]/.test(segment[i])) symbol += segment[i++];
        if (!ELEMENTS.has(symbol)) throw new FormulaError('FORMULA_INVALID', `Unknown element ${symbol}`);
        const mult = number();
        out[symbol] = (out[symbol] || 0) + mult;
        tokenCount++;
        continue;
      }
      throw new FormulaError('FORMULA_INVALID', `Unexpected token ${ch}`);
    }
    if (expectedClose) throw new FormulaError('FORMULA_INVALID', 'Unclosed formula group');
    if (!tokenCount) throw new FormulaError('FORMULA_INVALID', 'Empty formula');
    return out;
  }
  const result = group();
  if (i !== segment.length) throw new FormulaError('FORMULA_INVALID');
  return result;
}

function stripCharge(raw       )                                  {
  const caret = raw.match(/\^(\d+)?([+-])$/);
  if (caret) return { formula: raw.slice(0, caret.index), charge: (caret[2] === '+' ? 1 : -1) * Number(caret[1] || 1) };

  const singleElement = raw.match(/^([A-Z][a-z]?)(\d+)([+-])$/);
  if (singleElement && ELEMENTS.has(singleElement[1])) {
    return { formula: singleElement[1], charge: (singleElement[3] === '+' ? 1 : -1) * Number(singleElement[2]) };
  }

  if (/\d[+-]$/.test(raw) && !/^([A-Z][a-z]?)(\d+)([+-])$/.test(raw)) {
    // Polyatomic charge magnitude without caret is ambiguous with the last subscript.
    if (/^[A-Z][A-Za-z0-9()\[\]{}]+\d[+-]$/.test(raw) && !/^NH4[+-]$/.test(raw)) {
      throw new FormulaError('FORMULA_SYNTAX_UNSUPPORTED', 'Use caret notation for polyatomic charge magnitude');
    }
  }

  const sign = raw.match(/([+-])$/);
  if (sign) return { formula: raw.slice(0, -1), charge: sign[1] === '+' ? 1 : -1 };
  return { formula: raw, charge: 0 };
}

export function parseFormula(input       )                {
  if (typeof input !== 'string') throw new FormulaError('FORMULA_INVALID');
  const compact = input.replace(/\s+/g, '');
  if (!compact) throw new FormulaError('FORMULA_INVALID');
  if (compact.length > 256) throw new FormulaError('INPUT_TOO_LONG');

  let isotopeMass                 ;
  let body = compact;
  const isotope = body.match(/^\^(\d+)(?=[A-Z])/);
  if (isotope) { isotopeMass = Number(isotope[1]); body = body.slice(isotope[0].length); }

  const charged = stripCharge(body);
  body = charged.formula;
  if (!body) throw new FormulaError('FORMULA_INVALID');

  const pieces = body.split(/[·.]/);
  if (pieces.some(p => !p)) throw new FormulaError('FORMULA_INVALID');
  const hydrateParts                                                        = [];
  const total                       = {};

  pieces.forEach((piece, index) => {
    let multiplier = 1;
    let formulaPart = piece;
    if (index > 0) {
      const m = piece.match(/^(\d+)(.+)$/);
      if (m) { multiplier = Number(m[1]); formulaPart = m[2]; }
    }
    const partAtoms = parseSegment(formulaPart);
    hydrateParts.push({ multiplier, atoms: partAtoms });
    add(total, partAtoms, multiplier);
  });

  return { atoms: total, charge: charged.charge, hydrateParts, normalized: body.replace(/\./g,'·'), ...(isotopeMass ? { isotopeMass } : {}) };
}
