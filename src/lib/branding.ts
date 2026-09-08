/** Display historical source labels with the current application name. */
export function displayBrandName(value: string): string {
  return value.replace(/seapilot/gi, 'BBTM');
}
