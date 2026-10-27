/** Display the known serialized field separator without interpreting free-form addresses. */
export function formatClientContactLines(value: string): string {
  return value.replace(/[\t ]+·[\t ]+/g, '\n');
}
