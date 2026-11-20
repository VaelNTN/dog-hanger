import { CollarColorId, DogAccessoryId, DogBreed } from '../data/dogs';
import { drawCartoonDog } from './dogRenderer';

export type DogHangerPhase = 'ready' | 'holding' | 'falling' | 'finished';

export interface DogHangerCallbacks {
  onStartHold: () => void;
  onTick: (elapsedSeconds: number, bonusScore: number, frisbeesCaught: number) => void;
  onFrisbeeCatch: (frisbeesCaught: number, bonusScore: number) => void;
  onRelease: (elapsedSeconds: number, reason: 'release' | 'stamina', bonusScore: number, frisbeesCaught: number) => void;
  onMissTap: () => void;
}

interface Frisbee {
  x: number;
  y: number;
  vx: number;
  rot: number;
  color: string;
}

interface FloatingPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface Butterfly {
  x: number;
  y: number;
  vx: number;
  phase: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  kind: 'splash' | 'sparkle' | 'sweat' | 'ripple';
  life: number;
  maxLife: number;
}

interface MilestoneBurst {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  label: string;
  life: number;
  maxLife: number;
}

const SPARKLE_COLORS = ['#fde047', '#38bdf8', '#fb7185', '#34d399', '#fbbf24'];

export class DogHangerStage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private breed: DogBreed;
  private collarColor: CollarColorId;
  private accessory: DogAccessoryId;
  private callbacks: DogHangerCallbacks;

  private width = 0;
  private height = 0;
  private dpr = 1;
  private active = false;
  private paused = false;
  private resumeHoldPending = false;
  private rafId: number | null = null;
  private lastTime = 0;

  private phase: DogHangerPhase = 'ready';
  private animClock = 0;
  private holdStartMs = 0;
  private holdElapsed = 0;
  private stamina = 1;
  private bonusScore = 0;
  private frisbeesCaught = 0;
  private activePointerId: number | null = null;
  private nextMilestoneSec = 5;

  private anchorX = 0;
  private anchorY = 32;
  private waterHeight = 64;
  private barFlex = 0;
  private ropeLength = 175;
  private swingAngle = 0;
  private swingPhase = 0;
  private prevSwingAngle = 0;
  private swingVel = 0;

  private dogX = 0;
  private dogY = 0;
  private fallVx = 0;
  private fallVy = 0;
  private fallRot = 0;
  private fallSpin = 0;
  private dogSize = 33;
  private hasSplashed = false;

  private frisbees: Frisbee[] = [];
  private nextFrisbeeAt = 2.2;
  private popups: FloatingPopup[] = [];
  private butterflies: Butterfly[] = [];
  private particles: Particle[] = [];
  private milestones: MilestoneBurst[] = [];
  private sweatTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    opts: { breed: DogBreed; collarColor: CollarColorId; accessory: DogAccessoryId },
    callbacks: DogHangerCallbacks
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D unavailable');
    this.ctx = context;
    this.breed = opts.breed;
    this.collarColor = opts.collarColor;
    this.accessory = opts.accessory;
    this.callbacks = callbacks;

    this.handleResize = this.handleResize.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onBlurOrHide = this.onBlurOrHide.bind(this);
    this.loop = this.loop.bind(this);

    this.initButterflies();
  }

  private initButterflies(): void {
    const colors = ['#f472b6', '#facc15', '#38bdf8', '#c084fc'];
    this.butterflies = [0, 1, 2].map((i) => ({
      x: 40 + i * 110,
      y: 120 + i * 70,
      vx: (i % 2 === 0 ? 1 : -1) * (22 + i * 7),
      phase: i * 2.1,
      color: colors[i % colors.length],
    }));
  }

  public setAppearance(opts: { breed: DogBreed; collarColor: CollarColorId; accessory: DogAccessoryId }): void {
    this.breed = opts.breed;
    this.collarColor = opts.collarColor;
    this.accessory = opts.accessory;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public isFinished(): boolean {
    return this.phase === 'falling' || this.phase === 'finished';
  }

  public setPaused(next: boolean): void {
    if (this.paused === next) return;
    this.paused = next;
    if (next) {
      if (this.phase === 'holding') {
        this.releasePointerCaptureSafe();
        this.activePointerId = null;
        this.resumeHoldPending = true;
      }
    } else {
      this.lastTime = performance.now();
    }
  }

  public resetRound(): void {
    this.releasePointerCaptureSafe();
    this.paused = false;
    this.resumeHoldPending = false;
    this.phase = 'ready';
    this.holdElapsed = 0;
    this.stamina = 1;
    this.bonusScore = 0;
    this.frisbeesCaught = 0;
    this.nextMilestoneSec = 5;
    this.barFlex = 0;
    this.swingAngle = 0;
    this.prevSwingAngle = 0;
    this.swingVel = 0;
    this.swingPhase = 0;
    this.fallVx = 0;
    this.fallVy = 0;
    this.fallRot = 0;
    this.hasSplashed = false;
    this.activePointerId = null;
    this.frisbees = [];
    this.popups = [];
    this.particles = [];
    this.milestones = [];
    this.sweatTimer = 0;
    this.nextFrisbeeAt = 2.2;
    this.updateDogPos();
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('blur', this.onBlurOrHide);
    document.addEventListener('visibilitychange', this.onBlurOrHide);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
    this.paused = false;
    this.resumeHoldPending = false;
    this.releasePointerCaptureSafe();
    this.activePointerId = null;
    if (this.phase === 'holding') {
      this.phase = 'ready';
    }
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('blur', this.onBlurOrHide);
    document.removeEventListener('visibilitychange', this.onBlurOrHide);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private releasePointerCaptureSafe(): void {
    if (this.activePointerId !== null) {
      try {
        if (this.canvas.hasPointerCapture?.(this.activePointerId)) {
          this.canvas.releasePointerCapture(this.activePointerId);
        }
      } catch {
        // Ignore
      }
    }
  }

  private onContextMenu(ev: Event): void {
    ev.preventDefault();
  }

  private onBlurOrHide(): void {
    if (document.hidden || !document.hasFocus()) {
      if (this.phase === 'holding' && !this.paused && !this.resumeHoldPending) {
        this.finishHold('release');
      }
    }
  }

  private handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.waterHeight = Math.min(68, Math.max(38, this.height * 0.14));
    this.anchorX = this.width / 2;
    this.anchorY = Math.max(28, Math.min(48, this.height * 0.095));
    const usableH = Math.max(120, this.height - this.waterHeight - this.anchorY);
    this.dogSize = Math.max(22, Math.min(35, Math.min(this.width * 0.09, usableH * 0.13)));
    this.ropeLength = Math.min(195, Math.max(66, usableH * 0.43));
    if (this.phase === 'ready' || this.phase === 'holding') this.updateDogPos();
  }

  private updateDogPos(): void {
    this.dogX = this.anchorX + Math.sin(this.swingAngle) * this.ropeLength;
    this.dogY = this.anchorY + this.barFlex + Math.cos(this.swingAngle) * this.ropeLength;
  }

  private catchFrisbeeAt(index: number): void {
    const f = this.frisbees[index];
    if (!f) return;
    this.frisbees.splice(index, 1);
    this.stamina = Math.min(1, this.stamina + 0.3);
    this.frisbeesCaught += 1;
    this.bonusScore += 100;
    this.holdElapsed += 1.5;
    this.spawnSparkles(f.x, f.y, 16);
    this.popups.push({
      x: Math.max(70, Math.min(this.width - 70, f.x)),
      y: f.y - 10,
      text: '+1.5s • +30% GRIP!',
      color: '#fde047',
      life: 1.15,
      maxLife: 1.15,
    });
    this.callbacks.onFrisbeeCatch(this.frisbeesCaught, this.bonusScore);
    this.callbacks.onTick(this.holdElapsed, this.bonusScore, this.frisbeesCaught);
  }

  private tryCatchNearestFrisbee(px?: number, py?: number): boolean {
    if (this.phase !== 'holding' || this.paused || this.resumeHoldPending) return false;
    if (this.frisbees.length === 0) return false;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.frisbees.length; i++) {
      const f = this.frisbees[i];
      if (f.x < -10 || f.x > this.width + 10) continue;
      if (px !== undefined && py !== undefined) {
        const d = Math.hypot(px - f.x, py - f.y);
        if (d <= 86 && d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      } else {
        const d = Math.abs(f.x - this.dogX);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
    }
    if (bestIdx >= 0) {
      this.catchFrisbeeAt(bestIdx);
      return true;
    }
    return false;
  }

  private onKeyDown(ev: KeyboardEvent): void {
    if (this.paused) return;
    if (ev.code === 'Space' || ev.code === 'KeyF') {
      if (this.phase === 'holding' && !this.resumeHoldPending) {
        ev.preventDefault();
        this.tryCatchNearestFrisbee();
      }
    }
  }

  private onPointerDown(ev: PointerEvent): void {
    ev.preventDefault();
    if (this.paused) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;

    // Multi-touch frisbee catch while already holding the dog
    if (this.phase === 'holding' && !this.resumeHoldPending && this.activePointerId !== null && ev.pointerId !== this.activePointerId) {
      this.tryCatchNearestFrisbee(px, py);
      return;
    }

    // Resuming hold after pause
    if (this.phase === 'holding' && this.resumeHoldPending && this.activePointerId === null) {
      const dist = Math.hypot(px - this.dogX, py - this.dogY);
      if (dist <= 95) {
        this.activePointerId = ev.pointerId;
        this.resumeHoldPending = false;
        try {
          this.canvas.setPointerCapture(ev.pointerId);
        } catch {
          // Ignore
        }
        this.spawnSparkles(this.dogX, this.dogY - 10, 6);
        this.callbacks.onStartHold();
      } else {
        this.callbacks.onMissTap();
      }
      return;
    }

    if (this.phase !== 'ready' || this.activePointerId !== null) return;
    const dist = Math.hypot(px - this.dogX, py - this.dogY);
    if (dist <= 95) {
      this.activePointerId = ev.pointerId;
      try {
        this.canvas.setPointerCapture(ev.pointerId);
      } catch {
        // Ignore
      }
      this.phase = 'holding';
      this.holdStartMs = performance.now();
      this.holdElapsed = 0;
      this.stamina = 1;
      this.bonusScore = 0;
      this.frisbeesCaught = 0;
      this.nextMilestoneSec = 5;
      this.nextFrisbeeAt = 2.2;
      this.hasSplashed = false;
      this.spawnSparkles(this.dogX, this.dogY - 12, 8);
      this.callbacks.onStartHold();
    } else {
      this.callbacks.onMissTap();
    }
  }

  private onPointerUp(ev: PointerEvent): void {
    if (this.paused || this.resumeHoldPending) return;
    if (this.phase !== 'holding') return;
    if (this.activePointerId !== null && ev.pointerId !== this.activePointerId) return;
    this.finishHold('release');
  }

  private finishHold(reason: 'release' | 'stamina'): void {
    this.releasePointerCaptureSafe();
    this.activePointerId = null;
    this.resumeHoldPending = false;
    const fallback = Math.min(0.05, Math.max(0.01, (performance.now() - this.holdStartMs) / 1000));
    this.holdElapsed = Math.max(0.01, this.holdElapsed > 0 ? this.holdElapsed : fallback);
    this.phase = 'falling';
    this.fallVx = Math.cos(this.swingAngle) * (Math.sin(this.swingPhase * 2) * 95);
    this.fallVy = 45;
    this.fallSpin = (this.fallVx >= 0 ? 1 : -1) * 4.8;
    this.spawnSparkles(this.dogX, this.dogY, 12);
    this.callbacks.onRelease(this.holdElapsed, reason, this.bonusScore, this.frisbeesCaught);
  }

  private spawnSparkles(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = 70 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 35,
        size: 3.2 + Math.random() * 3,
        color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
        kind: 'sparkle',
        life: 0.55 + Math.random() * 0.3,
        maxLife: 0.85,
      });
    }
  }

  private spawnPoolSplash(x: number, y: number): void {
    for (let i = 0; i < 28; i++) {
      const spread = (Math.random() - 0.5) * Math.PI * 0.85;
      const spd = 110 + Math.random() * 240;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 28,
        y,
        vx: Math.sin(spread) * spd,
        vy: -Math.cos(spread) * spd - 60,
        size: 4 + Math.random() * 5,
        color: i % 3 === 0 ? '#e0f2fe' : i % 2 === 0 ? '#7dd3fc' : '#38bdf8',
        kind: 'splash',
        life: 0.65 + Math.random() * 0.35,
        maxLife: 1.0,
      });
    }
    for (let r = 0; r < 2; r++) {
      this.particles.push({
        x,
        y: y + 4,
        vx: 0,
        vy: 0,
        size: 16 + r * 14,
        color: '#bae6fd',
        kind: 'ripple',
        life: 0.6 + r * 0.15,
        maxLife: 0.75,
      });
    }
  }

  private spawnSweatDrop(): void {
    const side = Math.random() > 0.5 ? 1 : -1;
    this.particles.push({
      x: this.dogX + side * (this.dogSize * 0.75),
      y: this.dogY - this.dogSize * 0.35,
      vx: side * (32 + Math.random() * 40),
      vy: -42 - Math.random() * 35,
      size: 3.5 + Math.random() * 2,
      color: '#bae6fd',
      kind: 'sweat',
      life: 0.55,
      maxLife: 0.55,
    });
  }

  private triggerMilestone(sec: number): void {
    this.milestones.push({
      x: this.dogX,
      y: this.dogY,
      radius: 26,
      maxRadius: 112,
      label: `${sec}s!`,
      life: 0.9,
      maxLife: 0.9,
    });
    this.spawnSparkles(this.dogX, this.dogY, sec % 10 === 0 ? 18 : 12);
  }

  private loop(now: number): void {
    if (!this.active) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (!this.paused) {
      this.animClock += dt;
      this.prevSwingAngle = this.swingAngle;

      if (this.phase === 'holding' && !this.resumeHoldPending) {
        this.holdElapsed += dt;
        const drainRate = 0.044 + Math.min(0.036, this.holdElapsed * 0.0013);
        this.stamina = Math.max(0, this.stamina - drainRate * dt);
        this.callbacks.onTick(this.holdElapsed, this.bonusScore, this.frisbeesCaught);

        if (this.stamina <= 0) {
          this.finishHold('stamina');
        } else {
          while (this.holdElapsed >= this.nextMilestoneSec) {
            this.triggerMilestone(this.nextMilestoneSec);
            this.nextMilestoneSec += 5;
          }

          const difficulty = 1 + Math.min(2.2, this.holdElapsed / 18);
          this.swingPhase += dt * (1.85 + difficulty * 0.48);
          const maxAmp = Math.min(0.45, 0.14 + this.holdElapsed * 0.009);
          this.swingAngle = Math.sin(this.swingPhase) * maxAmp;
          this.barFlex += (6 + Math.min(5, this.holdElapsed * 0.15) - this.barFlex) * Math.min(1, dt * 10);
          this.updateDogPos();

          if (this.holdElapsed >= 3 || this.stamina < 0.45) {
            this.sweatTimer -= dt;
            if (this.sweatTimer <= 0) {
              this.spawnSweatDrop();
              this.sweatTimer = Math.max(0.18, 0.65 - (1 - this.stamina) * 0.4);
            }
          }

          if (this.holdElapsed >= this.nextFrisbeeAt) {
            this.nextFrisbeeAt = this.holdElapsed + Math.max(2.4, 4.2 - this.holdElapsed * 0.03);
            const fromLeft = Math.random() > 0.5;
            const frisbeeColors = ['#f43f5e', '#f59e0b', '#06b6d4', '#a855f7'];
            const waterY = this.height - this.waterHeight;
            const minY = this.anchorY + 42;
            const maxY = Math.max(minY + 20, waterY - 48);
            this.frisbees.push({
              x: fromLeft ? -28 : this.width + 28,
              y: minY + Math.random() * (maxY - minY),
              vx: (fromLeft ? 1 : -1) * (125 + Math.random() * 75),
              rot: 0,
              color: frisbeeColors[Math.floor(Math.random() * frisbeeColors.length)],
            });
          }
        }
      } else if (this.phase === 'ready' || this.resumeHoldPending) {
        this.swingAngle = Math.sin(this.animClock * 1.6) * 0.06;
        this.barFlex += (3 - this.barFlex) * Math.min(1, dt * 8);
        this.updateDogPos();
      } else if (this.phase === 'falling') {
        this.fallVy += 960 * dt;
        this.dogX += this.fallVx * dt;
        this.dogY += this.fallVy * dt;
        this.fallRot += this.fallSpin * dt;
        this.barFlex += (0 - this.barFlex) * Math.min(1, dt * 12);
        const waterY = this.height - this.waterHeight;
        if (!this.hasSplashed && this.dogY >= waterY - 8) {
          this.hasSplashed = true;
          this.spawnPoolSplash(this.dogX, waterY);
        }
        if (this.dogY > this.height + 24) {
          this.phase = 'finished';
        }
      } else {
        this.barFlex += (0 - this.barFlex) * Math.min(1, dt * 10);
      }

      this.swingVel = Math.max(-1.5, Math.min(1.5, (this.swingAngle - this.prevSwingAngle) / dt));

      this.frisbees = this.frisbees.filter((f) => {
        f.x += f.vx * dt;
        f.rot += dt * 9;
        return f.x > -60 && f.x < this.width + 60;
      });

      for (let i = this.popups.length - 1; i >= 0; i--) {
        const pop = this.popups[i];
        pop.life -= dt;
        pop.y -= 36 * dt;
        if (pop.life <= 0) this.popups.splice(i, 1);
      }

      for (const b of this.butterflies) {
        b.x += b.vx * dt;
        b.y += Math.sin(this.animClock * 3 + b.phase) * 18 * dt;
        if (b.x > this.width + 25) b.x = -25;
        if (b.x < -25) b.x = this.width + 25;
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        if (p.kind === 'splash' || p.kind === 'sweat') {
          p.vy += 520 * dt;
        } else if (p.kind === 'ripple') {
          p.size += 85 * dt;
        } else {
          p.vx *= Math.pow(0.25, dt);
          p.vy += 200 * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      for (let i = this.milestones.length - 1; i >= 0; i--) {
        const m = this.milestones[i];
        m.life -= dt;
        if (m.life <= 0) {
          this.milestones.splice(i, 1);
          continue;
        }
        const prog = 1 - m.life / m.maxLife;
        m.radius = 26 + (m.maxRadius - 26) * (1 - Math.pow(1 - prog, 2));
      }
    }

    this.draw();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private draw(): void {
    const { ctx, width, height } = this;
    if (width <= 0 || height <= 0) return;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const waterY = height - this.waterHeight;
    this.drawSunnyParkBackdrop(ctx, width, height, waterY);
    this.drawSparklingPool(ctx, width, height, waterY);
    this.drawParkBar(ctx, width);

    // Grip stamina meter cleanly positioned beneath the park bar (left corner so never hits rope)
    if (this.phase === 'holding') {
      this.drawStaminaMeter(ctx, width);
    }

    // Chew rope + knot + bone handle
    const clampedAnchorY = this.anchorY + this.barFlex * 0.65;
    const ropeEndX = this.phase === 'ready' || this.phase === 'holding' ? this.dogX : this.anchorX;
    const ropeEndY =
      this.phase === 'ready' || this.phase === 'holding'
        ? this.dogY - this.dogSize * 0.9
        : clampedAnchorY + this.ropeLength * 0.68;

    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 9.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.anchorX, clampedAnchorY);
    ctx.lineTo(ropeEndX, ropeEndY);
    ctx.stroke();

    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(this.anchorX, clampedAnchorY);
    ctx.lineTo(ropeEndX, ropeEndY);
    ctx.stroke();

    // Chew bone handle
    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(ropeEndX - 18, ropeEndY - 5, 36, 10, 5);
    ctx.fill();
    ctx.stroke();
    for (const bx of [-18, 18]) {
      for (const by of [-4, 4]) {
        ctx.beginPath();
        ctx.arc(ropeEndX + bx, ropeEndY + by, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Flying catchable frisbees with glowing aura & motion trail
    for (const f of this.frisbees) {
      ctx.save();
      const pulse = 0.5 + 0.5 * Math.sin(this.animClock * 10);
      ctx.strokeStyle = `rgba(253, 224, 71, ${0.45 + pulse * 0.45})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 28 + pulse * 5, 0, Math.PI * 2);
      ctx.stroke();

      const dir = f.vx > 0 ? -1 : 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(f.x + dir * 20, f.y - 3);
      ctx.lineTo(f.x + dir * 44, f.y - 3);
      ctx.moveTo(f.x + dir * 22, f.y + 4);
      ctx.lineTo(f.x + dir * 38, f.y + 4);
      ctx.stroke();

      ctx.translate(f.x, f.y);
      ctx.rotate(Math.sin(f.rot) * 0.25);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(-4, -2.5, 11, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Frisbee prompt badge when one is active
    if (this.phase === 'holding' && !this.resumeHoldPending && this.frisbees.length > 0) {
      const label = '🥏 Tap Frisbee / [Space]!';
      ctx.save();
      ctx.font = '800 12px system-ui, -apple-system, sans-serif';
      const tw = ctx.measureText(label).width;
      const bw = tw + 20;
      const bx = width - bw - 12;
      const by = this.anchorY + 14;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 24, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + bw / 2, by + 12);
      ctx.restore();
    }

    // Milestone rings
    for (const m of this.milestones) {
      const alpha = Math.max(0, m.life / m.maxLife);
      ctx.save();
      ctx.strokeStyle = `rgba(253, 224, 71, ${alpha})`;
      ctx.lineWidth = 4 * alpha + 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '800 20px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(254, 240, 138, ${alpha})`;
      ctx.strokeStyle = `rgba(120, 53, 15, ${alpha * 0.7})`;
      ctx.lineWidth = 3;
      ctx.strokeText(m.label, m.x, m.y - m.radius * 0.72 - 4);
      ctx.fillText(m.label, m.x, m.y - m.radius * 0.72 - 4);
      ctx.restore();
    }

    // Dog
    if (this.phase !== 'finished') {
      const effort = this.phase === 'holding' ? Math.max(Math.min(1, this.holdElapsed / 14), 1 - this.stamina) : 0;
      const shake =
        this.phase === 'holding' && !this.resumeHoldPending && (this.holdElapsed > 5 || this.stamina < 0.35)
          ? Math.min(3, Math.max((this.holdElapsed - 5) * 0.2, (0.35 - this.stamina) * 8))
          : 0;
      const sx = shake > 0 ? Math.sin(this.animClock * 46) * shake : 0;
      ctx.save();
      ctx.translate(this.dogX + sx, this.dogY);
      ctx.rotate(this.phase === 'falling' ? this.fallRot : -this.swingAngle * 0.6);
      drawCartoonDog(ctx, 0, 0, this.dogSize, {
        breed: this.breed,
        collarColor: this.collarColor,
        accessory: this.accessory,
        pose: this.phase === 'holding' || this.phase === 'ready' ? 'hang' : 'fall',
        animPhase: this.animClock,
        effort,
        swingVel: this.swingVel,
      });
      ctx.restore();
    }

    // Ready / resume grab circle
    if (this.phase === 'ready' || this.resumeHoldPending) {
      const pulse = Math.sin(this.animClock * 5);
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.7 + pulse * 0.2})`;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(this.dogX, this.dogY, Math.min(56, this.dogSize * 1.65) + pulse * 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Floating popups
    for (const pop of this.popups) {
      const alpha = Math.max(0, pop.life / pop.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '900 17px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.lineWidth = 4;
      ctx.strokeText(pop.text, pop.x, pop.y);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }

    // Particles (pool splash, ripples, sparkles, sweat drops)
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.kind === 'ripple') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size, p.size * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'sweat') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - p.size * 1.2);
        ctx.quadraticCurveTo(p.x + p.size * 0.85, p.y + p.size * 0.3, p.x, p.y + p.size);
        ctx.quadraticCurveTo(p.x - p.size * 0.85, p.y + p.size * 0.3, p.x, p.y - p.size * 1.2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.45 + 0.55 * alpha), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const b of this.butterflies) {
      this.drawButterfly(ctx, b);
    }

    ctx.restore();
  }

  private drawStaminaMeter(ctx: CanvasRenderingContext2D, _width: number): void {
    const barW = 112;
    const barH = 12;
    const bx = 14;
    const by = this.anchorY + 14;
    const low = this.stamina < 0.28;
    const pulse = low ? 0.65 + 0.35 * Math.sin(this.animClock * 14) : 1;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.strokeStyle = low ? `rgba(248, 113, 113, ${pulse})` : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx - 4, by - 4, barW + 46, barH + 8, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = '800 10px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = low ? '#fca5a5' : '#e2e8f0';
    ctx.textBaseline = 'middle';
    ctx.fillText('GRIP', bx + 2, by + barH / 2 + 0.5);

    const trackX = bx + 34;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.beginPath();
    ctx.roundRect(trackX, by, barW, barH, 6);
    ctx.fill();

    const fillW = Math.max(0, barW * this.stamina);
    if (fillW > 0) {
      ctx.fillStyle = this.stamina > 0.55 ? '#22c55e' : this.stamina > 0.28 ? '#f59e0b' : '#ef4444';
      ctx.beginPath();
      ctx.roundRect(trackX, by, fillW, barH, 6);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSunnyParkBackdrop(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    waterY: number
  ): void {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0ea5e9');
    grad.addColorStop(0.48, '#7dd3fc');
    grad.addColorStop(0.76, '#fef3c7');
    grad.addColorStop(1, '#dcfce7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const sunX = width * 0.84;
    const sunY = Math.max(this.anchorY + 34, height * 0.18);
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 58);
    sunGlow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
    sunGlow.addColorStop(0.35, 'rgba(253, 224, 71, 0.4)');
    sunGlow.addColorStop(1, 'rgba(253, 224, 71, 0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
    for (let i = 0; i < 4; i++) {
      const drift = (this.animClock * (10 + i * 3)) % (width + 140);
      const cx = ((i * 115 + drift) % (width + 140)) - 70;
      const cy = Math.max(this.anchorY + 26, height * (0.16 + (i % 3) * 0.08));
      ctx.beginPath();
      ctx.ellipse(cx, cy, 40, 15, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 20, cy + 4, 21, 11, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 22, cy + 4, 22, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const horizonY = waterY;
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.quadraticCurveTo(width * 0.26, horizonY - 70, width * 0.56, horizonY - 22);
    ctx.quadraticCurveTo(width * 0.82, horizonY - 62, width, horizonY - 12);
    ctx.lineTo(width, horizonY + 10);
    ctx.lineTo(0, horizonY + 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(0, horizonY - 10);
    ctx.quadraticCurveTo(width * 0.35, horizonY - 40, width * 0.68, horizonY - 10);
    ctx.quadraticCurveTo(width * 0.88, horizonY - 30, width, horizonY - 6);
    ctx.lineTo(width, horizonY + 10);
    ctx.lineTo(0, horizonY + 10);
    ctx.closePath();
    ctx.fill();

    for (const side of [-1, 1]) {
      const tx = side === -1 ? 24 : width - 24;
      const sway = Math.sin(this.animClock * 1.4 + side) * 4;
      ctx.fillStyle = '#78350f';
      ctx.fillRect(tx - 6, horizonY - 76, 12, 76);
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(tx + sway, horizonY - 88, 28, 0, Math.PI * 2);
      ctx.arc(tx - 15 + sway, horizonY - 74, 20, 0, Math.PI * 2);
      ctx.arc(tx + 15 + sway, horizonY - 74, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(tx + sway - 4, horizonY - 92, 19, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(254, 243, 199, 0.82)';
    ctx.fillRect(0, horizonY - 22, width, 4);
    for (let fx = 8; fx < width; fx += 22) {
      ctx.beginPath();
      ctx.moveTo(fx, horizonY - 28);
      ctx.lineTo(fx + 5, horizonY - 34);
      ctx.lineTo(fx + 10, horizonY - 28);
      ctx.lineTo(fx + 10, horizonY);
      ctx.lineTo(fx, horizonY);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawSparklingPool(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    waterY: number
  ): void {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, waterY - 6, width, 8);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, waterY - 6, width, 2);

    const poolGrad = ctx.createLinearGradient(0, waterY, 0, height);
    poolGrad.addColorStop(0, '#38bdf8');
    poolGrad.addColorStop(0.45, '#0284c7');
    poolGrad.addColorStop(1, '#0369a1');
    ctx.fillStyle = poolGrad;
    ctx.fillRect(0, waterY, width, height - waterY);

    ctx.fillStyle = 'rgba(186, 230, 253, 0.55)';
    ctx.beginPath();
    ctx.moveTo(0, waterY + 8);
    for (let x = 0; x <= width; x += 20) {
      const y = waterY + 4 + Math.sin(x * 0.05 + this.animClock * 3.5) * 3.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, waterY + 14);
    ctx.lineTo(0, waterY + 14);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 8; i++) {
      const gx = ((i * 73 + 25) % 100) * 0.01 * width;
      const gy = waterY + 12 + (i % 3) * 12;
      const glint = Math.max(0, Math.sin(this.animClock * 4.5 + i * 1.7));
      if (glint > 0.35) {
        ctx.fillStyle = `rgba(255, 255, 255, ${glint * 0.85})`;
        ctx.beginPath();
        ctx.ellipse(gx, gy, 7 * glint, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawParkBar(ctx: CanvasRenderingContext2D, width: number): void {
    const barY = this.anchorY - 6;
    const flexY = barY + this.barFlex;

    const woodGrad = ctx.createLinearGradient(0, barY - 20, 0, barY - 4);
    woodGrad.addColorStop(0, '#b45309');
    woodGrad.addColorStop(0.5, '#92400e');
    woodGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = woodGrad;
    ctx.fillRect(0, barY - 20, width, 15);

    ctx.fillStyle = '#78350f';
    ctx.fillRect(8, barY - 5, 16, 16);
    ctx.fillRect(width - 24, barY - 5, 16, 16);

    ctx.save();
    ctx.lineCap = 'round';
    const goldGrad = ctx.createLinearGradient(0, barY - 4, 0, flexY + 8);
    goldGrad.addColorStop(0, '#fef08a');
    goldGrad.addColorStop(0.45, '#f59e0b');
    goldGrad.addColorStop(1, '#b45309');
    ctx.strokeStyle = goldGrad;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(16, barY);
    ctx.quadraticCurveTo(this.anchorX, flexY, width - 16, barY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, barY - 2);
    ctx.quadraticCurveTo(this.anchorX, flexY - 2, width - 20, barY - 2);
    ctx.stroke();
    ctx.restore();

    const ringY = this.anchorY + this.barFlex * 0.5;
    ctx.fillStyle = '#fde047';
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(this.anchorX, ringY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawButterfly(ctx: CanvasRenderingContext2D, b: Butterfly): void {
    const flap = Math.abs(Math.sin(this.animClock * 14 + b.phase));
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.ellipse(-3, -2, 5 * (0.3 + flap * 0.7), 4, -0.3, 0, Math.PI * 2);
    ctx.ellipse(3, -2, 5 * (0.3 + flap * 0.7), 4, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-0.8, -4, 1.6, 8);
    ctx.restore();
  }
}
