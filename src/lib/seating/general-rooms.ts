import { StudentRecord, RoomAllocation } from '../seating-utils';

const GENERAL_ROWS = 5;
const GENERAL_MAIN_COLS = 3;
const GENERAL_SEATS_PER_COL = 2;

export function buildGeneralRooms(
  generalStudents: StudentRecord[],
  startingRoomNumber: number
): RoomAllocation[] {
  const sorted = [...generalStudents].sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));
  const totalCols = GENERAL_MAIN_COLS * GENERAL_SEATS_PER_COL; // 6
  const seatsPerGroupPerRoom = GENERAL_ROWS * GENERAL_MAIN_COLS; // 15 per group

  const half = Math.ceil(sorted.length / 2);
  const groupAStudents = sorted.slice(0, half);
  const groupBStudents = sorted.slice(half);

  const groupByDept = (list: StudentRecord[]) => {
    const map = new Map<string, StudentRecord[]>();
    for (const s of list) {
      const key = s.department.trim().toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.values());
  };

  const buildSlicesPerRoom = (deptBuckets: StudentRecord[][]): StudentRecord[][] => {
    const slices: StudentRecord[][] = [];
    for (const bucket of deptBuckets) {
      for (let i = 0; i < bucket.length; i += seatsPerGroupPerRoom) {
        slices.push(bucket.slice(i, i + seatsPerGroupPerRoom));
      }
    }
    return slices;
  };

  const aSlices = buildSlicesPerRoom(groupByDept(groupAStudents));
  const bSlices = buildSlicesPerRoom(groupByDept(groupBStudents));

  const roomsNeeded = Math.max(aSlices.length, bSlices.length);
  const rooms: RoomAllocation[] = [];

  for (let i = 0; i < roomsNeeded; i++) {
    const grid: (StudentRecord | null)[][] = Array.from(
      { length: GENERAL_ROWS },
      () => Array(totalCols).fill(null)
    );

    const aSlice = aSlices[i] ?? [];
    const bSlice = bSlices[i] ?? [];

    let aIdx = 0;
    let bIdx = 0;
    for (let r = 0; r < GENERAL_ROWS; r++) {
      for (let mc = 0; mc < GENERAL_MAIN_COLS; mc++) {
        const aCol = mc * GENERAL_SEATS_PER_COL;
        const bCol = aCol + 1;
        if (aIdx < aSlice.length) grid[r][aCol] = aSlice[aIdx++];
        if (bIdx < bSlice.length) grid[r][bCol] = bSlice[bIdx++];
      }
    }

    rooms.push({
      roomNumber: startingRoomNumber + i,
      students: [...aSlice, ...bSlice],
      grid,
      totalRows: GENERAL_ROWS,
      seatsPerRow: totalCols,
      isGeneral: true,
      mainColumns: GENERAL_MAIN_COLS,
      seatsPerColumn: GENERAL_SEATS_PER_COL,
    });
  }

  return rooms;
}
