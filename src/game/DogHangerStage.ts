import { CollarColorId, DogAccessoryId, DogBreed } from '../data/dogs';
import { drawCartoonDog } from './dogRenderer';

export type DogHangerPhase = 'ready' | 'holding' | 'falling' | 'finished';

export interface DogHangerCallbacks {
  onStartHold: () => void;
  onTick: (elapsedSeconds: number) => void;
  onRelease: (elapsedSeconds: number) => void;
  onMissTap: () => void;
}

interface Frisbee {
  x: number;
  y: number;
  vx: number;
  rot: number;
  color: string;
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
  private rafId: number | null = null;
  private lastTime = 0;

  private phase: DogHangerPhase = 'ready';
  private animClock = 0;
  private holdStartMs = 0;
  private holdElapsed = 0;
  private activePointerId: number | null = null;
  private nextMilestoneSec = 5;

  private anchorX = 0;
  private anchorY = 32;
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
  private nextFrisbeeAt = 3;
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

  public resetRound(): void {
    this.releasePointerCaptureSafe();
    this.phase = 'ready';
    this.holdElapsed = 0;
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
    this.particles = [];
    this.milestones = [];
    this.sweatTimer = 0;
    this.nextFrisbeeAt = 3;
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
    window.addEventListener('blur', this.onBlurOrHide);
    document.addEventListener('visibilitychange', this.onBlurOrHide);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
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
      if (this.phase === 'holding') {
        this.finishHold();
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
    this.anchorX = this.width / 2;
    this.anchorY = Math.max(54, this.height * 0.12);
    this.dogSize = Math.max(27, Math.min(36, Math.min(this.width, this.height) * 0.085));
    this.ropeLength = Math.min(210, Math.max(125, this.height * 0.34));
    if (this.phase === 'ready' || this.phase === 'holding') this.updateDogPos();
  }

  private updateDogPos(): void {
    this.dogX = this.anchorX + Math.sin(this.swingAngle) * this.ropeLength;
    this.dogY = this.anchorY + this.barFlex + Math.cos(this.swingAngle) * this.ropeLength;
  }

  private onPointerDown(ev: PointerEvent): void {
    ev.preventDefault();
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (this.phase !== 'ready' || this.activePointerId !== null) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
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
      this.nextMilestoneSec = 5;
      this.hasSplashed = false;
      this.spawnSparkles(this.dogX, this.dogY - 12, 8);
      this.callbacks.onStartHold();
    } else {
      this.callbacks.onMissTap();
    }
  }

  private onPointerUp(ev: PointerEvent): void {
    if (this.phase !== 'holding') return;
    if (this.activePointerId !== null && ev.pointerId !== this.activePointerId) return;
    this.finishHold();
  }

  private finishHold(): void {
    this.releasePointerCaptureSafe();
    this.activePointerId = null;
    const fallback = Math.min(0.05, Math.max(0.01, (performance.now() - this.holdStartMs) / 1000));
    this.holdElapsed = Math.max(0.01, this.holdElapsed > 0 ? this.holdElapsed : fallback);
    this.phase = 'falling';
    this.fallVx = Math.cos(this.swingAngle) * (Math.sin(this.swingPhase * 2) * 95);
    this.fallVy = 45;
    this.fallSpin = (this.fallVx >= 0 ? 1 : -1) * 4.8;
    this.spawnSparkles(this.dogX, this.dogY, 12);
    this.callbacks.onRelease(this.holdElapsed);
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
    this.animClock += dt;

    this.prevSwingAngle = this.swingAngle;

    if (this.phase === 'holding') {
      this.holdElapsed += dt;
      this.callbacks.onTick(this.holdElapsed);

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

      if (this.holdElapsed >= 4) {
        this.sweatTimer -= dt;
        if (this.sweatTimer <= 0) {
          this.spawnSweatDrop();
          this.sweatTimer = Math.max(0.22, 0.72 - this.holdElapsed * 0.02);
        }
      }

      if (this.holdElapsed >= this.nextFrisbeeAt) {
        this.nextFrisbeeAt += Math.max(1.8, 4 - this.holdElapsed * 0.04);
        const fromLeft = Math.random() > 0.5;
        const frisbeeColors = ['#f43f5e', '#f59e0b', '#06b6d4', '#a855f7'];
        this.frisbees.push({
          x: fromLeft ? -30 : this.width + 30,
          y: this.anchorY + this.ropeLength * (0.4 + Math.random() * 0.5),
          vx: (fromLeft ? 1 : -1) * (170 + Math.random() * 110),
          rot: 0,
          color: frisbeeColors[Math.floor(Math.random() * frisbeeColors.length)],
        });
      }
    } else if (this.phase === 'ready') {
      this.swingAngle = Math.sin(this.animClock * 1.6) * 0.06;
      this.barFlex += (3 - this.barFlex) * Math.min(1, dt * 8);
      this.updateDogPos();
    } else if (this.phase === 'falling') {
      this.fallVy += 960 * dt;
      this.dogX += this.fallVx * dt;
      this.dogY += this.fallVy * dt;
      this.fallRot += this.fallSpin * dt;
      this.barFlex += (0 - this.barFlex) * Math.min(1, dt * 12);
      const waterY = this.height - 70;
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

    // Butterflies fluttering across the park
    for (const b of this.butterflies) {
      b.x += b.vx * dt;
      b.y += Math.sin(this.animClock * 3 + b.phase) * 18 * dt;
      if (b.x > this.width + 25) b.x = -25;
      if (b.x < -25) b.x = this.width + 25;
    }

    // Particles
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

    // Milestone rings
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

    this.draw();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private draw(): void {
    const { ctx, width, height } = this;
    if (width <= 0 || height <= 0) return;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    this.drawSunnyParkBackdrop(ctx, width, height);

    // Sparkling water pool at bottom with waves & sunlight glints
    const waterY = height - 70;
    this.drawSparklingPool(ctx, width, height, waterY);

    // Sturdy wooden/golden park bar across top
    this.drawParkBar(ctx, width);

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

    // Flying frisbees with motion trail
    for (const f of this.frisbees) {
      ctx.save();
      const dir = f.vx > 0 ? -1 : 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
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
      ctx.ellipse(0, 0, 23, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.ellipse(-4, -2.5, 11, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
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
      const effort = this.phase === 'holding' ? Math.min(1, this.holdElapsed / 14) : 0;
      const shake = this.phase === 'holding' && this.holdElapsed > 5 ? Math.min(2.6, (this.holdElapsed - 5) * 0.22) : 0;
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

    // Ready grab circle
    if (this.phase === 'ready') {
      const pulse = Math.sin(this.animClock * 5);
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.7 + pulse * 0.2})`;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(this.dogX, this.dogY, 54 + pulse * 6, 0, Math.PI * 2);
      ctx.stroke();
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

    // Fluttering butterflies
    for (const b of this.butterflies) {
      this.drawButterfly(ctx, b);
    }

    ctx.restore();
  }

  private drawSunnyParkBackdrop(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    // Sunny sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0ea5e9');
    grad.addColorStop(0.48, '#7dd3fc');
    grad.addColorStop(0.76, '#fef3c7');
    grad.addColorStop(1, '#dcfce7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Warm sun with soft rays
    const sunX = width * 0.82;
    const sunY = height * 0.16;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 12, sunX, sunY, 68);
    sunGlow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
    sunGlow.addColorStop(0.35, 'rgba(253, 224, 71, 0.4)');
    sunGlow.addColorStop(1, 'rgba(253, 224, 71, 0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 68, 0, Math.PI * 2);
    ctx.fill();

    // Animated drifting clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
    for (let i = 0; i < 4; i++) {
      const drift = (this.animClock * (10 + i * 3)) % (width + 140);
      const cx = ((i * 115 + drift) % (width + 140)) - 70;
      const cy = height * (0.14 + (i % 3) * 0.09);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 42, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 20, cy + 4, 22, 12, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 22, cy + 4, 24, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Layered rolling green hills
    const horizonY = height - 70;
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.quadraticCurveTo(width * 0.26, horizonY - 82, width * 0.56, horizonY - 26);
    ctx.quadraticCurveTo(width * 0.82, horizonY - 72, width, horizonY - 14);
    ctx.lineTo(width, horizonY + 10);
    ctx.lineTo(0, horizonY + 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(0, horizonY - 12);
    ctx.quadraticCurveTo(width * 0.35, horizonY - 46, width * 0.68, horizonY - 12);
    ctx.quadraticCurveTo(width * 0.88, horizonY - 34, width, horizonY - 6);
    ctx.lineTo(width, horizonY + 10);
    ctx.lineTo(0, horizonY + 10);
    ctx.closePath();
    ctx.fill();

    // Swaying park trees on left and right edges
    for (const side of [-1, 1]) {
      const tx = side === -1 ? 24 : width - 24;
      const sway = Math.sin(this.animClock * 1.4 + side) * 4;
      ctx.fillStyle = '#78350f';
      ctx.fillRect(tx - 6, horizonY - 86, 12, 86);
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(tx + sway, horizonY - 98, 32, 0, Math.PI * 2);
      ctx.arc(tx - 16 + sway, horizonY - 82, 22, 0, Math.PI * 2);
      ctx.arc(tx + 16 + sway, horizonY - 82, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(tx + sway - 4, horizonY - 104, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    // Backyard wooden fence along pool edge
    ctx.fillStyle = 'rgba(254, 243, 199, 0.82)';
    ctx.fillRect(0, horizonY - 24, width, 4);
    for (let fx = 8; fx < width; fx += 22) {
      ctx.beginPath();
      ctx.moveTo(fx, horizonY - 30);
      ctx.lineTo(fx + 5, horizonY - 36);
      ctx.lineTo(fx + 10, horizonY - 30);
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
    // Pool edge stone rim
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, waterY - 6, width, 8);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, waterY - 6, width, 2);

    // Rich pool gradient
    const poolGrad = ctx.createLinearGradient(0, waterY, 0, height);
    poolGrad.addColorStop(0, '#38bdf8');
    poolGrad.addColorStop(0.45, '#0284c7');
    poolGrad.addColorStop(1, '#0369a1');
    ctx.fillStyle = poolGrad;
    ctx.fillRect(0, waterY, width, height - waterY);

    // Animated wave crests
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

    // Sparkling sunlight glints dancing on water
    for (let i = 0; i < 8; i++) {
      const gx = ((i * 73 + 25) % 100) * 0.01 * width;
      const gy = waterY + 14 + (i % 3) * 14;
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
    const barY = this.anchorY - 8;
    const flexY = barY + this.barFlex;

    // Sturdy wooden top beam
    const woodGrad = ctx.createLinearGradient(0, barY - 22, 0, barY - 4);
    woodGrad.addColorStop(0, '#b45309');
    woodGrad.addColorStop(0.5, '#92400e');
    woodGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = woodGrad;
    ctx.fillRect(0, barY - 22, width, 16);

    // Side wooden brackets
    ctx.fillStyle = '#78350f';
    ctx.fillRect(8, barY - 6, 16, 18);
    ctx.fillRect(width - 24, barY - 6, 16, 18);

    // Golden metallic park bar that flexes slightly under weight
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

    // Golden anchor ring
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
