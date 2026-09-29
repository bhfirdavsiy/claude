export interface JsonSchema {
  type?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}

function valueType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

export function validateAgainstSchema(schema: JsonSchema, value: unknown, path = '$'): string[] {
  const errors: string[] = [];
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
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path}:missing:${key}`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in obj) errors.push(...validateAgainstSchema(child, obj[key], `${path}.${key}`));
    }
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => errors.push(...validateAgainstSchema(schema.items!, item, `${path}[${index}]`)));
  }
  return errors;
}
