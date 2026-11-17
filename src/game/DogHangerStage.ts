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
}

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

  private anchorX = 0;
  private anchorY = 0;
  private ropeLength = 175;
  private swingAngle = 0;
  private swingPhase = 0;

  private dogX = 0;
  private dogY = 0;
  private fallVx = 0;
  private fallVy = 0;
  private fallRot = 0;
  private fallSpin = 0;
  private dogSize = 33;

  private frisbees: Frisbee[] = [];
  private nextFrisbeeAt = 3;

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
    this.loop = this.loop.bind(this);
  }

  public setAppearance(opts: { breed: DogBreed; collarColor: CollarColorId; accessory: DogAccessoryId }): void {
    this.breed = opts.breed;
    this.collarColor = opts.collarColor;
    this.accessory = opts.accessory;
  }

  public resetRound(): void {
    this.phase = 'ready';
    this.holdElapsed = 0;
    this.swingAngle = 0;
    this.swingPhase = 0;
    this.fallVx = 0;
    this.fallVy = 0;
    this.fallRot = 0;
    this.activePointerId = null;
    this.frisbees = [];
    this.nextFrisbeeAt = 3;
    this.updateDogPos();
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
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
    this.anchorY = Math.max(92, this.height * 0.16);
    this.ropeLength = Math.min(210, Math.max(130, this.height * 0.28));
    if (this.phase === 'ready' || this.phase === 'holding') this.updateDogPos();
  }

  private updateDogPos(): void {
    this.dogX = this.anchorX + Math.sin(this.swingAngle) * this.ropeLength;
    this.dogY = this.anchorY + Math.cos(this.swingAngle) * this.ropeLength;
  }

  private onPointerDown(ev: PointerEvent): void {
    ev.preventDefault();
    if (this.phase !== 'ready') return;
    const rect = this.canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const dist = Math.hypot(px - this.dogX, py - this.dogY);
    if (dist <= 95) {
      this.activePointerId = ev.pointerId;
      this.phase = 'holding';
      this.holdStartMs = performance.now();
      this.holdElapsed = 0;
      this.callbacks.onStartHold();
    } else {
      this.callbacks.onMissTap();
    }
  }

  private onPointerUp(ev: PointerEvent): void {
    if (this.phase !== 'holding') return;
    if (this.activePointerId !== null && ev.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.phase = 'falling';
    this.fallVx = Math.cos(this.swingAngle) * (Math.sin(this.swingPhase * 2) * 90);
    this.fallVy = 40;
    this.fallSpin = (Math.random() > 0.5 ? 1 : -1) * 5;
    this.callbacks.onRelease(this.holdElapsed);
  }

  private loop(now: number): void {
    if (!this.active) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.animClock += dt;

    if (this.phase === 'holding') {
      this.holdElapsed = (now - this.holdStartMs) / 1000;
      this.callbacks.onTick(this.holdElapsed);
      const difficulty = 1 + Math.min(2.2, this.holdElapsed / 18);
      this.swingPhase += dt * (1.8 + difficulty * 0.45);
      const maxAmp = Math.min(0.42, 0.14 + this.holdElapsed * 0.008);
      this.swingAngle = Math.sin(this.swingPhase) * maxAmp;
      this.updateDogPos();

      if (this.holdElapsed >= this.nextFrisbeeAt) {
        this.nextFrisbeeAt += Math.max(1.8, 4 - this.holdElapsed * 0.04);
        const fromLeft = Math.random() > 0.5;
        this.frisbees.push({
          x: fromLeft ? -30 : this.width + 30,
          y: this.anchorY + this.ropeLength * (0.4 + Math.random() * 0.5),
          vx: (fromLeft ? 1 : -1) * (170 + Math.random() * 110),
          rot: 0,
        });
      }
    } else if (this.phase === 'ready') {
      this.swingAngle = Math.sin(this.animClock * 1.6) * 0.06;
      this.updateDogPos();
    } else if (this.phase === 'falling') {
      this.fallVy += 920 * dt;
      this.dogX += this.fallVx * dt;
      this.dogY += this.fallVy * dt;
      this.fallRot += this.fallSpin * dt;
      if (this.dogY > this.height - 46) {
        this.phase = 'finished';
      }
    }

    this.frisbees = this.frisbees.filter((f) => {
      f.x += f.vx * dt;
      f.rot += dt * 8;
      return f.x > -60 && f.x < this.width + 60;
    });

    this.draw();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private draw(): void {
    const { ctx, width, height } = this;
    if (width <= 0 || height <= 0) return;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.65, '#431407');
    grad.addColorStop(1, '#0284c7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Water / Splash pool at bottom
    const waterY = height - 64;
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(0, waterY, width, 64);
    ctx.fillStyle = '#7dd3fc';
    for (let x = 0; x < width; x += 48) {
      ctx.beginPath();
      ctx.ellipse(x + 24, waterY + Math.sin(this.animClock * 3 + x) * 3, 28, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Top beam & bone rope anchor
    ctx.fillStyle = '#78350f';
    ctx.fillRect(0, this.anchorY - 14, width, 14);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(this.anchorX, this.anchorY, 9, 0, Math.PI * 2);
    ctx.fill();

    // Chew rope
    const ropeEndX = this.phase === 'ready' || this.phase === 'holding' ? this.dogX : this.anchorX;
    const ropeEndY = this.phase === 'ready' || this.phase === 'holding' ? this.dogY - 26 : this.anchorY + this.ropeLength * 0.7;
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.anchorX, this.anchorY);
    ctx.lineTo(ropeEndX, ropeEndY);
    ctx.stroke();

    // Chew bone handle
    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(ropeEndX - 18, ropeEndY - 5, 36, 10, 4);
    ctx.fill();
    ctx.stroke();

    // Frisbees
    for (const f of this.frisbees) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffe4e6';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Dog
    ctx.save();
    ctx.translate(this.dogX, this.dogY);
    ctx.rotate(this.phase === 'falling' || this.phase === 'finished' ? this.fallRot : -this.swingAngle * 0.6);
    drawCartoonDog(ctx, 0, 0, this.dogSize, {
      breed: this.breed,
      collarColor: this.collarColor,
      accessory: this.accessory,
      pose: this.phase === 'holding' || this.phase === 'ready' ? 'hang' : 'fall',
      animPhase: this.animClock,
    });
    ctx.restore();

    if (this.phase === 'ready') {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.dogX, this.dogY, 54 + Math.sin(this.animClock * 5) * 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}
