/**
 * Delivery date/slot rules used by the cart personalization block. Mirrors
 * the business rules audited in AUDITORIA_FUNCIONALIDADES.md §3.1:
 *  - Sundays are always blocked.
 *  - Same-day orders require the current time to be before 10:30 AM, and at
 *    least 4 hours (MIN_LEAD_MINUTES) before the start of the chosen slot.
 *  - Next-day orders block both slots if placed after 20:00 today.
 *  - Any date 2+ days out is always available (unless Sunday).
 */

export const MIN_LEAD_MINUTES = 4 * 60;
export const SAME_DAY_CUTOFF_MINUTES = 10 * 60 + 30;
export const NEXT_DAY_CUTOFF_HOUR = 20;

export const SLOTS = [
  { id: 'manana', label: 'Mañana', time: '9:00 – 13:00', startHour: 9, endHour: 13 },
  { id: 'tarde', label: 'Tarde', time: '13:00 – 18:00', startHour: 13, endHour: 18 },
];

/** @param {Date} [now] */
export function todayISO(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];
}

/** @param {Date} [now] */
export function tomorrowISO(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/** @param {string} iso */
function dateFromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** @param {string} dateISO */
export function isSunday(dateISO) {
  return dateFromISO(dateISO).getDay() === 0;
}

/**
 * @param {string} dateISO
 * @param {'manana' | 'tarde'} slotId
 * @param {Date} [now]
 */
export function isSlotAvailable(dateISO, slotId, now = new Date()) {
  if (isSunday(dateISO)) return false;
  const slot = SLOTS.find((s) => s.id === slotId);
  if (!slot) return false;

  const isSameDay = dateISO === todayISO(now);
  const isNextDay = dateISO === tomorrowISO(now);

  if (isSameDay) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin >= SAME_DAY_CUTOFF_MINUTES) return false;
    return slot.startHour * 60 - nowMin >= MIN_LEAD_MINUTES;
  }

  if (isNextDay) {
    return now.getHours() < NEXT_DAY_CUTOFF_HOUR;
  }

  return true;
}

/**
 * @param {string} dateISO
 * @param {Date} [now]
 */
export function isDateSelectable(dateISO, now = new Date()) {
  if (isSunday(dateISO)) return false;
  return SLOTS.some((s) => isSlotAvailable(dateISO, s.id, now));
}

/** @param {Date} [now] */
export function isTodaySelectable(now = new Date()) {
  return isDateSelectable(todayISO(now), now);
}

/** @param {Date} [now] */
export function getMinSelectableDate(now = new Date()) {
  if (isTodaySelectable(now)) return todayISO(now);
  for (let i = 1; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    if (isDateSelectable(iso, now)) return iso;
  }
  return tomorrowISO(now);
}

/** @param {string | null | undefined} slotId */
export function getSlotLabel(slotId) {
  const slot = SLOTS.find((s) => s.id === slotId);
  return slot ? `${slot.label} (${slot.time})` : '';
}

/** Reverse lookup used to prefill the UI from a previously stored, human-readable cart attribute. */
export function slotIdFromLabel(label) {
  const slot = SLOTS.find((s) => getSlotLabel(s.id) === label);
  return slot ? slot.id : '';
}
