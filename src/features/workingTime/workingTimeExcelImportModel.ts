export const WORKING_TIME_XLSM_MIME = 'application/vnd.ms-excel.sheet.macroEnabled.12';
export const WORKING_TIME_XLSM_PARSER_VERSION = 'seapilot-xlsm-v1';

export interface WorkingTimeImportPhase {
  startMinute: number;
  endMinute: number;
}

export interface WorkingTimeImportDetectedRow {
  date: string;
  sourceSheet: string;
  sourceRow: number;
  detectedPhases: WorkingTimeImportPhase[];
  reportedWorkSeconds: number | null;
  detectedWorkSeconds: number;
  captainName: string;
  vesselName: string;
  imoNumber: string;
  flagState: string;
  sourceComment: string;
  issues: string[];
}

export interface WorkingTimeImportWorkbook {
  sourceFileName: string;
  detectedPersonName: string;
  detectedYear: number;
  gridYear: number;
  fileNameYear: number | null;
  warnings: string[];
  macroPresent: boolean;
  macroExecution: 'disabled';
  parserVersion: string;
  sheetNames: string[];
  rows: WorkingTimeImportDetectedRow[];
  detectedWorkSeconds: number;
  reportedWorkSeconds: number;
}

function minuteLabel(value: number): string {
  if (value === 1440) return '24:00';
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function formatWorkingTimeImportPhases(phases: WorkingTimeImportPhase[]): string {
  return phases.map((phase) => `${minuteLabel(phase.startMinute)}-${minuteLabel(phase.endMinute)}`).join(', ');
}

export function parseWorkingTimeImportPhaseText(value: string): WorkingTimeImportPhase[] {
  if (!value.trim()) return [];
  const phases = value.split(/[,;\n]+/).map((entry) => {
    const match = entry.trim().match(/^(\d{1,2}):([03]0)\s*[-–]\s*(\d{1,2}):([03]0)$/);
    if (!match) throw new Error(`Créneau invalide « ${entry.trim()} ». Format attendu : 08:00-12:30.`);
    const startMinute = Number(match[1]) * 60 + Number(match[2]);
    const endMinute = Number(match[3]) * 60 + Number(match[4]);
    if (startMinute < 0 || startMinute >= 1440 || endMinute <= 0 || endMinute > 1440 || endMinute <= startMinute) {
      throw new Error(`Créneau invalide « ${entry.trim()} » : la fin doit suivre le début dans la même journée.`);
    }
    return { startMinute, endMinute };
  }).sort((left, right) => left.startMinute - right.startMinute);
  if (phases.some((phase, index) => index > 0 && phases[index - 1].endMinute > phase.startMinute)) {
    throw new Error('Les créneaux corrigés ne doivent pas se chevaucher.');
  }
  return phases;
}
