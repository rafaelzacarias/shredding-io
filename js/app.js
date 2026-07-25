import { ITEMS } from './items.js';
import { GameState } from './state.js';
import { MachineAudio } from './audio.js';
import { ShredderRenderer } from './renderer.js';
import { ThrowInput } from './input.js';

const elements = {
  canvas: document.getElementById('scene'),
  loading: document.getElementById('loading'),
  fallback: document.getElementById('fallback'),
  itemList: document.getElementById('itemList'),
  counter: document.getElementById('counter'),
  allTime: document.getElementById('allTime'),
  level: document.getElementById('level'),
  progress: document.getElementById('progressFill'),
  combo: document.getElementById('combo'),
  status: document.getElementById('status'),
  hint: document.getElementById('throwHint'),
  mode: document.getElementById('modeToggle'),
  sound: document.getElementById('soundToggle'),
  zen: document.getElementById('zenToggle')
};

const state = new GameState();
const audio = new MachineAudio();
let selectedIndex = 0;
let renderer;
let input;
let zenTimer;

function selectedItem() {
  return ITEMS[selectedIndex];
}

function select(index) {
  selectedIndex = index;
  [...elements.itemList.children].forEach((button, buttonIndex) => {
    button.classList.toggle('selected', buttonIndex === index);
    button.setAttribute('aria-pressed', String(buttonIndex === index));
  });
  elements.status.textContent = `${ITEMS[index].name} ready. Flick it into the hopper.`;
}

function renderItems() {
  ITEMS.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item-btn';
    button.style.setProperty('--item-color', `rgb(${item.accent.map((channel) => channel * 255).join(' ')})`);
    button.setAttribute('aria-label', `${item.name}. Drag to throw. Shortcut ${index === 9 ? 0 : index + 1}.`);
    button.setAttribute('aria-pressed', String(index === selectedIndex));
    button.innerHTML = `<span class="item-icon" aria-hidden="true">${item.icon}</span><span class="item-key">${index === 9 ? 0 : index + 1}</span>`;
    button.addEventListener('focus', () => select(index));
    button.addEventListener('click', () => select(index));
    elements.itemList.appendChild(button);
  });
  elements.itemList.firstElementChild.classList.add('selected');
}

function updateHud(snapshot) {
  elements.counter.textContent = snapshot.session;
  elements.allTime.textContent = snapshot.lifetime;
  elements.level.textContent = snapshot.level;
  elements.progress.style.width = `${snapshot.progress * 100}%`;
  elements.combo.textContent = `FLOW × ${snapshot.combo}`;
  elements.combo.classList.toggle('visible', snapshot.combo > 1);
  elements.mode.textContent = snapshot.mode === 'power' ? 'FULL POWER' : 'CALM';
  elements.mode.setAttribute('aria-pressed', String(snapshot.mode === 'power'));
  elements.sound.textContent = snapshot.sound ? 'SOUND ON' : 'SOUND OFF';
  elements.sound.setAttribute('aria-pressed', String(snapshot.sound));
  elements.zen.textContent = snapshot.zen ? 'PAUSE ZEN' : 'ZEN';
  elements.zen.setAttribute('aria-pressed', String(snapshot.zen));
}

function launch(item, position, velocity) {
  renderer.throwItem(item, position, velocity);
  elements.hint.classList.add('used');
  elements.status.textContent = `${item.name} is in the hopper…`;
}

function launchAuto(item) {
  const spawn = renderer.rimSpawn();
  launch(item, spawn.position, spawn.velocity);
}

function scheduleZen(delay = 650) {
  clearTimeout(zenTimer);
  if (!state.zen) return;
  zenTimer = setTimeout(() => {
    launchAuto(ITEMS[Math.floor(Math.random() * ITEMS.length)]);
  }, delay);
}

function bindControls() {
  elements.mode.addEventListener('click', () => {
    const mode = state.mode === 'calm' ? 'power' : 'calm';
    state.set('mode', mode);
    elements.status.textContent = mode === 'power' ? 'Full power engaged.' : 'Calm mode engaged.';
  });

  elements.sound.addEventListener('click', async () => {
    const enabled = !state.sound;
    try {
      await audio.setEnabled(enabled);
      state.set('sound', enabled);
    } catch {
      elements.status.textContent = 'Sound could not be started.';
    }
  });

  elements.zen.addEventListener('click', () => {
    state.set('zen', !state.zen);
    if (state.zen) scheduleZen(250);
    else clearTimeout(zenTimer);
  });

  document.addEventListener('keydown', (event) => {
    if (/^[0-9]$/.test(event.key)) {
      const index = event.key === '0' ? 9 : Number(event.key) - 1;
      if (ITEMS[index]) {
        select(index);
        launchAuto(ITEMS[index]);
      }
    } else if (event.key.toLowerCase() === 'z') {
      elements.zen.click();
    } else if (event.key.toLowerCase() === 'm') {
      elements.sound.click();
    } else if (event.key.toLowerCase() === 'p') {
      elements.mode.click();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(zenTimer);
    else if (state.zen) scheduleZen();
  });
}

function boot() {
  renderItems();
  bindControls();
  state.addEventListener('change', (event) => updateHud(event.detail));
  updateHud(state.snapshot());

  try {
    renderer = new ShredderRenderer(elements.canvas);
    input = new ThrowInput(elements.canvas, renderer, selectedItem);
    [...elements.itemList.children].forEach((button, index) => input.bindSurface(button, ITEMS[index]));
    input.addEventListener('throw', (event) => {
      select(ITEMS.indexOf(event.detail.item));
      launch(event.detail.item, event.detail.position, event.detail.velocity);
    });
    renderer.addEventListener('impact', (event) => {
      audio.impact(event.detail.item, event.detail.intensity * (state.mode === 'power' ? 1.35 : 1));
      audio.load(event.detail.item.mass);
      elements.status.textContent = `${event.detail.item.name} caught by the cutters.`;
      if (navigator.vibrate && state.mode === 'power') navigator.vibrate([25, 18, 35]);
    });
    renderer.addEventListener('bite', (event) => {
      audio.crunch(event.detail.item, event.detail.intensity * (state.mode === 'power' ? 1.25 : 1));
    });
    renderer.addEventListener('bounce', (event) => {
      audio.impact(event.detail.item, .25 + event.detail.intensity * .5);
    });
    renderer.addEventListener('shred', (event) => {
      state.recordShred();
      elements.status.textContent = `${event.detail.name} shredded.`;
      scheduleZen(state.mode === 'power' ? 300 : 800);
    });
    renderer.addEventListener('miss', (event) => {
      elements.status.textContent = `${event.detail.name} jammed in the hopper.`;
      scheduleZen(400);
    });
    renderer.addEventListener('contextlost', () => {
      elements.fallback.hidden = false;
      elements.fallback.querySelector('p').textContent = 'The 3D context was lost. Reload to restart the machine.';
    });
    renderer.start();
    requestAnimationFrame(() => setTimeout(() => elements.loading.classList.add('hidden'), 320));
  } catch (error) {
    console.error(error);
    elements.loading.classList.add('hidden');
    elements.fallback.hidden = false;
  }
}

boot();
