const THROW_CONFIG = {
  sampleWindowMs: 130,
  maxSamples: 8,
  tapDistance: 10,
  defaultVelocity: [0, 6.2, -7.4],
  horizontalScale: 12,
  horizontalLimit: 8,
  verticalScale: 14,
  verticalBoost: 2.8,
  verticalMin: 2.2,
  verticalMax: 11,
  depthBase: -6.5,
  depthScale: 2.2,
  depthLimit: -11
};

export class ThrowInput extends EventTarget {
  constructor(canvas, renderer, getSelectedItem) {
    super();
    this.canvas = canvas;
    this.renderer = renderer;
    this.getSelectedItem = getSelectedItem;
    this.gesture = null;
    this.bindSurface(canvas);
  }

  bindSurface(element, item = null) {
    element.addEventListener('pointerdown', (event) => {
      if (event.button > 0 || this.gesture) return;
      const selected = item || this.getSelectedItem();
      if (!selected) return;
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      this.gesture = {
        pointerId: event.pointerId,
        item: selected,
        samples: [{ x: event.clientX, y: event.clientY, time: event.timeStamp }],
        start: { x: event.clientX, y: event.clientY }
      };
      this.renderer.setPreview(selected, this.renderer.screenToWorld(event.clientX, event.clientY));
    });

    element.addEventListener('pointermove', (event) => {
      if (!this.gesture || event.pointerId !== this.gesture.pointerId) return;
      event.preventDefault();
      this.gesture.samples.push({ x: event.clientX, y: event.clientY, time: event.timeStamp });
      this.gesture.samples = this.gesture.samples
        .filter((sample) => event.timeStamp - sample.time < THROW_CONFIG.sampleWindowMs)
        .slice(-THROW_CONFIG.maxSamples);
      this.renderer.setPreview(this.gesture.item, this.renderer.screenToWorld(event.clientX, event.clientY));
    });

    const finish = (event, cancelled) => {
      if (!this.gesture || event.pointerId !== this.gesture.pointerId) return;
      const gesture = this.gesture;
      this.gesture = null;
      this.renderer.clearPreview();
      if (cancelled) return;
      event.preventDefault();
      const first = gesture.samples[0];
      const elapsed = Math.max(20, event.timeStamp - first.time);
      const dx = event.clientX - first.x;
      const dy = event.clientY - first.y;
      const distance = Math.hypot(event.clientX - gesture.start.x, event.clientY - gesture.start.y);
      const position = this.renderer.screenToWorld(event.clientX, event.clientY);
      const velocity = distance < THROW_CONFIG.tapDistance
        ? [...THROW_CONFIG.defaultVelocity]
        : [
            Math.max(
              -THROW_CONFIG.horizontalLimit,
              Math.min(THROW_CONFIG.horizontalLimit, dx / elapsed * THROW_CONFIG.horizontalScale)
            ),
            Math.max(
              THROW_CONFIG.verticalMin,
              Math.min(THROW_CONFIG.verticalMax, -dy / elapsed * THROW_CONFIG.verticalScale + THROW_CONFIG.verticalBoost)
            ),
            Math.max(
              THROW_CONFIG.depthLimit,
              THROW_CONFIG.depthBase - Math.hypot(dx, dy) / elapsed * THROW_CONFIG.depthScale
            )
          ];
      this.dispatchEvent(new CustomEvent('throw', { detail: { item: gesture.item, position, velocity } }));
    };

    element.addEventListener('pointerup', (event) => finish(event, false));
    element.addEventListener('pointercancel', (event) => finish(event, true));
  }
}
