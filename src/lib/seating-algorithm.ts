import { StudentRecord, RoomConfig, RoomAllocation, AllocationResult, getGroupLabel } from './seating-utils';

/**
 * Seating algorithm — Phase 1 (Groups A & B only):
 *
 * 1. Sort exam codes by student count, descending.
 * 2. Alternate assigning the biggest codes to Group A and Group B:
 *    - 1st biggest → Group A
 *    - 2nd biggest → Group B
 *    - 3rd biggest → Group A
 *    - 4th biggest → Group B
 *    - ...and so on.
 * 3. Each 3-digit-count code consumes consecutive FRESH rooms in its
 *    assigned group's queue. A code NEVER starts mid-room — it always
 *    begins on a room where its target group is empty.
 * 4. Inside a code, departments are ordered by size (largest first) and
 *    placed CONTIGUOUSLY. When one department ends, the next department of
 *    the SAME exam code may use the remaining seats in that same room/group.
 * 4. Groups C and D are intentionally left EMPTY in this phase.
 *    (Logic for filling middle/low-count codes will come later.)
 */

interface SeatPosition {
  row: number;
  col: number;
  group: 'A' | 'B' | 'C' | 'D';
}

interface RoomSlots {
  A: SeatPosition[];
  B: SeatPosition[];
  C: SeatPosition[];
  D: SeatPosition[];
}

function normalizeDepartmentKey(department: string): string {
  return department
    .toUpperCase()
    .replace(/[\s.]+/g, '')
    .trim();
}

function buildRoomSlots(rows: number, mainCols: number, subCols: number): RoomSlots {
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

const GENERAL_SEATS_PER_ROOM = 30;
const GENERAL_ROWS = 5;
const GENERAL_MAIN_COLS = 3;
const GENERAL_SEATS_PER_COL = 2;

function buildGeneralRooms(
  generalStudents: StudentRecord[],
  startingRoomNumber: number
): RoomAllocation[] {
  const sorted = [...generalStudents].sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));
  const totalCols = GENERAL_MAIN_COLS * GENERAL_SEATS_PER_COL; // 6
  const seatsPerGroupPerRoom = GENERAL_ROWS * GENERAL_MAIN_COLS; // 15 per group

  // Split students 50/50: first half → Group A, second half → Group B
  const half = Math.ceil(sorted.length / 2);
  const groupAStudents = sorted.slice(0, half);
  const groupBStudents = sorted.slice(half);

  // Group each half by department, preserving the order departments first appear
  const groupByDept = (list: StudentRecord[]) => {
    const map = new Map<string, StudentRecord[]>();
    for (const s of list) {
      const key = s.department.trim().toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.values());
  };

  // Build per-room slices for one group, where each department starts a fresh room.
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

    // Group A → even sub-columns (0, 2, 4); Group B → odd sub-columns (1, 3, 5)
    let aIdx = 0;
    let bIdx = 0;
    for (let r = 0; r < GENERAL_ROWS; r++) {
      for (let mc = 0; mc < GENERAL_MAIN_COLS; mc++) {
        const aCol = mc * GENERAL_SEATS_PER_COL; // 0, 2, 4
        const bCol = aCol + 1;                    // 1, 3, 5
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

export function allocateSeating(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  // Split off general-exam students — they get dedicated rooms first.
  const generalStudents = students.filter((s) => s.isGeneral);
  const normalStudents = students.filter((s) => !s.isGeneral);

  const generalRooms = buildGeneralRooms(generalStudents, 1);
  const normalStartingRoomNumber = generalRooms.length + 1;

  const { studentsPerRoom, mainColumns, seatsPerColumn } = config;
  const totalCols = mainColumns * seatsPerColumn;
  const rows = Math.ceil(studentsPerRoom / totalCols);
  const total = normalStudents.length;
  const roomsNeeded = total === 0 ? 0 : Math.max(1, Math.ceil(total / studentsPerRoom));

  // Build empty rooms
  const rooms: RoomAllocation[] = [];
  const roomSlots: RoomSlots[] = [];
  for (let i = 0; i < roomsNeeded; i++) {
    const grid: (StudentRecord | null)[][] = Array.from(
      { length: rows },
      () => Array(totalCols).fill(null)
    );
    rooms.push({
      roomNumber: normalStartingRoomNumber + i,
      students: [],
      grid,
      totalRows: rows,
      seatsPerRow: totalCols,
      mainColumns,
      seatsPerColumn,
    });
    roomSlots.push(buildRoomSlots(rows, mainColumns, seatsPerColumn));
  }

  if (roomsNeeded === 0) {
    return {
      rooms: generalRooms,
      patternDecision: { pattern: 'CRISS_CROSS', message: null, violations: 0 },
    };
  }

  const groupASize = roomSlots[0].A.length; // typically 15
  const groupBSize = roomSlots[0].B.length; // typically 15

  // Track how many seats have been used in each group of each room
  const usedA: number[] = Array(roomsNeeded).fill(0);
  const usedB: number[] = Array(roomsNeeded).fill(0);

  // Group + sort exam codes by count desc.
  // Phase 1 rule: only 3-digit count exam codes (100+) may be placed in Groups A/B.
  const byCode = new Map<string, StudentRecord[]>();
  for (const s of normalStudents) {
    if (!byCode.has(s.examCode)) byCode.set(s.examCode, []);
    byCode.get(s.examCode)!.push(s);
  }

  const sortedCodes = Array.from(byCode.entries())
    .map(([examCode, list]) => {
      const deptGroups = new Map<string, { department: string; students: StudentRecord[] }>();
      for (const student of list) {
        const key = normalizeDepartmentKey(student.department);
        if (!deptGroups.has(key)) {
          deptGroups.set(key, {
            department: student.department.trim().toUpperCase(),
            students: [],
          });
        }
        deptGroups.get(key)!.students.push(student);
      }

      const departments = Array.from(deptGroups.values())
        .sort((a, b) => {
          if (b.students.length !== a.students.length) return b.students.length - a.students.length;
          return a.department.localeCompare(b.department);
        })
        .map(({ department, students: deptStudents }) => ({
          department,
          students: [...deptStudents].sort((a, b) => a.rollNumber.localeCompare(b.rollNumber)),
        }));

      return {
        examCode,
        totalCount: list.length,
        departments,
      };
    })
    .sort((a, b) => b.totalCount - a.totalCount)
    .filter((code) => code.totalCount >= 100);

  // Diagnostic: log dept order per code so you can verify largest-first
  console.log('[ALLOC] Exam codes (size desc, >=100 only):');
  for (const c of sortedCodes) {
    const deptSummary = c.departments.map(d => `${d.department}(${d.students.length})`).join(', ');
    console.log(`[ALLOC]   ${c.examCode} total=${c.totalCount} → ${deptSummary}`);
  }

  // ============================================================
  // NEW APPROACH: Reserve room ranges per (code, group) up front.
  // Then fill each reservation linearly with departments in order.
  // No "find next fresh room" — strictly sequential, no skipping.
  // ============================================================

  type Reservation = {
    code: typeof sortedCodes[number];
    group: 'A' | 'B';
    startRoom: number;  // index into rooms[]
    roomCount: number;
    seats: number;      // total seats reserved (roomCount * groupSize)
  };

  const reservations: Reservation[] = [];
  let nextRoomA = 0;
  let nextRoomB = 0;
  let useA = true;

  for (const code of sortedCodes) {
    const primary: 'A' | 'B' = useA ? 'A' : 'B';
    const secondary: 'A' | 'B' = useA ? 'B' : 'A';
    useA = !useA;

    const primarySize = primary === 'A' ? groupASize : groupBSize;
    const secondarySize = secondary === 'A' ? groupASize : groupBSize;

    const totalStudents = code.totalCount;

    // How many rooms are still available in primary group?
    const primaryAvailable = roomsNeeded - (primary === 'A' ? nextRoomA : nextRoomB);
    const primaryCapacity = primaryAvailable * primarySize;

    let primaryStudents = Math.min(totalStudents, primaryCapacity);
    let primaryRooms = Math.ceil(primaryStudents / primarySize);
    let remaining = totalStudents - primaryStudents;

    if (primaryRooms > 0) {
      const startRoom = primary === 'A' ? nextRoomA : nextRoomB;
      reservations.push({
        code,
        group: primary,
        startRoom,
        roomCount: primaryRooms,
        seats: primaryRooms * primarySize,
      });
      if (primary === 'A') nextRoomA += primaryRooms;
      else nextRoomB += primaryRooms;
    }

    if (remaining > 0) {
      const secondaryAvailable = roomsNeeded - (secondary === 'A' ? nextRoomA : nextRoomB);
      const secondaryRooms = Math.min(
        secondaryAvailable,
        Math.ceil(remaining / secondarySize)
      );
      if (secondaryRooms > 0) {
        const startRoom = secondary === 'A' ? nextRoomA : nextRoomB;
        reservations.push({
          code,
          group: secondary,
          startRoom,
          roomCount: secondaryRooms,
          seats: secondaryRooms * secondarySize,
        });
        if (secondary === 'A') nextRoomA += secondaryRooms;
        else nextRoomB += secondaryRooms;
      }
    }
  }

  // ============================================================
  // Now fill each reservation linearly, department-by-department
  // in strict size order. The student queue for the code is a
  // flat list (largest dept first, then next largest, etc.).
  // ============================================================

  // Group reservations by code (preserving order)
  const resByCode = new Map<string, Reservation[]>();
  for (const r of reservations) {
    if (!resByCode.has(r.code.examCode)) resByCode.set(r.code.examCode, []);
    resByCode.get(r.code.examCode)!.push(r);
  }

  for (const code of sortedCodes) {
    const codeReservations = resByCode.get(code.examCode) ?? [];
    if (codeReservations.length === 0) continue;

    // Build flat queue: largest dept first, all its students, then next dept, etc.
    const queue: StudentRecord[] = [];
    for (const dept of code.departments) {
      for (const student of dept.students) queue.push(student);
    }

    let qIdx = 0;
    for (const res of codeReservations) {
      const slots = res.group === 'A' ? null : null; // placeholder
      const groupSize = res.group === 'A' ? groupASize : groupBSize;
      // Walk through reserved rooms one by one, fill seats linearly
      for (let rOffset = 0; rOffset < res.roomCount && qIdx < queue.length; rOffset++) {
        const roomIdx = res.startRoom + rOffset;
        const roomSlotList = roomSlots[roomIdx][res.group];
        const usedArr = res.group === 'A' ? usedA : usedB;
        // Fill all seats of this group in this room (or until queue empty)
        while (usedArr[roomIdx] < groupSize && qIdx < queue.length) {
          const pos = roomSlotList[usedArr[roomIdx]];
          rooms[roomIdx].grid[pos.row][pos.col] = queue[qIdx];
          rooms[roomIdx].students.push(queue[qIdx]);
          usedArr[roomIdx]++;
          qIdx++;
        }
      }
    }
  }

  return {
    rooms: [...generalRooms, ...rooms],
    patternDecision: { pattern: 'CRISS_CROSS', message: null, violations: 0 },
  };
}
