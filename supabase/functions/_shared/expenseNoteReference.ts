export async function formatExpenseNoteReference(noteId: string): Promise<string> {
  const id = new TextEncoder().encode(noteId.toLowerCase());
  const digest = new DataView(await crypto.subtle.digest('SHA-256', id));

  // 44 bits fit in eight base-36 characters followed by a decimal digit.
  const value = Number(digest.getBigUint64(0) >> 20n);
  const code = Math.floor(value / 10).toString(36).toUpperCase().padStart(8, '0');
  return `N${code}${value % 10}`;
}
