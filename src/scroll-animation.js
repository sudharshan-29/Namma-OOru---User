/**
 * Instant Scroll-to-Map Transition for NAMMA OORU
 * 
 * Smooth dissolve transition from homepage to interactive map on scroll.
 * Uses blur + opacity + scale for a cinematic dissolve without visible seams.
 * 
 * Features:
 * - No frame sequence loading — zero bandwidth overhead
 * - Single scroll gesture triggers a smooth blur-dissolve (0.7s)
 * - Homepage blurs out + fades + subtle scale, map fades in underneath
 * - Dark veil layer prevents white flash/seam between layers
 * - Full reverse support: scrolling back up returns to the homepage
 * - Respects prefers-reduced-motion
 */

export class ScrollImageSequence {
  constructor(options = {}) {
    this.wrapper = typeof options.wrapper === 'string'
      ? document.querySelector(options.wrapper)
      : options.wrapper;

    this.container = typeof options.container === 'string'
      ? document.querySelector(options.container)
      : options.container;

    this.appShell = typeof options.appShell === 'string'
      ? document.querySelector(options.appShell)
      : options.appShell;

    this.onMapReveal = options.onMapReveal || (() => {});
    this.onProgress = options.onProgress || (() => {});
    this.onFrameChange = options.onFrameChange || (() => {});

    // Keep these for API compat
    this.totalFrames = options.totalFrames || 250;
    this.currentFrame = 0;
    this.isMapRevealed = false;

    // Transition state
    this._transitioned = false;
    this._transitioning = false;
    this._scrollThreshold = 30; // px of scroll to trigger transition
    this._prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Dissolve veil element (prevents white flash between layers)
    this._veil = null;

    this.init();
  }

  init() {
    // Disable browser scroll restoration
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    if (!this.container || !this.wrapper) {
      console.error('[ScrollTransition] Container or wrapper element not found');
      return;
    }

    // Hide the canvas — we don't need it anymore
    const canvas = this.container.querySelector('canvas');
    if (canvas) {
      canvas.style.display = 'none';
    }

    // Create dissolve veil — a dark layer that sits between the homepage and map
    // to prevent the white map background from flashing through during crossfade
    this._veil = document.createElement('div');
    this._veil.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      background-color: #050a14;
      z-index: 25;
      pointer-events: none;
      opacity: 0;
      transition: opacity ${this._prefersReducedMotion ? '0.01s' : '0.4s'} ease;
    `;
    this._veil.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this._veil);

    // Set wrapper to exactly 2 viewport heights — just enough for scroll detection + map zone
    this.wrapper.style.height = `${window.innerHeight * 2}px`;

    // Setup transition CSS on container and appShell
    const duration = this._prefersReducedMotion ? '0.01s' : '0.7s';
    const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';

    if (this.container) {
      this.container.style.willChange = 'opacity, transform, filter';
      this.container.style.transition = `opacity ${duration} ${easing}, transform ${duration} ${easing}, filter ${duration} ${easing}`;
      this.container.style.filter = 'blur(0px) brightness(1)';
    }

    if (this.appShell) {
      this.appShell.style.willChange = 'opacity';
      // Map fades in slightly delayed so the blur-out covers the seam
      const mapDuration = this._prefersReducedMotion ? '0.01s' : '0.65s';
      const mapDelay = this._prefersReducedMotion ? '0s' : '0.12s';
      this.appShell.style.transition = `opacity ${mapDuration} ${easing} ${mapDelay}`;
    }

    // Ensure initial state
    this._setHomeState();

    // Listen for scroll
    this._boundScrollHandler = this._handleScroll.bind(this);
    window.addEventListener('scroll', this._boundScrollHandler, { passive: true });

    // Listen for resize to update wrapper height
    window.addEventListener('resize', () => {
      this.wrapper.style.height = `${window.innerHeight * 2}px`;
    });
  }

  _handleScroll() {
    const scrollY = window.scrollY || window.pageYOffset;

    if (scrollY > this._scrollThreshold && !this._transitioned) {
      this._transitionToMap();
    } else if (scrollY <= 5 && this._transitioned) {
      this._transitionToHome();
    }

    // Report progress for overlay fading (0 = home, 1 = map)
    const maxScroll = this.wrapper.scrollHeight - window.innerHeight;
    const progress = maxScroll > 0 ? Math.min(1, scrollY / maxScroll) : 0;
    this.onProgress(progress);
  }

  _transitionToMap() {
    if (this._transitioning) return;
    this._transitioned = true;
    this._transitioning = true;

    // Step 1: Flash the dark veil to cover the seam
    if (this._veil) {
      this._veil.style.opacity = '1';
    }

    // Step 2: Blur + fade out + subtle scale-up on home container
    if (this.container) {
      this.container.style.opacity = '0';
      this.container.style.transform = 'scale(1.04)';
      this.container.style.filter = 'blur(12px) brightness(0.6)';
      this.container.style.pointerEvents = 'none';
    }

    // Step 3: Fade in the map app shell (with slight delay from CSS transition)
    if (this.appShell) {
      this.appShell.style.opacity = '1';
      this.appShell.style.pointerEvents = 'auto';
      this.appShell.style.visibility = 'visible';
      this.appShell.style.zIndex = '50';
    }

    // Auto-scroll to bottom so map is fully in view
    window.scrollTo({ top: this.wrapper.scrollHeight, behavior: 'smooth' });

    // Step 4: Fade out the veil once map is visible
    setTimeout(() => {
      if (this._veil) {
        this._veil.style.opacity = '0';
      }
    }, this._prefersReducedMotion ? 10 : 300);

    // After transition completes, finalize
    const transitionDuration = this._prefersReducedMotion ? 20 : 750;
    setTimeout(() => {
      this._transitioning = false;
      if (this.container) {
        this.container.style.visibility = 'hidden';
      }
      this.currentFrame = this.totalFrames;
      this.onFrameChange(this.totalFrames);

      if (!this.isMapRevealed) {
        this.isMapRevealed = true;
        this.onMapReveal();
      }
    }, transitionDuration);
  }

  _transitionToHome() {
    if (this._transitioning) return;
    this._transitioned = false;
    this._transitioning = true;
    this.isMapRevealed = false;

    // Flash the dark veil again for reverse transition
    if (this._veil) {
      this._veil.style.opacity = '1';
    }

    // Show home container again — reverse the blur dissolve
    if (this.container) {
      this.container.style.visibility = 'visible';
      this.container.style.opacity = '1';
      this.container.style.transform = 'scale(1)';
      this.container.style.filter = 'blur(0px) brightness(1)';
      this.container.style.pointerEvents = 'auto';
    }

    // Hide map
    if (this.appShell) {
      this.appShell.style.opacity = '0';
      this.appShell.style.pointerEvents = 'none';
    }

    // Fade veil out
    setTimeout(() => {
      if (this._veil) {
        this._veil.style.opacity = '0';
      }
    }, this._prefersReducedMotion ? 10 : 250);

    const transitionDuration = this._prefersReducedMotion ? 20 : 750;
    setTimeout(() => {
      this._transitioning = false;
      if (this.appShell) {
        this.appShell.style.visibility = 'hidden';
        this.appShell.style.zIndex = '10';
      }
      this.currentFrame = 0;
      this.onFrameChange(0);
    }, transitionDuration);

    this.onProgress(0);
  }

  _setHomeState() {
    if (this.container) {
      this.container.style.opacity = '1';
      this.container.style.transform = 'scale(1)';
      this.container.style.filter = 'blur(0px) brightness(1)';
      this.container.style.pointerEvents = 'auto';
      this.container.style.visibility = 'visible';
    }
    if (this.appShell) {
      this.appShell.style.opacity = '0';
      this.appShell.style.pointerEvents = 'none';
      this.appShell.style.visibility = 'hidden';
      this.appShell.style.zIndex = '10';
    }
    if (this._veil) {
      this._veil.style.opacity = '0';
    }
  }

  // Public API compat stubs
  redrawCurrent() {}
  resize() {}

  updateVisibility(canvasOpacity, mapOpacity) {
    if (this.container) {
      this.container.style.opacity = canvasOpacity.toFixed(3);
    }
    if (this.appShell) {
      this.appShell.style.opacity = mapOpacity.toFixed(3);
    }
  }

  destroy() {
    if (this._boundScrollHandler) {
      window.removeEventListener('scroll', this._boundScrollHandler);
    }
    if (this._veil && this._veil.parentElement) {
      this._veil.parentElement.removeChild(this._veil);
    }
  }
}

export function createScrollAnimation(options) {
  return new ScrollImageSequence(options);
}
