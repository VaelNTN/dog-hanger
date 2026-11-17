import { Device } from '@capacitor/device';
import { CollarColorId, DogAccessoryId } from '../data/dogs';

const SAVE_KEY = 'dog_hanger_save_v1';
const DEVICE_KEY = 'dog_hanger_device_id_v1';

export interface DogHangerHighscore {
  id: string;
  playerName: string;
  timeSec: number;
  breedId: number;
  collarColor: CollarColorId;
  accessory: DogAccessoryId;
  createdAt: string;
}

export interface DogHangerState {
  deviceId: string;
  apiBaseUrl: string;
  breedId: number;
  collarColor: CollarColorId;
  accessory: DogAccessoryId;
  playerName: string;
  soundEnabled: boolean;
  bestTimeSec: number;
  highscores: DogHangerHighscore[];
}

function generateFallbackDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `dh-${crypto.randomUUID()}`;
  }
  return `dh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function resolveDeviceId(): Promise<string> {
  const cached = localStorage.getItem(DEVICE_KEY);
  try {
    const info = await Device.getId();
    if (info?.identifier && info.identifier.trim().length >= 4) {
      const id = `phone-${info.identifier.trim()}`;
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    }
  } catch {
    // Web fallback
  }
  if (cached && cached.trim().length >= 4) return cached;
  const fresh = generateFallbackDeviceId();
  localStorage.setItem(DEVICE_KEY, fresh);
  return fresh;
}

export function loadDogHangerState(deviceId: string): DogHangerState {
  const defaultApi = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL || '')
    .trim()
    .replace(/\/+$/, '');

  const base: DogHangerState = {
    deviceId,
    apiBaseUrl: defaultApi,
    breedId: 2,
    collarColor: 'red',
    accessory: 'none',
    playerName: 'Hondenbaas',
    soundEnabled: true,
    bestTimeSec: 0,
    highscores: [],
  };

  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<DogHangerState>;
    return {
      deviceId,
      apiBaseUrl:
        typeof parsed.apiBaseUrl === 'string' && parsed.apiBaseUrl.trim()
          ? parsed.apiBaseUrl.trim().replace(/\/+$/, '')
          : defaultApi,
      breedId: typeof parsed.breedId === 'number' ? parsed.breedId : 2,
      collarColor: parsed.collarColor || 'red',
      accessory: parsed.accessory || 'none',
      playerName:
        typeof parsed.playerName === 'string' && parsed.playerName.trim()
          ? parsed.playerName.trim()
          : 'Hondenbaas',
      soundEnabled: parsed.soundEnabled !== false,
      bestTimeSec: Math.max(0, Number(parsed.bestTimeSec || 0)),
      highscores: Array.isArray(parsed.highscores) ? parsed.highscores : [],
    };
  } catch {
    return base;
  }
}

export function saveDogHangerState(state: DogHangerState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Ignore
  }
}

export function recordDogHangerScore(state: DogHangerState, timeSec: number): void {
  const rounded = Math.round(timeSec * 100) / 100;
  if (rounded <= 0) return;
  if (rounded > state.bestTimeSec) state.bestTimeSec = rounded;
  state.highscores.push({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    playerName: state.playerName.trim() || 'Hondenbaas',
    timeSec: rounded,
    breedId: state.breedId,
    collarColor: state.collarColor,
    accessory: state.accessory,
    createdAt: new Date().toISOString(),
  });
  state.highscores = state.highscores.sort((a, b) => b.timeSec - a.timeSec).slice(0, 50);
  saveDogHangerState(state);
}
