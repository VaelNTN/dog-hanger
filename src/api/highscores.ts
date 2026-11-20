import { CollarColorId, DogAccessoryId } from '../data/dogs';

export interface GlobalDogHangerEntry {
  rank: number;
  deviceId: string;
  playerName: string;
  timeSec: number;
  breedId: number;
  collarColor: CollarColorId;
  accessory: DogAccessoryId;
  updatedAt: string;
}

export interface GlobalDogHangerResponse {
  ok: boolean;
  entries: GlobalDogHangerEntry[];
  player: GlobalDogHangerEntry | null;
}

function cleanUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export async function fetchGlobalDogHangerHighscores(
  baseUrl: string,
  deviceId: string,
  limit = 50
): Promise<GlobalDogHangerResponse> {
  const base = cleanUrl(baseUrl);
  if (!base) throw new Error('NO_BACKEND_URL');
  const res = await fetch(
    `${base}/api/dog-hanger/highscores?limit=${limit}&deviceId=${encodeURIComponent(deviceId)}`,
    { method: 'GET' }
  );
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return (await res.json()) as GlobalDogHangerResponse;
}

export async function submitGlobalDogHangerScore(
  baseUrl: string,
  payload: {
    deviceId: string;
    playerName: string;
    timeSec: number;
    breedId: number;
    collarColor: CollarColorId;
    accessory: DogAccessoryId;
  }
): Promise<void> {
  const base = cleanUrl(baseUrl);
  if (!base || payload.timeSec <= 0) return;

  try {
    await fetch(`${base}/api/dog-hanger/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: payload.deviceId,
        playerName: payload.playerName.trim() || 'Player',
        timeSec: payload.timeSec,
        breedId: payload.breedId,
        collarColor: payload.collarColor,
        accessory: payload.accessory,
      }),
    });
  } catch {
    // Offline fallback stays silent
  }
}
