import {
  CollarColorId,
  DogAccessoryId,
  DogBreed,
  getCollarHex,
} from '../data/dogs';

export function drawCartoonDog(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  opts: {
    breed: DogBreed;
    collarColor: CollarColorId;
    accessory: DogAccessoryId;
    pose: 'portrait' | 'hang' | 'fall';
    animPhase?: number;
    effort?: number;
    swingVel?: number;
  }
): void {
  const {
    breed,
    collarColor,
    accessory,
    pose,
    animPhase = 0,
    effort = 0,
    swingVel = 0,
  } = opts;
  const collarHex = getCollarHex(collarColor);
  const s = size;
  const wagSpeed = pose === 'fall' ? 18 : 11 + effort * 7;
  const wagAmp = pose === 'fall' ? 0.55 : 0.36 + effort * 0.2;
  const wag = Math.sin(animPhase * wagSpeed) * wagAmp;

  ctx.save();
  ctx.translate(x, y);

  // Tail
  ctx.save();
  ctx.translate(-s * 0.45, s * 0.45);
  ctx.rotate(-0.6 + wag);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = s * 0.29;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-s * 0.4, -s * 0.35, -s * 0.25, -s * 0.72);
  ctx.stroke();
  ctx.strokeStyle = breed.fur;
  ctx.lineWidth = s * 0.21;
  ctx.stroke();
  ctx.restore();

  // Body
  ctx.fillStyle = breed.fur;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.5, s * 0.56, s * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();

  // Belly
  ctx.fillStyle = breed.belly;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.56, s * 0.34, s * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();

  if (breed.spotted) {
    ctx.fillStyle = '#1e293b';
    for (const [sx, sy, sr] of [
      [-0.25, 0.35, 0.1],
      [0.24, 0.62, 0.11],
      [-0.18, 0.78, 0.08],
    ]) {
      ctx.beginPath();
      ctx.arc(s * sx, s * sy, s * sr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Front paws
  const armY = pose === 'hang' ? -s * 0.94 : pose === 'fall' ? -s * 0.55 : s * 0.35;
  for (const px of [-s * 0.56, s * 0.56]) {
    ctx.fillStyle = breed.fur;
    ctx.beginPath();
    ctx.arc(px, armY, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
  }

  // Hind paws (slight kick when falling or high effort)
  const legKick = pose === 'fall' ? Math.sin(animPhase * 24) * s * 0.1 : effort * Math.sin(animPhase * 14) * s * 0.05;
  for (const side of [-1, 1]) {
    ctx.fillStyle = breed.fur;
    ctx.beginPath();
    ctx.ellipse(side * s * 0.28, s * 1.05 + side * legKick, s * 0.22, s * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
  }

  // Collar / Bandana
  ctx.fillStyle = collarHex;
  if (accessory === 'bandana') {
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, s * 0.06);
    ctx.lineTo(s * 0.42, s * 0.06);
    ctx.lineTo(0, s * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.roundRect(-s * 0.38, s * 0.02, s * 0.76, s * 0.15, s * 0.07);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(0, s * 0.2, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Ears with floppy/perk physics
  const earFlop = Math.sin(animPhase * 7) * (0.06 + effort * 0.12) + swingVel * 0.22;
  if (breed.earStyle === 'pointy') {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * s * 0.45, -s * 0.62);
      ctx.rotate(earFlop * 0.45);
      ctx.translate(-side * s * 0.45, s * 0.62);
      ctx.fillStyle = breed.ear;
      ctx.beginPath();
      ctx.moveTo(side * s * 0.25, -s * 0.62);
      ctx.lineTo(side * s * 0.68, -s * 1.08);
      ctx.lineTo(side * s * 0.66, -s * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
      ctx.restore();
    }
  } else {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * s * 0.56, -s * 0.36);
      ctx.rotate(side * (0.28 + effort * 0.18) + earFlop);
      ctx.fillStyle = breed.ear;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.18, s * 0.2, s * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
      ctx.restore();
    }
  }

  // Head
  ctx.fillStyle = breed.fur;
  ctx.beginPath();
  ctx.arc(0, -s * 0.36, s * 0.54, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();

  // Head sheen
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.15, -s * 0.64, s * 0.2, s * 0.1, -0.35, 0, Math.PI * 2);
  ctx.fill();

  if (breed.spotted) {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(-s * 0.24, -s * 0.48, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  // Snout
  ctx.fillStyle = breed.snout;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.22, s * 0.28, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Panting tongue (bobs faster as hang time / effort increases)
  const pantBob = pose === 'hang' ? Math.abs(Math.sin(animPhase * (5 + effort * 8))) * s * (0.04 + effort * 0.06) : 0;
  ctx.fillStyle = '#fb7185';
  ctx.beginPath();
  ctx.ellipse(s * 0.06, -s * 0.05 + pantBob * 0.5, s * 0.08, s * 0.11 + pantBob * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.28, s * 0.12, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(side * s * 0.2, -s * 0.45, pose === 'fall' ? s * 0.1 : s * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(side * s * 0.22, -s * 0.47, s * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }

  if (accessory === 'bril' || accessory === 'vlieger') {
    ctx.fillStyle = accessory === 'vlieger' ? '#38bdf8' : '#0f172a';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = Math.max(2, s * 0.05);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(side * s * 0.2 - s * 0.14, -s * 0.55, s * 0.28, s * 0.19, s * 0.06);
      ctx.fill();
      ctx.stroke();
    }
  } else if (accessory === 'kroon') {
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(-s * 0.24, -s * 0.84);
    ctx.lineTo(-s * 0.28, -s * 1.12);
    ctx.lineTo(-s * 0.08, -s * 0.96);
    ctx.lineTo(0, -s * 1.18);
    ctx.lineTo(s * 0.08, -s * 0.96);
    ctx.lineTo(s * 0.28, -s * 1.12);
    ctx.lineTo(s * 0.24, -s * 0.84);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (accessory === 'botje') {
    ctx.save();
    ctx.translate(s * 0.18, -s * 0.13);
    ctx.rotate(0.25);
    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.beginPath();
    ctx.roundRect(-s * 0.22, -s * 0.05, s * 0.44, s * 0.1, s * 0.04);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}
