/** Accept only the supported county; do not confuse city names with county names. */
export function isFultonCounty(county: string): boolean {
  return /^fulton(?:\s+county)?$/i.test(county.trim());
}

/** Editing a field is not confirmation; the caller records explicit checkbox review. */
export function fieldsRequiringReview(fields: readonly string[], confirmed: ReadonlySet<string>): string[] {
  return fields.filter((field) => !confirmed.has(field));
}
