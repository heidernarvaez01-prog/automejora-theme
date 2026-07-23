import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';

/**
 * @typedef {{ button: HTMLButtonElement }} AddDedicationButtonRefs
 * @extends {Component<AddDedicationButtonRefs>}
 */
class AddDedicationButtonComponent extends Component {
  async handleClick() {
    const button = this.refs.button;
    if (!button || button.disabled) return;

    const variantId = this.#getVariantId();
    if (!variantId) return;

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'Agregando…';

    try {
      const response = await fetch(
        Theme.routes.cart_add_url,
        fetchConfig('json', { body: JSON.stringify({ id: variantId, quantity: 1 }) })
      );
      if (!response.ok) throw new Error('add to cart failed');
      window.location.href = Theme.routes.cart_url;
    } catch (error) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  #getVariantId() {
    const input = document.querySelector('[data-type="add-to-cart-form"] [name="id"]');
    return input instanceof HTMLInputElement ? input.value : this.dataset.variantId;
  }
}

if (!customElements.get('add-dedication-button-component')) {
  customElements.define('add-dedication-button-component', AddDedicationButtonComponent);
}
