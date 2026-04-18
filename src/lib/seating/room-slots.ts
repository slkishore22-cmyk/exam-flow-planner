import { getGroupLabel } from '../seating-utils';

export interface SeatPosition {
  row: number;
  col: number;
  group: 'A' | 'B' | 'C' | 'D';
}

export interface RoomSlots {
  A: SeatPosition[];
  B: SeatPosition[];
  C: SeatPosition[];
  D: SeatPosition[];
}

export function buildRoomSlots(rows: number, mainCols: number, subCols: number): RoomSlots {
  const slots: RoomSlots = { A: [], B: [], C: [], D: [] };
  const totalCols = mainCols * subCols;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < totalCols; c++) {
      const g = getGroupLabel(r, c, subCols);
      slots[g].push({ row: r, col: c, group: g });
    }
  }

  const sortByRoomBlock = (a: SeatPosition, b: SeatPosition) => {
    const aMainCol = Math.floor(a.col / subCols);
    const bMainCol = Math.floor(b.col / subCols);
    if (aMainCol !== bMainCol) return aMainCol - bMainCol;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  };

  slots.A.sort(sortByRoomBlock);
  slots.B.sort(sortByRoomBlock);
  slots.C.sort(sortByRoomBlock);
  slots.D.sort(sortByRoomBlock);

  return slots;
}

export function normalizeDepartmentKey(department: string): string {
  return department
    .toUpperCase()
    .replace(/[\s.]+/g, '')
    .trim();
}
