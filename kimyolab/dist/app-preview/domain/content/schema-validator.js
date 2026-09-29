                             
                
                   
                      
                                          
                     
 

function valueType(value         )         {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

export function validateAgainstSchema(schema            , value         , path = '$')           {
  const errors           = [];
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    errors.push(`${path}:enum`);
    return errors;
  }
  if (schema.type) {
    const actual = valueType(value);
    if (actual !== schema.type) {
      errors.push(`${path}:type:${actual}->${schema.type}`);
      return errors;
    }
  }
  if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value                           ;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path}:missing:${key}`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in obj) errors.push(...validateAgainstSchema(child, obj[key], `${path}.${key}`));
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => errors.push(...validateAgainstSchema(schema.items , item, `${path}[${index}]`)));
  }
  return errors;
}
