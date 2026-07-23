import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';

/**
 * @typedef {{addButtons: HTMLButtonElement[]}} CartUpsellsRefs
 * @extends {Component<CartUpsellsRefs>}
 */
class CartUpsellsComponent extends Component {
  /** @param {MouseEvent} event */
  async handleAdd(event) {
    const button = event.target instanceof Element ? event.target.closest('.cart-upsells__add') : null;
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;

    const variantId = button.dataset.variantId;
    if (!variantId) return;

    button.disabled = true;
    button.classList.add('cart-upsells__add--loading');

    try {
      const response = await fetch(
        Theme.routes.cart_add_url,
        fetchConfig('json', { body: JSON.stringify({ id: variantId, quantity: 1 }) })
      );
      if (!response.ok) throw new Error('add to cart failed');
      window.location.reload();
    } catch (error) {
      button.disabled = false;
      button.classList.remove('cart-upsells__add--loading');
      button.classList.add('cart-upsells__add--error');
    }
  }
}

if (!customElements.get('cart-upsells-component')) {
  customElements.define('cart-upsells-component', CartUpsellsComponent);
}
