import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 'YYYY-MM-DD' → 'Oct 05, 2026' without timezone shifts. */
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${MONTHS[Number.parseInt(m!, 10) - 1]} ${d}, ${y}`;
}

/** Two 'YYYY-MM-DD' dates → 'Oct 5 – 11' or 'Sep 28 – Oct 4' (', 2026' appended when withYear). */
export function fmtRange(start: string, end: string, withYear = false) {
  const [, sm, sd] = start.split('-').map((p) => Number.parseInt(p, 10));
  const [ey, em, ed] = end.split('-').map((p) => Number.parseInt(p, 10));
  const range = sm === em ? `${MONTHS[sm! - 1]} ${sd} – ${ed}` : `${MONTHS[sm! - 1]} ${sd} – ${MONTHS[em! - 1]} ${ed}`;
  return withYear ? `${range}, ${ey}` : range;
}

/** 'YYYY-MM' → 'October 2026' (or just 'October'). */
export function monthLabel(ym: string, withYear = true) {
  const [y, m] = ym.split('-');
  const name = MONTHS_LONG[Number.parseInt(m!, 10) - 1];
  return withYear ? `${name} ${y}` : name!;
}

/** The last `count` months as 'YYYY-MM', newest first, ending with the month of `fromIso`. */
export function recentMonths(count = 12, fromIso = todayIso()) {
  let y = Number.parseInt(fromIso.slice(0, 4), 10);
  let m = Number.parseInt(fromIso.slice(5, 7), 10);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
