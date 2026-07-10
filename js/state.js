const STORAGE_KEY = 'shredding-total';
const ITEMS_PER_LEVEL = 10;

export class GameState extends EventTarget {
  constructor() {
    super();
    const stored = Number.parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    this.session = 0;
    this.lifetime = Number.isFinite(stored) ? Math.max(0, stored) : 0;
    this.combo = 0;
    this.lastShred = 0;
    this.mode = 'calm';
    this.sound = false;
    this.zen = false;
  }

  recordShred() {
    const now = performance.now();
    this.combo = now - this.lastShred < 5000 ? this.combo + 1 : 1;
    this.lastShred = now;
    this.session += 1;
    this.lifetime += 1;
    localStorage.setItem(STORAGE_KEY, String(this.lifetime));
    this.emit();
  }

  set(name, value) {
    this[name] = value;
    this.emit();
  }

  snapshot() {
    return {
      session: this.session,
      lifetime: this.lifetime,
      level: Math.floor(this.lifetime / ITEMS_PER_LEVEL) + 1,
      progress: (this.lifetime % ITEMS_PER_LEVEL) / ITEMS_PER_LEVEL,
      combo: this.combo,
      mode: this.mode,
      sound: this.sound,
      zen: this.zen
    };
  }

  emit() {
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
  }
}
