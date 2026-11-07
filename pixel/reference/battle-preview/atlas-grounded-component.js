import { units, scenarios, equipmentSheets } from './roster.mjs';

const previewRoot = '/__atlas-preview/';
const formats = {
  ash: 'Поле боя просвечивает через карту.',
  radio: 'В центре тёмная карта, бой виден по краям.',
};

async function loadSprite(name) {
  const sprite = new Image();
  sprite.src = previewRoot + 'sprites/' + name;
  await sprite.decode();
  return sprite;
}

class AtlasLivePreview extends HTMLElement {
  #abort;
  #battle;
  #audio;
  #paused;
  #soundOn = false;
  #changingSound = false;
  #motion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: block; color: var(--preview-ink, #f3e9df); }
        .scene { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
        .scene > canvas { width: 100%; height: 100%; display: block; object-fit: contain; object-position: center; image-rendering: pixelated; }
        .atlas-battle-effects, .atlas-battle-effects > :is(canvas, .atlas-battle-whiteout) {
          position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;
        }
        .atlas-battle-effects > canvas { image-rendering: pixelated; }
        .atlas-battle-whiteout { background: #fff; opacity: 0; }
        .scene::after { content: ''; position: absolute; inset: 0; background: var(--preview-veil); }
        .drip { position: absolute; inset: 5vh 1vw auto auto; width: 30px; height: 60px;
          background: center / contain no-repeat url('/__atlas-preview/sprites/drip.webp'); display: none; opacity: .6; }
        .scene[data-active='true'] .drip { display: block; }
        @media (prefers-reduced-motion: reduce) { .scene .drip { display: none !important; } }
        .bar { position: relative; z-index: 1; width: min(calc(100% - 40px), 1360px); margin: 16px auto 10px;
          padding: 10px 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 9px 20px;
          background: var(--preview-panel, #171316); border-block: 2px solid var(--preview-line, #69545b);
          box-shadow: 4px 0 var(--preview-panel, #171316), -4px 0 var(--preview-panel, #171316); }
        .bar .view-toggle { min-height: 44px; }
        :host([data-theatre-only]) .bar { visibility: hidden; }
        :host([data-theatre-only]) .view-toggle {
          position: fixed; inset-block-start: max(12px, env(safe-area-inset-top));
          inset-inline-end: max(12px, env(safe-area-inset-right)); visibility: visible;
        }
        :host([data-theatre-only]) .scene::after,
        :host([data-theatre-only]) .scene .drip { display: none; }
        .bar::after {
          content: ''; position: absolute; inset: -2px 8px auto auto; width: 60px; height: 23px;
          pointer-events: none; background: #a7253d;
          clip-path: polygon(0 0, 100% 0, 100% 22%, 85% 22%, 85% 56%, 75% 56%, 75% 95%, 66% 95%, 66% 22%,
            45% 22%, 45% 65%, 36% 65%, 36% 22%, 15% 22%, 15% 42%, 5% 42%, 5% 22%, 0 22%);
          opacity: .85;
        }
        .bar::before {
          content: ''; position: absolute; inset: 4px 20px auto auto; width: 4px; height: 6px;
          pointer-events: none; background: #c9364e; box-shadow: 0 3px #791e34;
          opacity: 0; transform-origin: top center;
          animation: toolbar-drip 6.4s steps(4, end) 1.2s infinite;
        }
        @keyframes toolbar-drip {
          0%, 60%, 100% { opacity: 0; transform: translateY(0) scaleY(.5); }
          64% { opacity: .9; transform: translateY(0) scaleY(1); }
          70% { opacity: .9; transform: translateY(4px) scaleY(1.7); }
          82% { opacity: .85; transform: translateY(24px) scaleY(1); }
          90% { opacity: 0; transform: translateY(37px) scaleY(.6); }
          91% { opacity: 0; transform: translateY(0) scaleY(.5); }
        }
        .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
        .label { color: var(--preview-accent, #f2848a); font: 10px/1.6 var(--preview-display, monospace); }
        button, select { min-height: 42px; border: 1px solid var(--preview-line, #69545b); border-block-end-width: 3px;
          background: var(--preview-control, #161315); color: inherit; font: 10px/1.5 var(--preview-display, monospace);
          padding: 7px 9px; border-radius: 0; }
        button { cursor: pointer; position: relative; }
        button::after {
          content: ''; position: absolute; pointer-events: none; right: 4px; bottom: 0;
          width: 4px; height: 4px; background: #ae263f; box-shadow: -8px 0 #792237, 0 4px #792237;
          opacity: 0;
        }
        :is(button, select):focus-visible { outline: 2px solid var(--preview-accent, #f2848a); outline-offset: 2px; }
        button:hover:not(:disabled) { border-color: var(--preview-accent, #f2848a); }
        button:not(:disabled):is(:hover, :focus-visible, [aria-pressed='true'])::after {
          opacity: 1; animation: chip-in 190ms steps(3, end);
        }
        button:active:not(:disabled) { transform: translateY(2px); }
        @keyframes chip-in {
          from { opacity: .15; transform: translate(4px, -6px); }
          to { opacity: 1; transform: translate(0, 0); }
        }
        button[aria-pressed='true'] { color: #171316; background: var(--preview-accent, #f2848a);
          border-color: var(--preview-accent, #f2848a); border-block-end-color: var(--preview-line, #69545b); }
        button:disabled, select:disabled { opacity: .55; cursor: default; }
        .status { font-size: 12px; }
        .tally { margin: 0; font-size: 12px; line-height: 1.5; }
        .tally strong { color: var(--preview-accent); font: 13px/1.5 var(--preview-display, monospace); margin-inline-end: 8px; }
        @media (max-width: 650px) {
          .atlas-battle-whiteout { background: color-mix(in srgb, white 33%, var(--preview-edge, #151116)); }
          .bar { width: calc(100% - 28px); gap: 8px; padding: 8px; }
          .bar::after { width: 40px; height: 13px; }
          .bar::before { inset-inline-end: 16px; }
          .controls { gap: 5px; }
          button, select { min-height: 40px; font-size: 9px; padding-inline: 7px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .bar::before { animation: none; }
          button::after { animation: none !important; }
          button:active:not(:disabled) { transform: none; }
        }
      </style>
      <div class="scene" aria-hidden="true">
        <canvas width="960" height="576"></canvas>
        <div class="atlas-battle-effects" hidden>
          <canvas></canvas>
          <div class="atlas-battle-whiteout"></div>
        </div>
        <span class="drip"></span>
      </div>
      <div class="bar" role="region" aria-label="Предпросмотр оформления атласа">
        <div class="controls" role="group" aria-label="Оформление">
          <span class="label">Стиль</span>
          <button type="button" data-theme="ash" aria-pressed="true">Пепельный</button>
          <button type="button" data-theme="radio" aria-pressed="false">Радиоархив</button>
        </div>
        <div class="controls" role="group" aria-label="Фоновый бой">
          <button type="button" id="pause" disabled>Пауза</button>
          <button type="button" id="sound" aria-label="Звук боя" aria-pressed="false" disabled>Звук выключен</button>
          <button type="button" id="nuke" disabled>Ядерный удар</button>
          <select aria-label="Фоновая сцена" disabled></select>
        </div>
        <button type="button" id="theatre-toggle" class="view-toggle">Скрыть интерфейс</button>
        <output class="status" aria-live="polite">Загрузка фонового боя</output>
        <p class="tally" hidden><strong></strong>смертей, связанных с боями в конфликтах с участием государства · UCDP, 1989–2025</p>
      </div>`;
    const scenes = this.shadowRoot.querySelector('select');
    for (const [id, scenario] of Object.entries(scenarios)) {
      scenes.add(new Option(scenario.label, id));
    }
    scenes.value = 'eastern-front';
  }

  connectedCallback() {
    const abort = new AbortController();
    this.#abort = abort;
    this.#paused = this.#motion.matches;
    const listen = { signal: abort.signal };
    const initial = document.getElementById('atlas-initial');
    if (initial?.textContent) {
      const best = JSON.parse(initial.textContent).data?.manifest?.sums?.best;
      if (Number.isSafeInteger(best)) {
        const tally = this.shadowRoot.querySelector('.tally');
        tally.querySelector('strong').textContent = best.toLocaleString('ru-RU');
        tally.hidden = false;
      }
    }
    const themes = this.shadowRoot.querySelectorAll('[data-theme]');
    const selectTheme = theme => {
      document.documentElement.dataset.atlasPreview = theme;
      for (const item of themes) item.setAttribute('aria-pressed', String(item.dataset.theme === theme));
    };
    selectTheme('ash');
    for (const item of themes) {
      item.addEventListener('click', () => selectTheme(item.dataset.theme), listen);
    }
    const viewToggle = this.shadowRoot.querySelector('#theatre-toggle');
    const page = document.getElementById('root');
    const wasInert = page?.inert ?? false;
    const showTheatre = enabled => {
      this.toggleAttribute('data-theatre-only', enabled);
      if (page) page.inert = enabled || wasInert;
      viewToggle.textContent = enabled ? 'Показать интерфейс' : 'Скрыть интерфейс';
    };
    viewToggle.addEventListener('click', () => {
      showTheatre(!this.hasAttribute('data-theatre-only'));
      viewToggle.focus({ preventScroll: true });
    }, listen);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented || !this.hasAttribute('data-theatre-only')) return;
      event.preventDefault();
      showTheatre(false);
      viewToggle.focus({ preventScroll: true });
    }, listen);
    abort.signal.addEventListener('abort', () => {
      if (this.hasAttribute('data-theatre-only')) showTheatre(false);
    }, { once: true });

    this.#start(abort).catch(error => {
      if (!abort.signal.aborted) {
        this.shadowRoot.querySelector('output').textContent = 'Фон недоступен';
        console.error(error);
      }
    });
  }

  disconnectedCallback() {
    this.#abort?.abort();
    this.#battle?.dispose();
    this.#audio?.setActive(false);
    void this.#audio?.setEnabled(false);
    this.#soundOn = false;
  }

  async #start(abort) {
    const [infantrySprites, vehicleSprites, terrainSprites, nukeSprites, tankCrewSprites, equipmentWreckSprites, roadSprites] = await Promise.all([
      loadSprite('battle-topdown-infantry.png'),
      loadSprite('battle-topdown-vehicles.png'),
      loadSprite('battle-topdown-terrain.png'),
      loadSprite('battle-topdown-nuke.png').catch(error => {
        console.warn('Пиксельный атлас взрыва недоступен', error);
        return null;
      }),
      loadSprite('battle-topdown-tank-crew.png').catch(error => {
        console.warn('Пиксельный атлас танкового экипажа недоступен', error);
        return null;
      }),
      loadSprite('battle-topdown-equipment-wrecks.png').catch(error => {
        console.warn('Пиксельный атлас уничтоженной техники недоступен', error);
        return null;
      }),
      loadSprite('battle-topdown-roads.png').catch(error => {
        console.warn('Пиксельный атлас дорог недоступен', error);
        return null;
      }),
    ]);
    if (abort.signal.aborted) return;
    const root = this.shadowRoot;
    const scene = root.querySelector('.scene');
    const canvas = scene.querySelector(':scope > canvas');
    const effects = scene.querySelector('.atlas-battle-effects');
    const effectCanvas = effects.querySelector('canvas');
    const flash = effects.querySelector('.atlas-battle-whiteout');
    const pause = root.querySelector('#pause');
    const sound = root.querySelector('#sound');
    const nuke = root.querySelector('#nuke');
    const era = root.querySelector('select');
    const status = root.querySelector('output');
    const listen = { signal: abort.signal };
    const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
    const audio = this.#audio = window.createAtlasBattleAudio();
    const battle = this.#battle = window.createAtlasBattle(canvas, {
      infantrySprites, vehicleSprites, terrainSprites, nukeSprites, tankCrewSprites, equipmentWreckSprites, roadSprites,
      effectCanvas,
      roster: { units, scenarios, equipmentSheets },
      seed: seed(), era: era.value, paused: true,
      reducedMotion: () => this.#motion.matches, onCue: audio.cue, onVehicles: audio.setVehicles,
      onFlash: (opacity, active) => {
        flash.style.opacity = String(opacity);
        if (effects.hidden === active) effects.hidden = !active;
      },
    });
    const sync = () => {
      const active = !this.#paused && !document.hidden;
      battle.setPaused(!active);
      audio.setActive(active);
      scene.dataset.active = String(active);
      pause.textContent = this.#paused ? 'Запустить' : 'Пауза';
      nuke.disabled = document.hidden;
      status.textContent = this.#paused ? 'Бой на паузе' : '';
    };
    const reset = () => battle.reset(seed(), era.value);
    pause.addEventListener('click', () => { this.#paused = !this.#paused; sync(); }, listen);
    era.addEventListener('change', reset, listen);
    nuke.addEventListener('click', () => {
      battle.triggerNuke();
    }, listen);
    sound.addEventListener('click', async () => {
      if (this.#changingSound) return;
      this.#changingSound = true;
      const requested = !this.#soundOn;
      try { this.#soundOn = await audio.setEnabled(requested); }
      catch { this.#soundOn = false; }
      finally { this.#changingSound = false; }
      sound.setAttribute('aria-pressed', String(this.#soundOn));
      sound.textContent = this.#soundOn ? 'Звук включён' : 'Звук выключен';
      if (requested && !this.#soundOn) status.textContent = 'Звук недоступен';
    }, listen);
    this.#motion.addEventListener('change', event => {
      if (event.matches) this.#paused = true;
      sync();
    }, listen);
    document.addEventListener('visibilitychange', sync, listen);
    pause.disabled = sound.disabled = era.disabled = false;
    sync();
  }
}

customElements.define('atlas-live-preview', AtlasLivePreview);
