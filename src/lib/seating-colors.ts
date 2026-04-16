import type { GroupLabel } from './seating-types';

const DISTINCT_PALETTE: { bg: string; text: string }[] = [
  { bg: '#B71C1C', text: '#FFFFFF' },
  { bg: '#0D47A1', text: '#FFFFFF' },
  { bg: '#1B5E20', text: '#FFFFFF' },
  { bg: '#E65100', text: '#FFFFFF' },
  { bg: '#4A148C', text: '#FFFFFF' },
  { bg: '#006064', text: '#FFFFFF' },
  { bg: '#880E4F', text: '#FFFFFF' },
  { bg: '#F9A825', text: '#000000' },
  { bg: '#263238', text: '#FFFFFF' },
  { bg: '#827717', text: '#000000' },
  { bg: '#3E2723', text: '#FFFFFF' },
  { bg: '#004D40', text: '#FFFFFF' },
  { bg: '#311B92', text: '#FFFFFF' },
  { bg: '#BF360C', text: '#FFFFFF' },
  { bg: '#37474F', text: '#FFFFFF' },
  { bg: '#33691E', text: '#FFFFFF' },
  { bg: '#01579B', text: '#FFFFFF' },
  { bg: '#5D4037', text: '#FFFFFF' },
  { bg: '#AD1457', text: '#FFFFFF' },
  { bg: '#6A1B9A', text: '#FFFFFF' },
];

const examCodeColorCache = new Map<string, number>();
let nextColorIndex = 0;

export function resetExamCodeColors() {
  examCodeColorCache.clear();
  nextColorIndex = 0;
}

export function getExamCodeColor(examCode: string): { bg: string; text: string } {
  const key = examCode.trim().toUpperCase() || 'UNKNOWN';

  if (!examCodeColorCache.has(key)) {
    examCodeColorCache.set(key, nextColorIndex);
    nextColorIndex += 1;
  }

  const index = examCodeColorCache.get(key) ?? 0;
  return DISTINCT_PALETTE[index % DISTINCT_PALETTE.length];
}

export const GROUP_COLORS: Record<GroupLabel, { bg: string; text: string }> = {
  A: { bg: '#1565C0', text: '#FFFFFF' },
  B: { bg: '#C62828', text: '#FFFFFF' },
  C: { bg: '#2E7D32', text: '#FFFFFF' },
  D: { bg: '#F57F17', text: '#000000' },
};