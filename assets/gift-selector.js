class GiftSelectorComponent extends HTMLElement {
  connectedCallback() {
    this.options = Array.from(this.querySelectorAll('.gift-selector__option'));
    this.activeIndex = 0;
    this.autoplayMs = parseInt(this.dataset.autoplay || '4500', 10);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.lightbox = this.querySelector('.gift-selector__lightbox');
    this.lightboxImage = this.querySelector('.gift-selector__lightbox-image');
    this.lightboxTitle = this.querySelector('.gift-selector__lightbox-title');
    this.lightboxSubtitle = this.querySelector('.gift-selector__lightbox-subtitle');
    this.lightboxClose = this.querySelector('.gift-selector__lightbox-close');

    this.options.forEach((option, index) => {
      option.addEventListener('click', () => this.handleOptionClick(index));
      requestAnimationFrame(() => {
        setTimeout(() => option.classList.add('gift-selector__option--in'), 120 * index);
      });
    });

    if (this.lightboxClose) {
      this.lightboxClose.addEventListener('click', () => this.closeLightbox());
    }
    if (this.lightbox) {
      this.lightbox.addEventListener('click', (event) => {
        if (event.target === this.lightbox) this.closeLightbox();
      });
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeLightbox();
    });

    this.setActive(0);

    if (this.autoplayMs > 0 && !this.reducedMotion) {
      this.startAutoplay();
      this.addEventListener('mouseenter', () => this.stopAutoplay());
      this.addEventListener('mouseleave', () => this.startAutoplay());
    }
  }

  disconnectedCallback() {
    this.stopAutoplay();
  }

  startAutoplay() {
    this.stopAutoplay();
    this.timer = setInterval(() => {
      this.setActive((this.activeIndex + 1) % this.options.length);
    }, this.autoplayMs);
  }

  stopAutoplay() {
    if (this.timer) clearInterval(this.timer);
  }

  handleOptionClick(index) {
    if (this.activeIndex === index) {
      this.openLightbox(index);
    } else {
      this.setActive(index);
    }
  }

  setActive(index) {
    this.activeIndex = index;
    this.options.forEach((option, i) => {
      option.classList.toggle('gift-selector__option--active', i === index);
    });
  }

  openLightbox(index) {
    const option = this.options[index];
    if (!option || !this.lightbox) return;
    const bg = option.style.backgroundImage.slice(5, -2);
    this.lightboxImage.src = bg;
    this.lightboxImage.alt = option.getAttribute('aria-label') || '';
    this.lightboxTitle.textContent = option.querySelector('.gift-selector__title')?.textContent || '';
    this.lightboxSubtitle.textContent = option.querySelector('.gift-selector__subtitle')?.textContent || '';
    this.lightbox.hidden = false;
    this.stopAutoplay();
  }

  closeLightbox() {
    if (!this.lightbox) return;
    this.lightbox.hidden = true;
    if (this.autoplayMs > 0 && !this.reducedMotion) this.startAutoplay();
  }
}

customElements.define('gift-selector-component', GiftSelectorComponent);
