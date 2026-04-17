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

// ============================================================
// GENERAL EXAM SEATING
// Layout: fixed 5 rows × 6 cols = 30 seats per room.
// Columns alternate A,B,A,B,A,B → 15 Group A + 15 Group B.
// Rules:
//   • Total rooms = ceil(generalTotal / 30).
//   • Departments sorted by count desc.
//   • LARGEST dept fills Group A, starting room 0, fresh room per new dept.
//   • All other depts queue through Group B.
//   • Each new dept STARTS in a fresh room (its primary group empty there).
//   • Leftovers (dept overflow) get parked, then placed at the START of the
//     NEXT dept's fresh room block in Group B — sitting next to the new dept.
// ============================================================

const GENERAL_ROWS = 5;
const GENERAL_MAIN_COLS = 3;
const GENERAL_SUB_COLS = 2;
const GENERAL_TOTAL_COLS = GENERAL_MAIN_COLS * GENERAL_SUB_COLS; // 6
const GENERAL_SEATS_PER_ROOM = GENERAL_ROWS * GENERAL_TOTAL_COLS; // 30
const GENERAL_GROUP_SIZE = 15; // A or B per room

function buildGeneralRoomSlots(): { A: SeatPosition[]; B: SeatPosition[] } {
  const A: SeatPosition[] = [];
  const B: SeatPosition[] = [];
  for (let r = 0; r < GENERAL_ROWS; r++) {
    for (let c = 0; c < GENERAL_TOTAL_COLS; c++) {
      const g: 'A' | 'B' = c % 2 === 0 ? 'A' : 'B';
      (g === 'A' ? A : B).push({ row: r, col: c, group: g });
    }
  }
  // Fill column-block by column-block, then row, then col — keeps students contiguous.
  const sorter = (a: SeatPosition, b: SeatPosition) => {
    const am = Math.floor(a.col / GENERAL_SUB_COLS);
    const bm = Math.floor(b.col / GENERAL_SUB_COLS);
    if (am !== bm) return am - bm;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  };
  A.sort(sorter);
  B.sort(sorter);
  return { A, B };
}

function buildGeneralRooms(
  generalStudents: StudentRecord[],
  startingRoomNumber: number
): RoomAllocation[] {
  if (generalStudents.length === 0) return [];

  const roomsNeeded = Math.ceil(generalStudents.length / GENERAL_SEATS_PER_ROOM);
  const rooms: RoomAllocation[] = [];
  const slotsPerRoom: { A: SeatPosition[]; B: SeatPosition[] }[] = [];
  const usedA: number[] = [];
  const usedB: number[] = [];

  for (let i = 0; i < roomsNeeded; i++) {
    const grid: (StudentRecord | null)[][] = Array.from(
      { length: GENERAL_ROWS },
      () => Array(GENERAL_TOTAL_COLS).fill(null)
    );
    rooms.push({
      roomNumber: startingRoomNumber + i,
      students: [],
      grid,
      totalRows: GENERAL_ROWS,
      seatsPerRow: GENERAL_TOTAL_COLS,
      mainColumns: GENERAL_MAIN_COLS,
      seatsPerColumn: GENERAL_SUB_COLS,
      isGeneral: true,
    });
    slotsPerRoom.push(buildGeneralRoomSlots());
    usedA.push(0);
    usedB.push(0);
  }

  // Group by department and sort by size desc, roll number asc within
  const deptMap = new Map<string, StudentRecord[]>();
  for (const s of generalStudents) {
    const key = s.department.trim().toUpperCase();
    if (!deptMap.has(key)) deptMap.set(key, []);
    deptMap.get(key)!.push(s);
  }
  const depts = Array.from(deptMap.entries())
    .map(([name, list]) => ({
      name,
      students: [...list].sort((a, b) => a.rollNumber.localeCompare(b.rollNumber)),
    }))
    .sort((a, b) => {
      if (b.students.length !== a.students.length) return b.students.length - a.students.length;
      return a.name.localeCompare(b.name);
    });

  if (depts.length === 0) return rooms;

  const placeAt = (
    roomIdx: number,
    group: 'A' | 'B',
    student: StudentRecord
  ): boolean => {
    if (roomIdx >= rooms.length) return false;
    const slots = slotsPerRoom[roomIdx][group];
    const used = group === 'A' ? usedA : usedB;
    if (used[roomIdx] >= slots.length) return false;
    const pos = slots[used[roomIdx]];
    rooms[roomIdx].grid[pos.row][pos.col] = student;
    rooms[roomIdx].students.push(student);
    used[roomIdx]++;
    return true;
  };

  // Largest dept → Group A from room 0
  let cursorA = 0;
  const largest = depts[0];
  let placedCount = 0;
  for (const student of largest.students) {
    // Move to next room when current A is full
    while (cursorA < rooms.length && usedA[cursorA] >= GENERAL_GROUP_SIZE) cursorA++;
    if (cursorA >= rooms.length) break;
    if (placeAt(cursorA, 'A', student)) placedCount++;
  }
  // Largest's leftovers (couldn't fit in A) → parked, will join B queue at front
  let parked: StudentRecord[] = largest.students.slice(placedCount);

  // Remaining depts → Group B, fresh-room-per-dept; parked leftovers ride in next dept's fresh block
  let cursorB = 0;
  for (let d = 1; d < depts.length; d++) {
    const dept = depts[d];
    // Fresh room: advance cursorB to a room where B is empty
    while (cursorB < rooms.length && usedB[cursorB] > 0) cursorB++;
    if (cursorB >= rooms.length) {
      // No fresh room left — park everything that didn't fit (won't be placed)
      parked = parked.concat(dept.students);
      continue;
    }

    // Combined queue: parked (from previous dept) first, then this dept's students
    const queue: StudentRecord[] = [...parked, ...dept.students];
    parked = [];

    let i = 0;
    let roomIdx = cursorB;
    while (i < queue.length && roomIdx < rooms.length) {
      while (roomIdx < rooms.length && usedB[roomIdx] >= GENERAL_GROUP_SIZE) roomIdx++;
      if (roomIdx >= rooms.length) break;
      if (placeAt(roomIdx, 'B', queue[i])) {
        i++;
      } else {
        roomIdx++;
      }
    }
    // Whatever didn't fit becomes new parked for the next dept iteration
    parked = queue.slice(i);
    cursorB = roomIdx;
  }

  return rooms;
}

export function allocateSeating(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
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

  // Helper: place a student at a room/group slot
  const placeAt = (
    roomIdx: number,
    group: 'A' | 'B',
    student: StudentRecord
  ): boolean => {
    const slots = roomSlots[roomIdx][group];
    const used = group === 'A' ? usedA : usedB;
    if (used[roomIdx] >= slots.length) return false;
    const pos = slots[used[roomIdx]];
    rooms[roomIdx].grid[pos.row][pos.col] = student;
    rooms[roomIdx].students.push(student);
    used[roomIdx]++;
    return true;
  };

  // Track next fresh room cursor for A and B queues
  let nextFreshA = 0;
  let nextFreshB = 0;

  // Alternating A/B fill with biggest codes.
  // Each code starts on a fresh room in its target group, but departments
  // within the same code are placed back-to-back with no artificial gap.
  // If a department ends with leftover seats in the current room/group,
  // the next department of the SAME exam code continues there.
  // If the preferred group runs out of fresh rooms mid-code, continue the
  // remaining students of that same code in the other group's fresh rooms.
  let useA = true;

  const fillDepartmentSeries = (
    group: 'A' | 'B',
    departments: { department: string; students: StudentRecord[] }[]
  ) => {
    const groupSize = group === 'A' ? groupASize : groupBSize;
    let cursor = group === 'A' ? nextFreshA : nextFreshB;
    let deptIndex = 0;
    let studentIndex = 0;

    while (deptIndex < departments.length && cursor < roomsNeeded) {
      let placed = 0;
      while (placed < groupSize && deptIndex < departments.length) {
        const currentDepartment = departments[deptIndex];
        const student = currentDepartment.students[studentIndex];
        if (!student) {
          deptIndex++;
          studentIndex = 0;
          continue;
        }

        if (!placeAt(cursor, group, student)) break;

        studentIndex++;
        placed++;

        if (studentIndex >= currentDepartment.students.length) {
          deptIndex++;
          studentIndex = 0;
        }
      }

      cursor++;
    }

    if (group === 'A') nextFreshA = cursor;
    else nextFreshB = cursor;

    return departments.slice(deptIndex).map((department, index) => ({
      department: department.department,
      students: index === 0 && studentIndex > 0
        ? department.students.slice(studentIndex)
        : [...department.students],
    }));
  };

  for (const code of sortedCodes) {
    const primary: 'A' | 'B' = useA ? 'A' : 'B';
    const secondary: 'A' | 'B' = useA ? 'B' : 'A';
    let remainingDepartments = code.departments.map((departmentBlock) => ({
      department: departmentBlock.department,
      students: [...departmentBlock.students],
    }));

    remainingDepartments = fillDepartmentSeries(primary, remainingDepartments);

    if (remainingDepartments.length > 0) {
      fillDepartmentSeries(secondary, remainingDepartments);
    }

    useA = !useA;

    if (nextFreshA >= roomsNeeded && nextFreshB >= roomsNeeded) break;
  }

  return {
    rooms: [...generalRooms, ...rooms],
    patternDecision: { pattern: 'CRISS_CROSS', message: null, violations: 0 },
  };
}
