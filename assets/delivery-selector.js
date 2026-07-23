import { Component } from '@theme/component';
import {
  SLOTS,
  isSlotAvailable,
  isTodaySelectable,
  todayISO,
  tomorrowISO,
  getMinSelectableDate,
  slotIdFromLabel,
} from '@theme/delivery-rules';

/** Accepts either a raw slot id ('manana'/'tarde') or its human-readable label. */
function normalizeSlot(value) {
  if (!value) return '';
  if (SLOTS.some((s) => s.id === value)) return value;
  return slotIdFromLabel(value);
}

/**
 * @typedef {{dateInput: HTMLInputElement, dateHint: HTMLElement, slotHint: HTMLElement, slotButtons: HTMLButtonElement[]}} DeliverySelectorRefs
 * @extends {Component<DeliverySelectorRefs>}
 */
class DeliverySelectorComponent extends Component {
  requiredRefs = ['dateInput', 'slotButtons'];

  connectedCallback() {
    super.connectedCallback();

    const now = new Date();
    const minDate = getMinSelectableDate(now);
    const initialDate = this.dataset.initialDate || '';
    const initialSlot = normalizeSlot(this.dataset.initialSlot || '');

    this.refs.dateInput.min = minDate;
    this.refs.dateInput.value = this.#isUsableDate(initialDate, now) ? initialDate : minDate;
    this.selectedSlot = this.#isUsableDate(initialDate, now) ? initialSlot : '';

    this.#refreshSlots(now);
    this.#emitChange();
  }

  /**
   * @param {string} dateISO
   * @param {Date} now
   */
  #isUsableDate(dateISO, now) {
    if (!dateISO) return false;
    if (dateISO === todayISO(now)) return isTodaySelectable(now);
    return dateISO >= getMinSelectableDate(now);
  }

  /** @param {Event} event */
  handleDateChange(event) {
    if (!(event.target instanceof HTMLInputElement)) return;
    const now = new Date();
    const value = event.target.value;
    const day = new Date(value + 'T00:00:00').getDay();

    if (day === 0) {
      this.refs.dateHint.textContent = 'No hacemos entregas en domingo. Elige otro día.';
      this.refs.dateHint.hidden = false;
      this.refs.dateHint.classList.add('delivery-selector__hint--error');
      event.target.value = this.refs.dateInput.min;
    } else {
      this.refs.dateHint.hidden = true;
      this.refs.dateHint.classList.remove('delivery-selector__hint--error');
    }

    this.selectedSlot = '';
    this.#refreshSlots(now);
    this.#emitChange();
  }

  /** @param {MouseEvent} event */
  handleSlotClick(event) {
    const button = event.target instanceof Element ? event.target.closest('.delivery-selector__slot') : null;
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;

    this.selectedSlot = button.dataset.slot ?? '';
    for (const slotButton of this.refs.slotButtons) {
      slotButton.setAttribute('aria-pressed', String(slotButton === button));
    }
    this.#emitChange();
  }

  /** @param {Date} now */
  #refreshSlots(now) {
    const date = this.refs.dateInput.value;
    let anyAvailable = false;

    for (const slotButton of this.refs.slotButtons) {
      const slotId = /** @type {'manana' | 'tarde'} */ (slotButton.dataset.slot);
      const available = date ? isSlotAvailable(date, slotId, now) : true;
      slotButton.disabled = !available;
      slotButton.setAttribute('aria-pressed', String(slotId === this.selectedSlot && available));
      if (available) anyAvailable = true;
      if (!available && slotId === this.selectedSlot) this.selectedSlot = '';
    }

    if (!anyAvailable) {
      this.refs.slotHint.textContent = 'No quedan horarios disponibles para esta fecha. Elige otro día.';
      this.refs.slotHint.hidden = false;
    } else {
      this.refs.slotHint.hidden = true;
    }
  }

  #emitChange() {
    this.dispatchEvent(
      new CustomEvent('delivery-selector:change', {
        bubbles: true,
        detail: { date: this.refs.dateInput.value, slot: this.selectedSlot },
      })
    );
  }

  /** @returns {{date: string, slot: string}} */
  getValue() {
    return { date: this.refs.dateInput.value, slot: this.selectedSlot };
  }

  /** @returns {boolean} */
  isValid() {
    const { date, slot } = this.getValue();
    if (!date || !slot) return false;
    return isSlotAvailable(date, /** @type {'manana' | 'tarde'} */ (slot), new Date());
  }

  /** Re-checks slot availability against the current time. Called periodically by host pages so a stale selection doesn't silently go invalid. */
  refreshAvailability() {
    const previousSlot = this.selectedSlot;
    this.#refreshSlots(new Date());
    if (previousSlot !== this.selectedSlot) this.#emitChange();
  }
}

if (!customElements.get('delivery-selector-component')) {
  customElements.define('delivery-selector-component', DeliverySelectorComponent);
}

export { SLOTS };
