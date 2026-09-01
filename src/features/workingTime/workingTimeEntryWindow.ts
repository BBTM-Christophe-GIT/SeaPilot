export function workingTimeEntryCutoffDate(localWorkDate: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(localWorkDate);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return '';
  const cutoffYear = month === 12 ? year + 1 : year;
  const cutoffMonth = month === 12 ? 1 : month + 1;
  return `${cutoffYear}-${String(cutoffMonth).padStart(2, '0')}-05`;
}

export function workingTimeEntryDateIsOpen(localWorkDate: string, referenceDate: string): boolean {
  const cutoffDate = workingTimeEntryCutoffDate(localWorkDate);
  return Boolean(cutoffDate && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate) && referenceDate <= cutoffDate);
}

export function workingTimeEntryIsInGracePeriod(localWorkDate: string, referenceDate: string): boolean {
  return workingTimeEntryDateIsOpen(localWorkDate, referenceDate)
    && localWorkDate.slice(0, 7) < referenceDate.slice(0, 7);
}
