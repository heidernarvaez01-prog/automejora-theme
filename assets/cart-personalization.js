import { Component } from '@theme/component';
import { debounce, fetchConfig } from '@theme/utilities';
import { getSlotLabel } from '@theme/delivery-rules';

/**
 * @typedef {{
 *   occasionSelect: HTMLSelectElement,
 *   dedicationInput: HTMLTextAreaElement,
 *   dedicationCount: HTMLElement,
 *   observationInputs: HTMLTextAreaElement[],
 *   statusMessage: HTMLElement,
 * }} CartPersonalizationRefs
 * @extends {Component<CartPersonalizationRefs>}
 */
class CartPersonalizationComponent extends Component {
  connectedCallback() {
    super.connectedCallback();

    this.deliveryDate = '';
    this.deliverySlot = '';

    this.addEventListener('delivery-selector:change', (event) => {
      const { date, slot } = /** @type {CustomEvent<{date: string, slot: string}>} */ (event).detail;
      this.deliveryDate = date;
      this.deliverySlot = slot;
      this.syncCartFields();
    });

    if (this.refs.dedicationInput) {
      this.#updateDedicationCount();
    }

    for (const textarea of this.refs.observationInputs ?? []) {
      textarea.addEventListener('input', debounce(() => this.syncObservation(textarea), 500));
    }
  }

  handleFieldChange() {
    this.syncCartFields();
  }

  handleDedicationInput() {
    this.#updateDedicationCount();
    this.#debouncedSyncCartFields();
  }

  handleClearDedication() {
    if (!this.refs.dedicationInput) return;
    this.refs.dedicationInput.value = '';
    this.#updateDedicationCount();
    this.syncCartFields();
  }

  #updateDedicationCount() {
    if (this.refs.dedicationCount) {
      this.refs.dedicationCount.textContent = String(this.refs.dedicationInput.value.length);
    }
  }

  #debouncedSyncCartFields = debounce(() => this.syncCartFields(), 500);

  async syncCartFields() {
    const occasion = this.refs.occasionSelect?.value ?? '';
    const dedication = this.refs.dedicationInput?.value ?? '';
    const slotLabel = this.deliverySlot ? getSlotLabel(this.deliverySlot) : '';

    const attributes = {
      'Fecha de entrega': this.deliveryDate,
      'Horario de entrega': slotLabel,
      'Ocasión': occasion,
    };

    this.#setStatus('Guardando…');

    try {
      const response = await fetch(
        Theme.routes.cart_update_url,
        fetchConfig('json', { body: JSON.stringify({ note: dedication, attributes }) })
      );
      if (!response.ok) throw new Error('cart update failed');
      this.#setStatus('Guardado.');
    } catch (error) {
      this.#setStatus('No se pudo guardar. Intenta de nuevo.');
    }
  }

  /** @param {HTMLTextAreaElement} textarea */
  async syncObservation(textarea) {
    const lineKey = textarea.dataset.lineKey;
    if (!lineKey) return;

    try {
      const cartResponse = await fetch(Theme.routes.cart_url + '.js', fetchConfig('json'));
      const cart = await cartResponse.json();
      const line = cart.items?.find((/** @type {{key: string}} */ item) => item.key === lineKey);
      if (!line) return;

      const properties = { ...line.properties };
      if (textarea.value.trim()) {
        properties['Observación'] = textarea.value.trim();
      } else {
        delete properties['Observación'];
      }

      this.#setStatus('Guardando…');
      const response = await fetch(
        Theme.routes.cart_change_url,
        fetchConfig('json', {
          body: JSON.stringify({ id: lineKey, quantity: line.quantity, properties }),
        })
      );
      if (!response.ok) throw new Error('cart change failed');
      this.#setStatus('Guardado.');
    } catch (error) {
      this.#setStatus('No se pudo guardar la observación.');
    }
  }

  /** @param {string} message */
  #setStatus(message) {
    if (this.refs.statusMessage) this.refs.statusMessage.textContent = message;
  }
}

if (!customElements.get('cart-personalization-component')) {
  customElements.define('cart-personalization-component', CartPersonalizationComponent);
}
