/**
 * Calendario de CYO.
 *
 * Para que "1 hora real = 6 meses simulados" sea EXACTO y no acumule errores de redondeo,
 * el juego usa un calendario de cómputo de 12 meses x 30 días = 360 días/año
 * (convención financiera 30/360). Así:
 *   6 meses = 180 días;  3 600 000 ms / 180 = 20 000 ms por día, exacto.
 * El tiempo se lleva como un entero de milisegundos activos acumulados; el día actual es
 * floor(ms / REAL_MS_PER_DAY). No hay coma flotante en el reloj.
 */
export const START_YEAR = 1990;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR; // 360
export const REAL_MS_PER_DAY = 20_000;
export const REAL_MS_PER_HOUR = 3_600_000;
export const DAYS_PER_REAL_HOUR = REAL_MS_PER_HOUR / REAL_MS_PER_DAY; // 180 = 6 meses

export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];
export const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface GameDate { year: number; month: number; day: number }

/** day 0 = 1 de enero de 1990 */
export function dayToDate(dayIndex: number): GameDate {
  const d = Math.floor(dayIndex);
  const year = START_YEAR + Math.floor(d / DAYS_PER_YEAR);
  const rem = ((d % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  return { year, month: Math.floor(rem / DAYS_PER_MONTH) + 1, day: (rem % DAYS_PER_MONTH) + 1 };
}

export function dateToDay(date: GameDate): number {
  return (date.year - START_YEAR) * DAYS_PER_YEAR + (date.month - 1) * DAYS_PER_MONTH + (date.day - 1);
}

export function formatDate(dayIndex: number, short = false): string {
  const g = dayToDate(dayIndex);
  return short ? `${g.day} ${MONTH_SHORT[g.month - 1]} ${g.year}` : `${g.day} de ${MONTH_NAMES[g.month - 1]} de ${g.year}`;
}

export function isMonthStart(dayIndex: number): boolean { return dayIndex % DAYS_PER_MONTH === 0; }
export function isYearStart(dayIndex: number): boolean { return dayIndex % DAYS_PER_YEAR === 0; }
export function monthIndex(dayIndex: number): number { return Math.floor(dayIndex / DAYS_PER_MONTH); }
export function yearFraction(days: number): number { return days / DAYS_PER_YEAR; }
