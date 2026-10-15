/** Hide only the final PDF extension in document titles; stored names stay intact. */
export function procedureDisplayTitle(title: string): string {
  return title.replace(/\.pdf\s*$/i, '');
}
