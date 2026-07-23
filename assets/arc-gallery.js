class ArcGalleryComponent extends HTMLElement {
  connectedCallback() {
    this.ring = this.querySelector('.arc-gallery__ring');
    this.images = Array.from(this.querySelectorAll('.arc-gallery__image'));
    this.startAngle = parseFloat(this.dataset.startAngle || '20');
    this.endAngle = parseFloat(this.dataset.endAngle || '160');

    this.onResize = this.layout.bind(this);
    window.addEventListener('resize', this.onResize);
    this.layout();

    this.images.forEach((img, i) => {
      setTimeout(() => img.classList.add('arc-gallery__image--in'), i * 100);
    });
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this.onResize);
  }

  getDimensions() {
    const width = window.innerWidth;
    if (width < 640) return { radius: 260, size: 80 };
    if (width < 1024) return { radius: 360, size: 100 };
    return { radius: 480, size: 120 };
  }

  layout() {
    if (!this.ring || this.images.length === 0) return;
    const { radius, size } = this.getDimensions();
    const count = Math.max(this.images.length, 2);
    const step = (this.endAngle - this.startAngle) / (count - 1);

    this.ring.style.height = `${radius * 1.2}px`;

    this.images.forEach((img, i) => {
      const angle = this.startAngle + step * i;
      const angleRad = (angle * Math.PI) / 180;
      const x = Math.cos(angleRad) * radius;
      const y = Math.sin(angleRad) * radius;

      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      img.style.left = `calc(50% + ${x}px)`;
      img.style.bottom = `${y}px`;
      img.style.zIndex = count - i;
      img.style.setProperty('--arc-rotate', `${angle / 4}deg`);
    });
  }
}

customElements.define('arc-gallery-component', ArcGalleryComponent);
