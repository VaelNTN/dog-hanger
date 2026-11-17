import './style.css';
import {
  GlobalDogHangerEntry,
  fetchGlobalDogHangerHighscores,
  submitGlobalDogHangerScore,
} from './api/highscores';
import {
  COLLAR_COLORS,
  DOG_ACCESSORIES,
  DOG_BREEDS,
  getDogBreed,
} from './data/dogs';
import { drawCartoonDog } from './game/dogRenderer';
import { DogHangerStage } from './game/DogHangerStage';
import { soundFX } from './game/SoundFX';
import {
  DogHangerState,
  loadDogHangerState,
  recordDogHangerScore,
  resolveDeviceId,
  saveDogHangerState,
} from './storage/state';

type ScreenName = 'home' | 'options' | 'game' | 'highscores';
type HsMode = 'global' | 'local';

let state: DogHangerState;
let hsMode: HsMode = 'global';
let optionsFromPlay = false;
let stage: DogHangerStage | null = null;
let homeAnimId: number | null = null;
let hsPollInterval: number | null = null;
let lastMilestone = 0;

function renderDogThumb(canvas: HTMLCanvasElement, breedId: number, size: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  drawCartoonDog(ctx, size / 2, size * 0.44, size * 0.24, {
    breed: getDogBreed(breedId),
    collarColor: state.collarColor,
    accessory: state.accessory,
    pose: 'portrait',
  });
}

function buildApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <section id="screen-home" class="screen home-screen">
      <div class="home-hero">
        <canvas id="home-dog-canvas" class="dog-preview-canvas"></canvas>
        <h1 class="game-title">Dog Hanger</h1>
        <p class="game-subtitle">
          Druk op je hond om hem aan het touw vast te pakken en houd zo lang mogelijk vast!
        </p>
        <div id="home-best-pill" class="best-pill hidden"></div>
      </div>
      <div class="home-actions">
        <button id="btn-home-play" class="btn btn-primary">Play</button>
        <button id="btn-home-options" class="btn btn-secondary">Hondopties</button>
        <button id="btn-home-highscores" class="btn btn-secondary">Highscores</button>
      </div>
    </section>

    <section id="screen-options" class="screen hidden">
      <div class="top-nav">
        <button id="btn-options-back" class="btn btn-small">← Terug</button>
        <h2 class="screen-heading">Kies je Hond</h2>
        <span style="width:60px"></span>
      </div>
      <div class="options-scroll">
        <div>
          <p class="section-label">Jouw Naam (voor Highscores)</p>
          <input id="player-name-input" class="name-input" type="text" maxlength="20" placeholder="Hondenbaas" />
        </div>
        <div>
          <p class="section-label">Hondenras</p>
          <div id="dog-breed-grid" class="breed-grid"></div>
        </div>
        <div>
          <p class="section-label">Halsbandkleur</p>
          <div id="collar-chips" class="chip-row"></div>
        </div>
        <div>
          <p class="section-label">Accessoire</p>
          <div id="acc-chips" class="chip-row"></div>
        </div>
        <button id="btn-options-start" class="btn btn-primary">Start Hangen</button>
      </div>
    </section>

    <section id="screen-game" class="screen game-screen hidden">
      <div class="game-top-bar">
        <button id="btn-game-menu" class="btn btn-small">← Menu</button>
        <div style="display:flex;gap:8px;">
          <button id="btn-game-options" class="btn btn-small">Hond</button>
          <button id="btn-game-sound" class="btn btn-small">Geluid: Aan</button>
        </div>
      </div>
      <div class="timer-hud">
        <div id="timer-value" class="timer-value">0.00 s</div>
        <div id="timer-status" class="timer-sub">Tik & houd op je hond om te starten!</div>
      </div>
      <canvas id="game-canvas" class="game-canvas"></canvas>
      <div id="round-banner" class="round-banner hidden">
        <div id="round-banner-text" style="font-weight:800;font-size:1.1rem;">Plons!</div>
        <button id="btn-retry" class="btn btn-primary" style="padding:12px;">Opnieuw Hangen</button>
      </div>
    </section>

    <section id="screen-highscores" class="screen hidden">
      <div class="top-nav">
        <button id="btn-hs-back" class="btn btn-small">← Terug</button>
        <h2 class="screen-heading">Highscores</h2>
        <button id="btn-hs-refresh" class="btn btn-small">Ververs</button>
      </div>
      <div class="hs-tabs">
        <button id="tab-hs-global" class="hs-tab active">Online Wereldwijd</button>
        <button id="tab-hs-local" class="hs-tab">Lokaal (Top 50)</button>
      </div>
      <div id="server-box" class="server-box hidden">
        <p class="section-label" style="margin:0;">Highscore Server URL</p>
        <div style="display:flex;gap:8px;">
          <input id="server-url-input" class="name-input" type="url" placeholder="https://arcade-highscores-worker...workers.dev" />
          <button id="btn-save-server" class="btn btn-small">Opslaan</button>
        </div>
      </div>
      <div id="hs-list" class="hs-list"></div>
    </section>
  `;
}

function showScreen(name: ScreenName): void {
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  document.getElementById(`screen-${name}`)?.classList.remove('hidden');

  if (name === 'game') startStage();
  else stopStage();

  if (name === 'home') startHomePreview();
  else stopHomePreview();

  if (name === 'highscores') {
    refreshHighscoresView();
    hsPollInterval = window.setInterval(() => refreshHighscoresView(), 12000);
  } else if (hsPollInterval !== null) {
    clearInterval(hsPollInterval);
    hsPollInterval = null;
  }
}

function startHomePreview(): void {
  stopHomePreview();
  const canvas = document.getElementById('home-dog-canvas') as HTMLCanvasElement;
  const pill = document.getElementById('home-best-pill')!;
  if (state.bestTimeSec > 0) {
    pill.textContent = `Beste tijd: ${state.bestTimeSec.toFixed(2)} s`;
    pill.classList.remove('hidden');
  } else {
    pill.classList.add('hidden');
  }

  let phase = 0;
  const draw = () => {
    phase += 0.03;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = 150 * dpr;
    canvas.height = 150 * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      drawCartoonDog(ctx, 75, 68 + Math.sin(phase * 2) * 4, 34, {
        breed: getDogBreed(state.breedId),
        collarColor: state.collarColor,
        accessory: state.accessory,
        pose: 'portrait',
        animPhase: phase,
      });
    }
    homeAnimId = requestAnimationFrame(draw);
  };
  draw();
}

function stopHomePreview(): void {
  if (homeAnimId !== null) {
    cancelAnimationFrame(homeAnimId);
    homeAnimId = null;
  }
}

function renderOptions(): void {
  (document.getElementById('player-name-input') as HTMLInputElement).value = state.playerName;
  const grid = document.getElementById('dog-breed-grid')!;
  grid.innerHTML = '';
  for (const b of DOG_BREEDS) {
    const btn = document.createElement('button');
    btn.className = `breed-card ${state.breedId === b.id ? 'selected' : ''}`;
    btn.innerHTML = `<canvas width="48" height="48"></canvas><span style="font-weight:700;font-size:0.9rem;">${b.name}</span>`;
    renderDogThumb(btn.querySelector('canvas')!, b.id, 48);
    btn.onclick = () => {
      state.breedId = b.id;
      saveDogHangerState(state);
      renderOptions();
    };
    grid.appendChild(btn);
  }

  const collars = document.getElementById('collar-chips')!;
  collars.innerHTML = '';
  for (const c of COLLAR_COLORS) {
    const chip = document.createElement('button');
    chip.className = `chip ${state.collarColor === c.id ? 'selected' : ''}`;
    chip.textContent = c.label;
    chip.onclick = () => {
      state.collarColor = c.id;
      saveDogHangerState(state);
      renderOptions();
    };
    collars.appendChild(chip);
  }

  const acc = document.getElementById('acc-chips')!;
  acc.innerHTML = '';
  for (const a of DOG_ACCESSORIES) {
    const chip = document.createElement('button');
    chip.className = `chip ${state.accessory === a.id ? 'selected' : ''}`;
    chip.textContent = a.label;
    chip.onclick = () => {
      state.accessory = a.id;
      saveDogHangerState(state);
      renderOptions();
    };
    acc.appendChild(chip);
  }
}

function startStage(): void {
  document.getElementById('round-banner')!.classList.add('hidden');
  document.getElementById('timer-value')!.textContent = '0.00 s';
  document.getElementById('timer-status')!.textContent = 'Tik & houd op je hond om te starten!';
  document.getElementById('btn-game-sound')!.textContent = `Geluid: ${state.soundEnabled ? 'Aan' : 'Uit'}`;

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!stage) {
    stage = new DogHangerStage(
      canvas,
      { breed: getDogBreed(state.breedId), collarColor: state.collarColor, accessory: state.accessory },
      {
        onStartHold: () => {
          lastMilestone = 0;
          soundFX.playGrab();
          document.getElementById('round-banner')!.classList.add('hidden');
          document.getElementById('timer-status')!.textContent = 'Niet loslaten!!';
        },
        onTick: (sec) => {
          document.getElementById('timer-value')!.textContent = `${sec.toFixed(2)} s`;
          const step = Math.floor(sec / 10);
          if (step > lastMilestone) {
            lastMilestone = step;
            soundFX.playMilestone();
          }
        },
        onRelease: (sec) => {
          soundFX.playSplash();
          recordDogHangerScore(state, sec);
          document.getElementById('timer-status')!.textContent = `Losgelaten na ${sec.toFixed(2)} s!`;
          document.getElementById('round-banner-text')!.textContent =
            sec >= state.bestTimeSec ? `Nieuw record: ${sec.toFixed(2)} s!` : `Tijd: ${sec.toFixed(2)} s (Best: ${state.bestTimeSec.toFixed(2)} s)`;
          document.getElementById('round-banner')!.classList.remove('hidden');
          if (state.apiBaseUrl) {
            submitGlobalDogHangerScore(state.apiBaseUrl, {
              deviceId: state.deviceId,
              playerName: state.playerName,
              timeSec: sec,
              breedId: state.breedId,
              collarColor: state.collarColor,
              accessory: state.accessory,
            });
          }
        },
        onMissTap: () => {
          document.getElementById('timer-status')!.textContent = 'Druk direct óp de hond in de gele cirkel!';
        },
      }
    );
  } else {
    stage.setAppearance({ breed: getDogBreed(state.breedId), collarColor: state.collarColor, accessory: state.accessory });
    stage.resetRound();
  }
  stage.start();
}

function stopStage(): void {
  stage?.stop();
}

async function refreshHighscoresView(): Promise<void> {
  const list = document.getElementById('hs-list')!;
  const serverBox = document.getElementById('server-box')!;
  (document.getElementById('server-url-input') as HTMLInputElement).value = state.apiBaseUrl;

  document.getElementById('tab-hs-global')?.classList.toggle('active', hsMode === 'global');
  document.getElementById('tab-hs-local')?.classList.toggle('active', hsMode === 'local');

  if (hsMode === 'local') {
    serverBox.classList.add('hidden');
    if (state.highscores.length === 0) {
      list.innerHTML = `<p style="text-align:center;color:var(--muted);margin-top:30px;">Nog geen tijden. Houd de hond vast en zet een tijd neer!</p>`;
      return;
    }
    list.innerHTML = state.highscores
      .map(
        (h, i) => `
        <div class="hs-row">
          <div class="hs-left">
            <span class="hs-rank">#${i + 1}</span>
            <div>
              <div class="hs-name">${h.playerName}</div>
              <div class="hs-meta">${getDogBreed(h.breedId).name}</div>
            </div>
          </div>
          <div class="hs-score">${h.timeSec.toFixed(2)} s</div>
        </div>`
      )
      .join('');
    return;
  }

  serverBox.classList.toggle('hidden', Boolean(state.apiBaseUrl));
  if (!state.apiBaseUrl) {
    list.innerHTML = `<p style="text-align:center;color:var(--muted);margin-top:24px;">Vul je Worker-URL in voor wereldwijde records (lokaal werkt altijd offline).</p>`;
    return;
  }

  try {
    const res = await fetchGlobalDogHangerHighscores(state.apiBaseUrl, state.deviceId, 50);
    const entries: GlobalDogHangerEntry[] = res.entries || [];
    if (entries.length === 0) {
      list.innerHTML = `<p style="text-align:center;color:var(--muted);margin-top:30px;">Nog geen online tijden. Word de eerste!</p>`;
      return;
    }
    list.innerHTML = entries
      .map(
        (e) => `
        <div class="hs-row ${e.deviceId === state.deviceId ? 'me' : ''}">
          <div class="hs-left">
            <span class="hs-rank">#${e.rank}</span>
            <div>
              <div class="hs-name">${e.playerName}</div>
              <div class="hs-meta">${getDogBreed(e.breedId).name}</div>
            </div>
          </div>
          <div class="hs-score">${e.timeSec.toFixed(2)} s</div>
        </div>`
      )
      .join('');
  } catch {
    list.innerHTML = `<p style="text-align:center;color:#fca5a5;margin-top:24px;">Offline of server niet bereikbaar. Bekijk tab Lokaal!</p>`;
  }
}

async function init(): Promise<void> {
  const deviceId = await resolveDeviceId();
  state = loadDogHangerState(deviceId);
  soundFX.enabled = state.soundEnabled;
  buildApp();
  renderOptions();

  document.getElementById('btn-home-play')!.onclick = () => showScreen('game');
  document.getElementById('btn-home-options')!.onclick = () => {
    optionsFromPlay = false;
    renderOptions();
    showScreen('options');
  };
  document.getElementById('btn-home-highscores')!.onclick = () => showScreen('highscores');

  document.getElementById('btn-options-back')!.onclick = () => showScreen(optionsFromPlay ? 'game' : 'home');
  document.getElementById('btn-options-start')!.onclick = () => showScreen('game');
  document.getElementById('player-name-input')!.addEventListener('input', (e) => {
    state.playerName = (e.target as HTMLInputElement).value.slice(0, 20) || 'Hondenbaas';
    saveDogHangerState(state);
  });

  document.getElementById('btn-game-menu')!.onclick = () => showScreen('home');
  document.getElementById('btn-game-options')!.onclick = () => {
    optionsFromPlay = true;
    renderOptions();
    showScreen('options');
  };
  document.getElementById('btn-game-sound')!.onclick = () => {
    state.soundEnabled = !state.soundEnabled;
    soundFX.enabled = state.soundEnabled;
    saveDogHangerState(state);
    document.getElementById('btn-game-sound')!.textContent = `Geluid: ${state.soundEnabled ? 'Aan' : 'Uit'}`;
  };
  document.getElementById('btn-retry')!.onclick = () => {
    document.getElementById('round-banner')!.classList.add('hidden');
    document.getElementById('timer-value')!.textContent = '0.00 s';
    document.getElementById('timer-status')!.textContent = 'Tik & houd op je hond om te starten!';
    stage?.resetRound();
  };

  document.getElementById('btn-hs-back')!.onclick = () => showScreen('home');
  document.getElementById('btn-hs-refresh')!.onclick = () => refreshHighscoresView();
  document.getElementById('tab-hs-global')!.onclick = () => {
    hsMode = 'global';
    refreshHighscoresView();
  };
  document.getElementById('tab-hs-local')!.onclick = () => {
    hsMode = 'local';
    refreshHighscoresView();
  };
  document.getElementById('btn-save-server')!.onclick = () => {
    state.apiBaseUrl = (document.getElementById('server-url-input') as HTMLInputElement).value.trim().replace(/\/+$/, '');
    saveDogHangerState(state);
    refreshHighscoresView();
  };

  showScreen('home');
}

init();
