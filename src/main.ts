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
let activeScreen: ScreenName = 'home';
let hsMode: HsMode = 'global';
let optionsFromPlay = false;
let stage: DogHangerStage | null = null;
let homeAnimId: number | null = null;
let hsPollInterval: number | null = null;
let lastMilestone = 0;
let hsHeadingTapCount = 0;
let hsHeadingTapTimer: number | null = null;
let confirmQuitArmed = false;

function renderDogThumb(
  canvas: HTMLCanvasElement,
  breedId: number,
  size: number,
  collarColor = state.collarColor,
  accessory = state.accessory
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  drawCartoonDog(ctx, size / 2, size * 0.44, size * 0.24, {
    breed: getDogBreed(breedId),
    collarColor,
    accessory,
    pose: 'portrait',
  });
}

function syncSoundButtons(): void {
  const homeBtn = document.getElementById('btn-home-sound');
  if (homeBtn) homeBtn.textContent = state.soundEnabled ? '🔊' : '🔇';
  const gameBtn = document.getElementById('btn-game-sound');
  if (gameBtn) gameBtn.textContent = state.soundEnabled ? '🔊' : '🔇';
}

function toggleSound(): void {
  state.soundEnabled = !state.soundEnabled;
  soundFX.enabled = state.soundEnabled;
  saveDogHangerState(state);
  syncSoundButtons();
}

function openPauseModal(): void {
  if (!stage || stage.isFinished()) return;
  stage.setPaused(true);
  confirmQuitArmed = false;
  const quitBtn = document.getElementById('btn-pause-quit')!;
  quitBtn.textContent = '🚪 Quit to Menu';
  quitBtn.classList.remove('armed');
  document.getElementById('pause-modal')?.classList.remove('hidden');
}

function closePauseModal(resume = true): void {
  document.getElementById('pause-modal')?.classList.add('hidden');
  confirmQuitArmed = false;
  const quitBtn = document.getElementById('btn-pause-quit');
  if (quitBtn) {
    quitBtn.textContent = '🚪 Quit to Menu';
    quitBtn.classList.remove('armed');
  }
  if (resume && stage && !stage.isFinished()) {
    stage.setPaused(false);
    const statusEl = document.getElementById('timer-status');
    if (statusEl && statusEl.textContent !== 'Tap and hold your dog to start!') {
      statusEl.textContent = 'Tap & hold dog to resume!';
    }
  }
}

function buildApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <section id="screen-home" class="screen home-screen">
      <div class="home-topbar">
        <button id="btn-home-more" class="btn btn-small">✨ More Games</button>
        <button id="btn-home-sound" class="btn btn-small" aria-label="Toggle sound">🔊</button>
      </div>
      <div class="home-content">
        <div class="home-hero">
          <canvas id="home-dog-canvas" class="dog-preview-canvas"></canvas>
          <h1 class="game-title">Dog Hanger</h1>
          <p class="game-subtitle">Hold on tight & catch flying frisbees to refill grip!</p>
          <div id="home-best-pill" class="best-pill hidden"></div>
        </div>
        <div class="home-actions">
          <button id="btn-home-play" class="btn btn-primary">▶ Play</button>
          <div class="home-secondary-row">
            <button id="btn-home-options" class="btn btn-secondary">🐶 Breeds</button>
            <button id="btn-home-highscores" class="btn btn-secondary">🏆 Ranks</button>
          </div>
        </div>
      </div>
    </section>

    <section id="screen-options" class="screen hidden">
      <div class="top-nav">
        <button id="btn-options-back" class="btn btn-small">← Back</button>
        <h2 class="screen-heading">Dog Style</h2>
        <span style="width:60px"></span>
      </div>
      <div class="options-scroll">
        <div>
          <p class="section-label">Player Name</p>
          <input id="player-name-input" class="name-input" type="text" maxlength="20" placeholder="Player" />
        </div>
        <div>
          <p class="section-label">Dog Breed (10 Breeds)</p>
          <div id="dog-breed-grid" class="breed-grid"></div>
        </div>
        <div>
          <p class="section-label">Collar Color</p>
          <div id="collar-chips" class="chip-row"></div>
        </div>
        <div>
          <p class="section-label">Accessory</p>
          <div id="acc-chips" class="chip-row"></div>
        </div>
        <button id="btn-options-start" class="btn btn-primary">Play Now</button>
      </div>
    </section>

    <section id="screen-game" class="screen game-screen hidden">
      <div class="game-hud-bar">
        <button id="btn-game-pause" class="btn btn-small" aria-label="Pause">⏸ Pause</button>
        <div class="hud-center">
          <div class="timer-pill">
            <span id="timer-value" class="timer-value">0.00 s</span>
            <span id="bonus-badge" class="bonus-badge hidden">🥏 0</span>
          </div>
          <div id="timer-status" class="timer-sub">Tap and hold your dog to start!</div>
        </div>
        <div class="hud-right-group">
          <button id="btn-game-sound" class="btn btn-small" aria-label="Toggle sound">🔊</button>
        </div>
      </div>
      <div class="game-canvas-wrap">
        <canvas id="game-canvas" class="game-canvas"></canvas>
        <div id="round-banner" class="round-banner hidden">
          <div id="round-banner-text" style="font-weight:800;font-size:1.05rem;">Splash!</div>
          <div id="round-banner-sub" style="font-size:0.84rem;color:var(--muted);"></div>
          <button id="btn-retry" class="btn btn-primary" style="padding:12px;">Try Again</button>
          <div class="round-banner-actions">
            <button id="btn-banner-hs" class="btn btn-small">🏆 Ranks</button>
            <button id="btn-banner-menu" class="btn btn-small">🏠 Menu</button>
          </div>
        </div>
      </div>
    </section>

    <section id="screen-highscores" class="screen hidden">
      <div class="top-nav">
        <button id="btn-hs-back" class="btn btn-small">← Back</button>
        <h2 id="hs-heading" class="screen-heading">Leaderboard</h2>
        <button id="btn-hs-refresh" class="btn btn-small">Refresh</button>
      </div>
      <div class="hs-tabs">
        <button id="tab-hs-global" class="hs-tab active">🌐 Global</button>
        <button id="tab-hs-local" class="hs-tab">📱 Local</button>
      </div>
      <div class="hs-status-bar">
        <span id="hs-status-text">Connecting...</span>
      </div>
      <div id="server-box" class="server-box hidden">
        <p class="section-label" style="margin:0;">Developer Endpoint URL</p>
        <div style="display:flex;gap:8px;">
          <input id="server-url-input" class="name-input" type="url" placeholder="https://example.com" />
          <button id="btn-save-server" class="btn btn-small">Save</button>
        </div>
      </div>
      <div id="hs-list" class="hs-list"></div>
    </section>

    <div id="pause-modal" class="modal-backdrop hidden">
      <div class="modal-card">
        <h3 class="modal-title">⏸ Paused</h3>
        <p class="modal-sub">Catch your breath before the next frisbee flies by.</p>
        <button id="btn-pause-resume" class="btn btn-primary" style="padding:13px;">▶ Resume</button>
        <button id="btn-pause-options" class="btn btn-secondary">🐶 Dog Style</button>
        <button id="btn-pause-restart" class="btn btn-secondary">↻ Restart Run</button>
        <button id="btn-pause-quit" class="btn btn-danger">🚪 Quit to Menu</button>
      </div>
    </div>

    <div id="more-games-modal" class="modal-backdrop hidden">
      <div class="modal-card">
        <h3 class="modal-title">✨ More Games by VaelNTN</h3>
        <p class="modal-sub">Handcrafted arcade games from VaelNTN Studios.</p>
        <div class="more-games-list">
          <a class="more-game-item featured" href="https://github.com/VaelNTN/starforge-survivors/releases/latest" target="_blank" rel="noopener noreferrer">
            <div>
              <div class="more-game-name">⭐ Starforge Survivors</div>
              <div class="more-game-desc">Flagship sci-fi roguelite — 6 heroes, 6 bosses & zero ads</div>
            </div>
            <span class="more-game-badge">FLAGSHIP</span>
          </a>
          <a class="more-game-item" href="https://github.com/VaelNTN/dog-climber/releases/latest" target="_blank" rel="noopener noreferrer">
            <div>
              <div class="more-game-name">🐕 Dog Climber</div>
              <div class="more-game-desc">Climb past branches, grab Golden Bones & dodge pinecones</div>
            </div>
          </a>
          <a class="more-game-item" href="https://github.com/VaelNTN/cat-hanger/releases/latest" target="_blank" rel="noopener noreferrer">
            <div>
              <div class="more-game-name">🐱 Cat Hanger</div>
              <div class="more-game-desc">Hang tight through sunset wind gusts & rhythmic treat boosts</div>
            </div>
          </a>
          <a class="more-game-item" href="https://github.com/VaelNTN/cat-climber/releases/latest" target="_blank" rel="noopener noreferrer">
            <div>
              <div class="more-game-name">🐈 Cat Climber</div>
              <div class="more-game-desc">Race up the sky vine with fish treats & fever climbs</div>
            </div>
          </a>
        </div>
        <button id="btn-more-close" class="btn btn-secondary" style="padding:11px;">Close</button>
      </div>
    </div>
  `;
}

function showScreen(name: ScreenName): void {
  activeScreen = name;
  closePauseModal(false);
  document.getElementById('more-games-modal')?.classList.add('hidden');
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  document.getElementById(`screen-${name}`)?.classList.remove('hidden');

  if (name === 'game') startStage();
  else stopStage();

  if (name === 'home') startHomePreview();
  else stopHomePreview();

  if (hsPollInterval !== null) {
    clearInterval(hsPollInterval);
    hsPollInterval = null;
  }
  if (name === 'highscores') {
    document.getElementById('server-box')?.classList.add('hidden');
    refreshHighscoresView();
    hsPollInterval = window.setInterval(() => refreshHighscoresView(), 12000);
  }
}

function startHomePreview(): void {
  stopHomePreview();
  syncSoundButtons();
  const canvas = document.getElementById('home-dog-canvas') as HTMLCanvasElement;
  const pill = document.getElementById('home-best-pill')!;
  if (state.bestTimeSec > 0) {
    pill.textContent = `Best Time: ${state.bestTimeSec.toFixed(2)} s`;
    pill.classList.remove('hidden');
  } else {
    pill.classList.add('hidden');
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 150 * dpr;
  canvas.height = 150 * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let phase = 0;
  let last = performance.now();
  const draw = (now: number) => {
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    phase += dt * 1.8;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 150, 150);
    drawCartoonDog(ctx, 75, 68 + Math.sin(phase * 2) * 4, 34, {
      breed: getDogBreed(state.breedId),
      collarColor: state.collarColor,
      accessory: state.accessory,
      pose: 'portrait',
      animPhase: phase,
    });
    homeAnimId = requestAnimationFrame(draw);
  };
  homeAnimId = requestAnimationFrame(draw);
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
    const cvs = document.createElement('canvas');
    cvs.width = 48;
    cvs.height = 48;
    renderDogThumb(cvs, b.id, 48);
    const label = document.createElement('span');
    label.style.fontWeight = '700';
    label.style.fontSize = '0.88rem';
    label.textContent = b.name;
    btn.appendChild(cvs);
    btn.appendChild(label);
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

function resetGameHud(): void {
  document.getElementById('round-banner')!.classList.add('hidden');
  document.getElementById('timer-value')!.textContent = '0.00 s';
  const badge = document.getElementById('bonus-badge')!;
  badge.textContent = '🥏 0';
  badge.classList.add('hidden');
  document.getElementById('timer-status')!.textContent = 'Tap and hold your dog to start!';
}

function startStage(): void {
  resetGameHud();
  syncSoundButtons();

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
          document.getElementById('timer-status')!.textContent = 'Hold tight! Catch frisbees for grip!';
        },
        onTick: (sec, bonusScore, frisbeesCaught) => {
          document.getElementById('timer-value')!.textContent = `${sec.toFixed(2)} s`;
          const badge = document.getElementById('bonus-badge')!;
          if (frisbeesCaught > 0) {
            badge.textContent = `🥏 ${frisbeesCaught} (+${bonusScore})`;
            badge.classList.remove('hidden');
          }
          const step = Math.floor(sec / 10);
          if (step > lastMilestone) {
            lastMilestone = step;
            soundFX.playMilestone();
          }
        },
        onFrisbeeCatch: (frisbeesCaught, bonusScore) => {
          soundFX.playFrisbeeCatch();
          const badge = document.getElementById('bonus-badge')!;
          badge.textContent = `🥏 ${frisbeesCaught} (+${bonusScore})`;
          badge.classList.remove('hidden');
          document.getElementById('timer-status')!.textContent = 'Nice catch! +30% Grip & +1.5s!';
        },
        onRelease: (sec, reason, bonusScore, frisbeesCaught) => {
          soundFX.playSplash();
          const prevBest = state.bestTimeSec;
          const rounded = Math.round(sec * 100) / 100;
          recordDogHangerScore(state, sec);
          document.getElementById('timer-status')!.textContent =
            reason === 'stamina' ? `Grip slipped at ${sec.toFixed(2)} s!` : `Splash at ${sec.toFixed(2)} s!`;
          document.getElementById('round-banner-text')!.textContent =
            rounded > prevBest && rounded > 0
              ? `🏆 New Best: ${sec.toFixed(2)} s!`
              : `Time: ${sec.toFixed(2)} s (Best: ${state.bestTimeSec.toFixed(2)} s)`;
          document.getElementById('round-banner-sub')!.textContent =
            frisbeesCaught > 0
              ? `Frisbees caught: ${frisbeesCaught} (+${bonusScore} bonus pts)`
              : 'Tip: Catch flying frisbees (2nd finger or Space/F) to refill grip!';
          document.getElementById('round-banner')!.classList.remove('hidden');
          if (state.apiBaseUrl) {
            void submitGlobalDogHangerScore(state.apiBaseUrl, {
              deviceId: state.deviceId,
              playerName: state.playerName.trim() || 'Player',
              timeSec: sec,
              breedId: state.breedId,
              collarColor: state.collarColor,
              accessory: state.accessory,
            });
          }
        },
        onMissTap: () => {
          document.getElementById('timer-status')!.textContent = 'Tap inside the yellow circle!';
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

function appendDogHighscoreRow(
  list: HTMLElement,
  opts: {
    rankText: string;
    playerName: string;
    breedId: number;
    collarColor: DogHangerState['collarColor'];
    accessory: DogHangerState['accessory'];
    timeSec: number;
    isMe?: boolean;
  }
): void {
  const row = document.createElement('div');
  row.className = `hs-row${opts.isMe ? ' me' : ''}`;

  const left = document.createElement('div');
  left.className = 'hs-left';

  const rank = document.createElement('span');
  rank.className = 'hs-rank';
  rank.textContent = opts.rankText;

  const icon = document.createElement('canvas');
  icon.className = 'hs-icon';
  renderDogThumb(icon, opts.breedId, 38, opts.collarColor, opts.accessory);

  const info = document.createElement('div');
  info.style.minWidth = '0';
  const name = document.createElement('div');
  name.className = 'hs-name';
  name.textContent = opts.isMe ? `${opts.playerName} (You)` : opts.playerName;
  const meta = document.createElement('div');
  meta.className = 'hs-meta';
  meta.textContent = getDogBreed(opts.breedId).name;
  info.appendChild(name);
  info.appendChild(meta);

  left.appendChild(rank);
  left.appendChild(icon);
  left.appendChild(info);

  const score = document.createElement('div');
  score.className = 'hs-score';
  score.textContent = `${opts.timeSec.toFixed(2)} s`;

  row.appendChild(left);
  row.appendChild(score);
  list.appendChild(row);
}

function renderLocalHighscoresList(list: HTMLElement): void {
  if (state.highscores.length === 0) {
    list.innerHTML = `<p style="text-align:center;color:var(--muted);margin-top:30px;">No runs yet! Hold your dog to set a record.</p>`;
    return;
  }
  list.innerHTML = '';
  state.highscores.forEach((h, i) => {
    appendDogHighscoreRow(list, {
      rankText: `#${i + 1}`,
      playerName: h.playerName,
      breedId: h.breedId,
      collarColor: h.collarColor,
      accessory: h.accessory,
      timeSec: h.timeSec,
    });
  });
}

async function refreshHighscoresView(): Promise<void> {
  const list = document.getElementById('hs-list')!;
  const statusEl = document.getElementById('hs-status-text')!;
  (document.getElementById('server-url-input') as HTMLInputElement).value = state.apiBaseUrl;

  document.getElementById('tab-hs-global')?.classList.toggle('active', hsMode === 'global');
  document.getElementById('tab-hs-local')?.classList.toggle('active', hsMode === 'local');

  if (hsMode === 'local') {
    statusEl.textContent = `Local History (${state.highscores.length} runs)`;
    renderLocalHighscoresList(list);
    return;
  }

  if (!state.apiBaseUrl) {
    statusEl.textContent = 'Offline Mode — Local Records';
    renderLocalHighscoresList(list);
    return;
  }

  statusEl.textContent = 'Connecting...';
  try {
    const res = await fetchGlobalDogHangerHighscores(state.apiBaseUrl, state.deviceId, 50);
    const entries: GlobalDogHangerEntry[] = res.entries || [];
    statusEl.textContent = `Live • ${entries.length} players worldwide`;
    if (entries.length === 0) {
      list.innerHTML = `<p style="text-align:center;color:var(--muted);margin-top:30px;">No global scores yet! Be the first to hang on.</p>`;
      return;
    }
    list.innerHTML = '';
    entries.forEach((e) => {
      appendDogHighscoreRow(list, {
        rankText: `#${e.rank}`,
        playerName: e.playerName,
        breedId: e.breedId,
        collarColor: e.collarColor,
        accessory: e.accessory,
        timeSec: e.timeSec,
        isMe: e.deviceId === state.deviceId,
      });
    });
  } catch {
    statusEl.textContent = 'Offline Mode — Local Records';
    renderLocalHighscoresList(list);
  }
}

async function init(): Promise<void> {
  const deviceId = await resolveDeviceId();
  state = loadDogHangerState(deviceId);
  soundFX.enabled = state.soundEnabled;
  buildApp();
  renderOptions();
  syncSoundButtons();

  document.getElementById('btn-home-play')!.onclick = () => showScreen('game');
  document.getElementById('btn-home-options')!.onclick = () => {
    optionsFromPlay = false;
    renderOptions();
    showScreen('options');
  };
  document.getElementById('btn-home-highscores')!.onclick = () => showScreen('highscores');
  document.getElementById('btn-home-sound')!.onclick = toggleSound;
  document.getElementById('btn-home-more')!.onclick = () => {
    document.getElementById('more-games-modal')?.classList.remove('hidden');
  };
  document.getElementById('btn-more-close')!.onclick = () => {
    document.getElementById('more-games-modal')?.classList.add('hidden');
  };
  document.getElementById('more-games-modal')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('more-games-modal')?.classList.add('hidden');
    }
  });

  document.getElementById('btn-options-back')!.onclick = () => showScreen(optionsFromPlay ? 'game' : 'home');
  document.getElementById('btn-options-start')!.onclick = () => showScreen('game');
  document.getElementById('player-name-input')!.addEventListener('input', (e) => {
    state.playerName = (e.target as HTMLInputElement).value.slice(0, 20);
    saveDogHangerState(state);
  });

  document.getElementById('btn-game-pause')!.onclick = openPauseModal;
  document.getElementById('btn-game-sound')!.onclick = toggleSound;
  document.getElementById('btn-pause-resume')!.onclick = () => closePauseModal(true);
  document.getElementById('btn-pause-options')!.onclick = () => {
    optionsFromPlay = true;
    renderOptions();
    showScreen('options');
  };
  document.getElementById('btn-pause-restart')!.onclick = () => {
    closePauseModal(false);
    resetGameHud();
    stage?.resetRound();
  };
  document.getElementById('btn-pause-quit')!.onclick = () => {
    const quitBtn = document.getElementById('btn-pause-quit')!;
    if (!confirmQuitArmed) {
      confirmQuitArmed = true;
      quitBtn.textContent = '⚠️ Confirm Quit?';
      quitBtn.classList.add('armed');
    } else {
      showScreen('home');
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeScreen === 'game') {
      const modal = document.getElementById('pause-modal');
      if (modal && !modal.classList.contains('hidden')) closePauseModal(true);
      else openPauseModal();
    }
  });

  document.getElementById('btn-retry')!.onclick = () => {
    resetGameHud();
    stage?.resetRound();
  };
  document.getElementById('btn-banner-hs')!.onclick = () => showScreen('highscores');
  document.getElementById('btn-banner-menu')!.onclick = () => showScreen('home');

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
  document.getElementById('hs-heading')!.onclick = () => {
    hsHeadingTapCount += 1;
    if (hsHeadingTapTimer !== null) {
      window.clearTimeout(hsHeadingTapTimer);
    }
    if (hsHeadingTapCount >= 5) {
      hsHeadingTapCount = 0;
      document.getElementById('server-box')!.classList.toggle('hidden');
    } else {
      hsHeadingTapTimer = window.setTimeout(() => {
        hsHeadingTapCount = 0;
      }, 1500);
    }
  };
  document.getElementById('btn-save-server')!.onclick = () => {
    state.apiBaseUrl = (document.getElementById('server-url-input') as HTMLInputElement).value.trim().replace(/\/+$/, '');
    saveDogHangerState(state);
    document.getElementById('server-box')!.classList.add('hidden');
    refreshHighscoresView();
  };

  showScreen('home');
}

init();
