export interface DogBreed {
  id: number;
  name: string;
  fur: string;
  belly: string;
  ear: string;
  snout: string;
  earStyle: 'floppy' | 'pointy';
  spotted?: boolean;
}

export type CollarColorId = 'red' | 'blue' | 'gold' | 'green' | 'purple';
export type DogAccessoryId = 'none' | 'botje' | 'bandana' | 'bril' | 'kroon' | 'vlieger';

export const DOG_BREEDS: DogBreed[] = [
  { id: 0, name: 'Golden Puppy', fur: '#f59e0b', belly: '#fde68a', ear: '#b45309', snout: '#fef3c7', earStyle: 'floppy' },
  { id: 1, name: 'Siberian Husky', fur: '#64748b', belly: '#f8fafc', ear: '#334155', snout: '#f8fafc', earStyle: 'pointy' },
  { id: 2, name: 'Shiba Inu', fur: '#ea580c', belly: '#fff7ed', ear: '#9a3412', snout: '#ffedd5', earStyle: 'pointy' },
  { id: 3, name: 'Dalmatian', fur: '#f8fafc', belly: '#e2e8f0', ear: '#1e293b', snout: '#f1f5f9', earStyle: 'floppy', spotted: true },
  { id: 4, name: 'Choco Lab', fur: '#78350f', belly: '#b45309', ear: '#451a03', snout: '#92400e', earStyle: 'floppy' },
  { id: 5, name: 'Midnight Corgi', fur: '#1e293b', belly: '#fbbf24', ear: '#0f172a', snout: '#fde68a', earStyle: 'pointy' },
  { id: 6, name: 'Happy Beagle', fur: '#c26d27', belly: '#fffbeb', ear: '#5c2d0c', snout: '#fef3c7', earStyle: 'floppy' },
  { id: 7, name: 'Blue Merle Aussie', fur: '#94a3b8', belly: '#f1f5f9', ear: '#334155', snout: '#e2e8f0', earStyle: 'floppy', spotted: true },
  { id: 8, name: 'Fluffy Samoyed', fur: '#f1f5f9', belly: '#ffffff', ear: '#cbd5e1', snout: '#ffffff', earStyle: 'pointy' },
  { id: 9, name: 'Fawn Frenchie', fur: '#d6a46d', belly: '#fef3c7', ear: '#451a03', snout: '#57534e', earStyle: 'pointy' },
];

export const COLLAR_COLORS: { id: CollarColorId; label: string; hex: string }[] = [
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'blue', label: 'Blue', hex: '#38bdf8' },
  { id: 'gold', label: 'Gold', hex: '#facc15' },
  { id: 'green', label: 'Green', hex: '#22c55e' },
  { id: 'purple', label: 'Purple', hex: '#a855f7' },
];

export const DOG_ACCESSORIES: { id: DogAccessoryId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'botje', label: 'Bone' },
  { id: 'bandana', label: 'Bandana' },
  { id: 'bril', label: 'Sunglasses' },
  { id: 'kroon', label: 'Crown' },
  { id: 'vlieger', label: 'Aviators' },
];

export function getDogBreed(id: number): DogBreed {
  return DOG_BREEDS.find((b) => b.id === id) || DOG_BREEDS[0];
}

export function getCollarHex(id: CollarColorId): string {
  return COLLAR_COLORS.find((c) => c.id === id)?.hex || '#ef4444';
}
