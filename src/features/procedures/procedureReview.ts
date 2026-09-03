const DAY_MS = 86_400_000;

export interface AnnualReviewAlert {
  dueDate: string;
  daysUntilDue: number;
  label: string;
  tone: 'danger' | 'warning';
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 12);
  if (
    !Number.isFinite(parsed.getTime())
    || parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) return null;
  return parsed;
}

function toIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function buildProcedureCode(theme: string, documentNumber: string, versionLabel: string): string {
  const prefix = [theme.trim().toUpperCase(), documentNumber.trim()].filter(Boolean).join(' ');
  const version = versionLabel.trim().toUpperCase();
  return `${prefix}${prefix && version ? '-' : ''}${version}`;
}

export function getAnnualReviewDueDate(diffusionOn: string): string {
  const diffusionDate = parseIsoDate(diffusionOn);
  if (!diffusionDate) return '';

  const targetYear = diffusionDate.getFullYear() + 1;
  const targetMonth = diffusionDate.getMonth();
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0, 12).getDate();
  return toIsoDate(new Date(targetYear, targetMonth, Math.min(diffusionDate.getDate(), lastDayOfTargetMonth), 12));
}

export function getAnnualReviewAlert(
  annualReview: boolean,
  diffusionOn: string,
  today = new Date(),
  horizonDays = 90,
): AnnualReviewAlert | null {
  if (!annualReview) return null;
  const dueDate = getAnnualReviewDueDate(diffusionOn);
  const parsedDueDate = parseIsoDate(dueDate);
  if (!parsedDueDate) return null;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const daysUntilDue = Math.round((parsedDueDate.getTime() - startOfToday.getTime()) / DAY_MS);
  if (daysUntilDue > horizonDays) return null;

  const label = daysUntilDue < 0
    ? `Revue échue depuis ${Math.abs(daysUntilDue)} j`
    : daysUntilDue === 0
      ? "Revue annuelle aujourd'hui"
      : daysUntilDue === 1
        ? 'Revue annuelle demain'
        : `Revue annuelle · J-${daysUntilDue}`;

  return {
    dueDate,
    daysUntilDue,
    label,
    tone: daysUntilDue <= 30 ? 'danger' : 'warning',
  };
}
