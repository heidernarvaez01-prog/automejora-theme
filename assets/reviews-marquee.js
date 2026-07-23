class ReviewsMarqueeComponent extends HTMLElement {
  async connectedCallback() {
    this.track = this.querySelector('.reviews-marquee__track');
    this.url = this.dataset.source;
    this.limit = parseInt(this.dataset.limit || '40', 10);
    if (!this.track || !this.url) return;

    try {
      const response = await fetch(this.url);
      const reviews = await response.json();
      this.renderReviews(reviews.slice(0, this.limit));
      this.startAutoScroll();
    } catch (error) {
      this.remove();
    }
  }

  renderReviews(reviews) {
    const colors = ['#FF8A65', '#BA68C8', '#4FC3F7', '#81C784', '#FFD54F', '#F06292', '#9575CD', '#4DB6AC'];
    const cardsHtml = reviews
      .map((review, i) => this.cardHtml(review, colors[i % colors.length]))
      .join('');
    this.track.innerHTML = cardsHtml + cardsHtml;
  }

  cardHtml(review, color) {
    const initials = review.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join('');
    const stars = Array.from({ length: 5 })
      .map(
        (_, i) =>
          `<span class="reviews-marquee__star${i < review.rating ? ' reviews-marquee__star--on' : ''}"></span>`
      )
      .join('');
    return `
      <a class="reviews-marquee__card" href="${this.dataset.reviewUrl || '#'}" target="_blank" rel="noopener noreferrer">
        <div class="reviews-marquee__card-head">
          <span class="reviews-marquee__avatar" style="background-color:${color}">${initials}</span>
          <span class="reviews-marquee__meta">
            <span class="reviews-marquee__name">${review.name}</span>
            <span class="reviews-marquee__verified">Cliente verificado</span>
          </span>
        </div>
        <div class="reviews-marquee__stars">${stars}</div>
        <p class="reviews-marquee__text">${review.text}</p>
      </a>
    `;
  }

  startAutoScroll() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let paused = false;
    this.track.addEventListener('mouseenter', () => (paused = true));
    this.track.addEventListener('mouseleave', () => (paused = false));

    const tick = () => {
      if (!paused) {
        this.track.scrollLeft += 0.6;
        if (this.track.scrollLeft >= this.track.scrollWidth / 2) {
          this.track.scrollLeft = 0;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

customElements.define('reviews-marquee-component', ReviewsMarqueeComponent);
