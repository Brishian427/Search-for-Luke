import './style.css';
import { StarMapScene } from './scene.js';
import { LOCATIONS } from './data.js';

const params = new URLSearchParams(window.location.search);
let theme = params.get('theme') === 'space' ? 'space' : 'chart';
let mode = params.get('mode') === 'reveal' ? 'reveal' : 'player';
let truth = LOCATIONS[params.get('truth')] ? params.get('truth') : 'rime';
let playing = false;
let speed = 1;
let lastFrame = performance.now();

const elements = {
  root: document.documentElement,
  scene: document.querySelector('#scene'),
  themeToggle: document.querySelector('#theme-toggle'),
  themeLabel: document.querySelector('#theme-label'),
  placeCard: document.querySelector('#place-card'),
  cardTitle: document.querySelector('#card-title'),
  cardDescription: document.querySelector('#card-description'),
  closeCard: document.querySelector('#close-card'),
  revealPanel: document.querySelector('#reveal-panel'),
  slider: document.querySelector('#time-slider'),
  readout: document.querySelector('#time-readout'),
  playButton: document.querySelector('#play-button'),
  playIcon: document.querySelector('#play-icon'),
  playLabel: document.querySelector('#play-label'),
  speedToggle: document.querySelector('#speed-toggle'),
  modeBadge: document.querySelector('#mode-badge'),
  modeCaption: document.querySelector('#mode-caption'),
};

function updateUrl() {
  const next = new URL(window.location.href);
  next.searchParams.set('theme', theme);
  next.searchParams.set('mode', mode);
  if (mode === 'reveal') next.searchParams.set('truth', truth);
  else next.searchParams.delete('truth');
  window.history.replaceState({}, '', next);
}

function showPlace(location) {
  elements.cardTitle.textContent = location.name;
  elements.cardDescription.textContent = location.description;
  elements.placeCard.hidden = false;
  elements.placeCard.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => elements.placeCard.classList.add('visible'));
}

function hidePlace() {
  elements.placeCard.classList.remove('visible');
  elements.placeCard.setAttribute('aria-hidden', 'true');
}

const sim = new StarMapScene(elements.scene, { theme, mode, truth, onSelect: showPlace });

function applyTheme(nextTheme, syncUrl = true) {
  theme = nextTheme === 'space' ? 'space' : 'chart';
  elements.root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'space' ? '#050711' : '#f6ecbe';
  elements.themeLabel.textContent = theme === 'chart' ? 'Space' : 'Chart';
  elements.themeToggle.setAttribute('aria-label', `Switch to ${theme === 'chart' ? 'deep space' : 'star chart'} theme`);
  sim.setTheme(theme);
  if (syncUrl) updateUrl();
}

function stopPlayback() {
  playing = false;
  elements.playIcon.textContent = '▶';
  elements.playLabel.textContent = Number(elements.slider.value) >= 48 ? 'Replay' : 'Play';
  elements.playButton.classList.remove('playing');
}

function setTime(hours) {
  const value = Math.max(0, Math.min(48, Number(hours) || 0));
  elements.slider.value = value;
  elements.readout.textContent = `T+${String(Math.floor(value)).padStart(2, '0')} h`;
  sim.setTime(value);
  if (value >= 48 && playing) stopPlayback();
}

function applyMode(nextMode, syncUrl = true) {
  const previousMode = mode;
  mode = nextMode === 'reveal' ? 'reveal' : 'player';
  sim.setMode(mode);
  elements.revealPanel.hidden = mode !== 'reveal';
  elements.modeBadge.textContent = mode === 'reveal' ? 'Reveal reconstruction' : 'Player chart';
  elements.modeBadge.classList.toggle('reveal', mode === 'reveal');
  elements.modeCaption.textContent = mode === 'reveal'
    ? 'Halcyon flight reconstruction · Use the timeline to reveal events'
    : 'Six possible locations · Planned passage Azure → Amber';
  if (mode === 'player') stopPlayback();
  if (mode !== previousMode) {
    document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === 'overview'));
    sim.setView('overview');
  }
  if (syncUrl) updateUrl();
}

function setTruth(id, syncUrl = true) {
  truth = LOCATIONS[id] ? id : 'rime';
  sim.setTruth(truth);
  if (syncUrl) updateUrl();
}

function playReveal() {
  if (mode !== 'reveal') applyMode('reveal');
  if (Number(elements.slider.value) >= 48) setTime(0);
  playing = true;
  lastFrame = performance.now();
  elements.playIcon.textContent = 'Ⅱ';
  elements.playLabel.textContent = 'Pause';
  elements.playButton.classList.add('playing');
}

function playbackTick() {
  const now = performance.now();
  const delta = (now - lastFrame) / 1000;
  lastFrame = now;
  if (!playing || mode !== 'reveal') return;
  setTime(Number(elements.slider.value) + delta * speed * 1.6);
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item === button));
    sim.setView(button.dataset.view);
  });
});

elements.themeToggle.addEventListener('click', () => applyTheme(theme === 'chart' ? 'space' : 'chart'));
elements.closeCard.addEventListener('click', hidePlace);
elements.slider.addEventListener('input', () => {
  stopPlayback();
  setTime(elements.slider.value);
});
elements.playButton.addEventListener('click', () => {
  if (playing) stopPlayback();
  else playReveal();
});
elements.speedToggle.addEventListener('click', () => {
  speed = speed === 1 ? 4 : 1;
  elements.speedToggle.textContent = `${speed}×`;
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hidePlace();
  if (event.code === 'Space' && mode === 'reveal' && event.target.tagName !== 'INPUT') {
    event.preventDefault();
    if (playing) stopPlayback();
    else playReveal();
  }
});

window.LucianSim = {
  setTheme: applyTheme,
  setMode: applyMode,
  setTruth,
  setTime,
  playReveal,
};

applyTheme(theme, false);
applyMode(mode, false);
setTruth(truth, false);
setTime(0);
window.setInterval(playbackTick, 50);

