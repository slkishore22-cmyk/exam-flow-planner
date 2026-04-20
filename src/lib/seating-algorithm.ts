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

  // Row-major fill: walk left-to-right across the entire row, then move to
  // the next row. This makes the visual order (reading top-to-bottom,
  // left-to-right) match the placement order within each group.
  const sortByRowMajor = (a: SeatPosition, b: SeatPosition) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  };

  slots.A.sort(sortByRowMajor);
  slots.B.sort(sortByRowMajor);
  slots.C.sort(sortByRowMajor);
  slots.D.sort(sortByRowMajor);

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
          students: [...deptStudents].sort((a, b) => {
            // Numeric-aware sort: extract trailing digits so BBA99 < BBA100
            const aNum = parseInt(a.rollNumber.replace(/\D/g, ''), 10);
            const bNum = parseInt(b.rollNumber.replace(/\D/g, ''), 10);
            if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
            return a.rollNumber.localeCompare(b.rollNumber);
          }),
        }));

      return {
        examCode,
        totalCount: list.length,
        departments,
      };
    })
    .sort((a, b) => b.totalCount - a.totalCount)
    .filter((code) => code.totalCount >= 100);

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

    // Each group operates independently. A code stays in its primary group
    // as long as it needs rooms — we'll grow the room array if necessary.
    // Only spill to secondary if primary literally cannot fit (it always can
    // since we can grow), so in practice spill never happens here.
    let primaryStudents = totalStudents;
    let primaryRooms = Math.ceil(primaryStudents / primarySize);
    let remaining = 0;

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

  // Grow rooms[]/roomSlots[]/usedA/usedB if any reservation extends past
  // the initially calculated roomsNeeded. We prioritize correct grouping
  // over minimizing room count — empty rooms in between are acceptable.
  let maxRoomIdx = -1;
  for (const r of reservations) {
    maxRoomIdx = Math.max(maxRoomIdx, r.startRoom + r.roomCount - 1);
  }
  while (rooms.length <= maxRoomIdx) {
    const i = rooms.length;
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
    usedA.push(0);
    usedB.push(0);
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

    // ============================================================
    // BULLETPROOF QUEUE BUILD:
    // Re-sort departments here (defensive) by size DESC, then build
    // a STRICTLY ORDERED flat queue: ALL students of dept[0] first,
    // then ALL students of dept[1], etc. NEVER interleaved.
    // ============================================================
    const deptsSorted = [...code.departments].sort((a, b) => {
      if (b.students.length !== a.students.length) return b.students.length - a.students.length;
      return a.department.localeCompare(b.department);
    });

    const queue: StudentRecord[] = [];
    for (const dept of deptsSorted) {
      for (const student of dept.students) queue.push(student);
    }




    let qIdx = 0;
    for (const res of codeReservations) {
      const groupSize = res.group === 'A' ? groupASize : groupBSize;
      for (let rOffset = 0; rOffset < res.roomCount && qIdx < queue.length; rOffset++) {
        const roomIdx = res.startRoom + rOffset;
        const roomSlotList = roomSlots[roomIdx][res.group];
        const usedArr = res.group === 'A' ? usedA : usedB;
        while (usedArr[roomIdx] < groupSize && qIdx < queue.length) {
          const pos = roomSlotList[usedArr[roomIdx]];
          rooms[roomIdx].grid[pos.row][pos.col] = queue[qIdx];
          rooms[roomIdx].students.push(queue[qIdx]);
          usedArr[roomIdx]++;
          qIdx++;
        }
      }
    }

    // ============================================================
    // BACKFILL: If any reserved room/group for this code has empty
    // seats (due to Math.ceil rounding leaving slack), pull students
    // from this code's LAST occupied reservation room backward to
    // fill those gaps. Keeps everything within the same exam code.
    // ============================================================
    type Slot = { roomIdx: number; group: 'A' | 'B'; slotIdx: number };
    const emptySlots: Slot[] = [];
    const filledSlots: Slot[] = [];
    for (const res of codeReservations) {
      const groupSize = res.group === 'A' ? groupASize : groupBSize;
      const usedArr = res.group === 'A' ? usedA : usedB;
      for (let rOffset = 0; rOffset < res.roomCount; rOffset++) {
        const roomIdx = res.startRoom + rOffset;
        const used = usedArr[roomIdx];
        for (let s = 0; s < used; s++) {
          filledSlots.push({ roomIdx, group: res.group, slotIdx: s });
        }
        for (let s = used; s < groupSize; s++) {
          emptySlots.push({ roomIdx, group: res.group, slotIdx: s });
        }
      }
    }

    // Move from the END of filledSlots into the START of emptySlots,
    // but only if the empty slot comes BEFORE the filled slot in order.
    const slotOrder = (s: Slot) => s.roomIdx * 1000 + s.slotIdx + (s.group === 'A' ? 0 : 0.5);
    emptySlots.sort((a, b) => slotOrder(a) - slotOrder(b));
    filledSlots.sort((a, b) => slotOrder(a) - slotOrder(b));

    let eIdx = 0;
    let fIdx = filledSlots.length - 1;
    while (eIdx < emptySlots.length && fIdx >= 0) {
      const empty = emptySlots[eIdx];
      const filled = filledSlots[fIdx];
      if (slotOrder(empty) >= slotOrder(filled)) break;

      const fromRoom = rooms[filled.roomIdx];
      const fromSlot = roomSlots[filled.roomIdx][filled.group][filled.slotIdx];
      const student = fromRoom.grid[fromSlot.row][fromSlot.col];
      if (student) {
        const toRoom = rooms[empty.roomIdx];
        const toSlot = roomSlots[empty.roomIdx][empty.group][empty.slotIdx];
        toRoom.grid[toSlot.row][toSlot.col] = student;
        fromRoom.grid[fromSlot.row][fromSlot.col] = null;
        const usedArrFrom = filled.group === 'A' ? usedA : usedB;
        const usedArrTo = empty.group === 'A' ? usedA : usedB;
        usedArrFrom[filled.roomIdx]--;
        usedArrTo[empty.roomIdx]++;
      }
      eIdx++;
      fIdx--;
    }

    // Resync students[] for any rooms touched by this code
    const touched = new Set<number>();
    for (const res of codeReservations) {
      for (let r = 0; r < res.roomCount; r++) touched.add(res.startRoom + r);
    }
    for (const ri of touched) {
      const room = rooms[ri];
      const fresh: StudentRecord[] = [];
      for (const row of room.grid) for (const cell of row) if (cell) fresh.push(cell);
      room.students = fresh;
    }
  }

  // ============================================================
  // POST-PROCESS: Force "minor department" students within an exam
  // code (depts that are NOT the largest within their code) to the
  // absolute last seats of the final room. We swap their current
  // placements with whoever currently occupies the last visible
  // seats of the last room (bottom-right, walking right-to-left,
  // bottom-to-top, skipping empty cells).
  // ============================================================
  const allRooms = [...generalRooms, ...rooms];
  if (allRooms.length > 0) {
    const minorStudents: { roomIdx: number; row: number; col: number }[] = [];
    for (const code of sortedCodes) {
      if (code.departments.length < 2) continue;
      const minorKeys = new Set(
        code.departments.slice(1).map((d) => normalizeDepartmentKey(d.department))
      );
      for (let ri = 0; ri < allRooms.length; ri++) {
        const room = allRooms[ri];
        for (let r = 0; r < room.grid.length; r++) {
          for (let c = 0; c < room.grid[r].length; c++) {
            const s = room.grid[r][c];
            if (!s) continue;
            if (s.examCode !== code.examCode) continue;
            if (!minorKeys.has(normalizeDepartmentKey(s.department))) continue;
            minorStudents.push({ roomIdx: ri, row: r, col: c });
          }
        }
      }
    }

    if (minorStudents.length > 0) {
      const lastRoomIdx = allRooms.length - 1;
      const lastRoom = allRooms[lastRoomIdx];
      const lastSeats: { row: number; col: number }[] = [];
      for (let r = lastRoom.grid.length - 1; r >= 0; r--) {
        for (let c = lastRoom.grid[r].length - 1; c >= 0; c--) {
          if (lastRoom.grid[r][c] !== null) {
            lastSeats.push({ row: r, col: c });
          }
        }
      }

      const swapCount = Math.min(minorStudents.length, lastSeats.length);
      for (let i = 0; i < swapCount; i++) {
        const minor = minorStudents[i];
        const target = lastSeats[i];
        if (
          minor.roomIdx === lastRoomIdx &&
          minor.row === target.row &&
          minor.col === target.col
        ) {
          continue;
        }
        const minorCell = allRooms[minor.roomIdx].grid[minor.row][minor.col];
        const targetCell = lastRoom.grid[target.row][target.col];
        allRooms[minor.roomIdx].grid[minor.row][minor.col] = targetCell;
        lastRoom.grid[target.row][target.col] = minorCell;
      }

      const affectedRoomIdxs = new Set<number>([
        lastRoomIdx,
        ...minorStudents.map((m) => m.roomIdx),
      ]);
      for (const ri of affectedRoomIdxs) {
        const room = allRooms[ri];
        const newStudents: StudentRecord[] = [];
        for (const row of room.grid) {
          for (const cell of row) {
            if (cell) newStudents.push(cell);
          }
        }
        room.students = newStudents;
      }
    }
  }

  // ============================================================
  // ===== SLACK-FILLER PHASE (A/B leftover seats) =====
  // Fills empty A/B seats in already-built rooms using leftover
  // small codes (codes NOT placed by the big-code phase above).
  // Walk order: room 1 → N, Group A then Group B per room.
  // Strategy per (room, group) with empty seats:
  //   1. Exact single-code match (count == empty)
  //   2. Largest single-code under-fill, then loop
  //   3. Two-code combination (exact, else largest pair ≤ slack)
  //   4. Three-code combination (rare fallback)
  // Departments inside a code stay contiguous (largest dept first).
  // Does NOT touch any seat already filled by the big-code phase.
  // ============================================================
  {
    // Collect leftover codes = all normal-student exam codes NOT yet placed.
    const placedRolls = new Set<string>();
    for (const room of rooms) {
      for (const s of room.students) placedRolls.add(s.rollNumber);
    }

    type LeftoverCode = {
      examCode: string;
      students: StudentRecord[]; // ordered: largest dept first, contiguous
      count: number;
    };

    const leftoverByCode = new Map<string, StudentRecord[]>();
    for (const s of normalStudents) {
      if (placedRolls.has(s.rollNumber)) continue;
      if (!leftoverByCode.has(s.examCode)) leftoverByCode.set(s.examCode, []);
      leftoverByCode.get(s.examCode)!.push(s);
    }

    const leftovers: LeftoverCode[] = Array.from(leftoverByCode.entries()).map(
      ([examCode, list]) => {
        // Group by dept, sort depts by size desc, then flatten with roll sort
        const deptMap = new Map<string, StudentRecord[]>();
        for (const s of list) {
          const k = normalizeDepartmentKey(s.department);
          if (!deptMap.has(k)) deptMap.set(k, []);
          deptMap.get(k)!.push(s);
        }
        const orderedDepts = Array.from(deptMap.values()).sort(
          (a, b) => b.length - a.length
        );
        const ordered: StudentRecord[] = [];
        for (const bucket of orderedDepts) {
          const sorted = [...bucket].sort((a, b) => {
            const aN = parseInt(a.rollNumber.replace(/\D/g, ''), 10);
            const bN = parseInt(b.rollNumber.replace(/\D/g, ''), 10);
            if (!isNaN(aN) && !isNaN(bN) && aN !== bN) return aN - bN;
            return a.rollNumber.localeCompare(b.rollNumber);
          });
          for (const s of sorted) ordered.push(s);
        }
        return { examCode, students: ordered, count: ordered.length };
      }
    );

    // Pool of available leftover codes (mutated as we consume)
    const pool: LeftoverCode[] = [...leftovers];

    const removeFromPool = (codes: LeftoverCode[]) => {
      for (const c of codes) {
        const idx = pool.indexOf(c);
        if (idx >= 0) pool.splice(idx, 1);
      }
    };

    // ELIGIBILITY RULE (user-defined):
    // A leftover code may be used as a filler ONLY if:
    //   (a) code.count <= 15  (fits inside a single A/B group slot), OR
    //   (b) code.count == empty  (exactly completes the room's empty seats)
    // No partial splits. No mid-room placement of oversize codes.

    // Try to find a combination of pool entries summing exactly to `target`.
    // Each member of the combo must individually be eligible (count <= 15 or == target).
    const findExactCombo = (target: number, maxSize = 3): LeftoverCode[] | null => {
      const eligible = pool.filter((c) => c.count <= 15 || c.count === target);
      // size 1
      for (const c of eligible) if (c.count === target) return [c];
      if (maxSize < 2) return null;
      // size 2
      const sorted = [...eligible].sort((a, b) => b.count - a.count);
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          if (sorted[i].count + sorted[j].count === target) {
            return [sorted[i], sorted[j]];
          }
        }
      }
      if (maxSize < 3) return null;
      // size 3
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          for (let k = j + 1; k < sorted.length; k++) {
            if (sorted[i].count + sorted[j].count + sorted[k].count === target) {
              return [sorted[i], sorted[j], sorted[k]];
            }
          }
        }
      }
      return null;
    };

    // Largest single ELIGIBLE code (count <= 15) with count <= target.
    // Oversize codes (>15) are never used as under-fill — they'd require splitting.
    const findLargestUnder = (target: number): LeftoverCode | null => {
      let best: LeftoverCode | null = null;
      for (const c of pool) {
        if (c.count > 15) continue;
        if (c.count <= target && (!best || c.count > best.count)) best = c;
      }
      return best;
    };

    // Largest pair sum <= target — both members must have count <= 15.
    const findLargestPairUnder = (target: number): LeftoverCode[] | null => {
      const eligible = pool.filter((c) => c.count <= 15);
      const sorted = [...eligible].sort((a, b) => b.count - a.count);
      let best: LeftoverCode[] | null = null;
      let bestSum = 0;
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const sum = sorted[i].count + sorted[j].count;
          if (sum <= target && sum > bestSum) {
            bestSum = sum;
            best = [sorted[i], sorted[j]];
          }
        }
      }
      return best;
    };

    // Place a list of codes (in order) into a (room, group)'s empty slots.
    const placeIntoSlot = (
      roomIdx: number,
      group: 'A' | 'B',
      codes: LeftoverCode[]
    ) => {
      const slotList = roomSlots[roomIdx][group];
      const usedArr = group === 'A' ? usedA : usedB;
      const groupSize = slotList.length;
      const queue: StudentRecord[] = [];
      for (const c of codes) for (const s of c.students) queue.push(s);
      let qIdx = 0;
      while (usedArr[roomIdx] < groupSize && qIdx < queue.length) {
        const pos = slotList[usedArr[roomIdx]];
        rooms[roomIdx].grid[pos.row][pos.col] = queue[qIdx];
        rooms[roomIdx].students.push(queue[qIdx]);
        usedArr[roomIdx]++;
        qIdx++;
      }
      removeFromPool(codes);
    };

    // ----------------------------------------------------------------
    // PHASE 0 — OVERSIZE SPILLOVER:
    // For codes with count > 15, slice them into chunks of up to
    // `groupSize` (typically 15) and pour them into COMPLETELY EMPTY
    // A or B groups across consecutive rooms. The code stays contiguous
    // across rooms; the final chunk may be smaller than the group size.
    // Walk order: room 1..N, Group A then B per room.
    // Largest oversize codes are placed first.
    // ----------------------------------------------------------------
    {
      const placeStudentsIntoEmptyGroup = (
        roomIdx: number,
        group: 'A' | 'B',
        students: StudentRecord[]
      ) => {
        const slotList = roomSlots[roomIdx][group];
        const usedArr = group === 'A' ? usedA : usedB;
        let qIdx = 0;
        while (usedArr[roomIdx] < slotList.length && qIdx < students.length) {
          const pos = slotList[usedArr[roomIdx]];
          rooms[roomIdx].grid[pos.row][pos.col] = students[qIdx];
          rooms[roomIdx].students.push(students[qIdx]);
          usedArr[roomIdx]++;
          qIdx++;
        }
      };

      // Repeatedly pick the largest oversize code in the pool and pour it
      // into successive empty groups until exhausted.
      let guard = 0;
      while (guard++ < 200) {
        const oversize = pool
          .filter((c) => c.count > 15)
          .sort((a, b) => b.count - a.count)[0];
        if (!oversize) break;

        let remaining = [...oversize.students];
        // Walk rooms/groups looking for completely empty A or B groups
        outer: for (let ri = 0; ri < rooms.length && remaining.length > 0; ri++) {
          for (const group of ['A', 'B'] as const) {
            const slotList = roomSlots[ri][group];
            const usedArr = group === 'A' ? usedA : usedB;
            if (usedArr[ri] !== 0) continue; // only completely empty groups
            const chunkSize = Math.min(slotList.length, remaining.length);
            const chunk = remaining.slice(0, chunkSize);
            remaining = remaining.slice(chunkSize);
            placeStudentsIntoEmptyGroup(ri, group, chunk);
            if (remaining.length === 0) break outer;
          }
        }

        // Remove this oversize code from the pool regardless of whether
        // we placed all of it (any unplaced students will fall through
        // to the C/D phase later). We must remove to avoid an infinite loop.
        const idx = pool.indexOf(oversize);
        if (idx >= 0) pool.splice(idx, 1);

        // If some students remain unplaced (no more empty A/B groups),
        // put them back into the pool as a smaller code so the C/D phase
        // (or final safety pass) can place them. CRITICAL: never drop
        // students — even oversize remainders must be re-pooled.
        if (remaining.length > 0) {
          pool.push({
            examCode: oversize.examCode,
            students: remaining,
            count: remaining.length,
          });
          // Stop trying to place THIS code further — no empty A/B groups left.
          break;
        }
      }
    }

    // ----------------------------------------------------------------
    // PHASE 1 — SMALL-GAP FILLER (existing logic):
    // Fill remaining tail-end gaps using small codes (count <= 15) only.
    // ----------------------------------------------------------------
    // Walk rooms in order, group A then B
    for (let ri = 0; ri < rooms.length; ri++) {
      for (const group of ['A', 'B'] as const) {
        const slotList = roomSlots[ri][group];
        const usedArr = group === 'A' ? usedA : usedB;
        const groupSize = slotList.length;

        // Loop until this group is full or we can't place anything more
        let safetyGuard = 0;
        while (usedArr[ri] < groupSize && safetyGuard++ < 50) {
          const empty = groupSize - usedArr[ri];
          if (pool.length === 0) break;

          // 1. Exact single
          const singleExact = pool.find((c) => c.count === empty);
          if (singleExact) {
            placeIntoSlot(ri, group, [singleExact]);
            continue;
          }

          // 2. Try exact 2-code combo
          const combo2 = findExactCombo(empty, 2);
          if (combo2) {
            placeIntoSlot(ri, group, combo2);
            continue;
          }

          // 3. Try exact 3-code combo
          const combo3 = findExactCombo(empty, 3);
          if (combo3) {
            placeIntoSlot(ri, group, combo3);
            continue;
          }

          // 4. Largest single under-fill
          const largestSingle = findLargestUnder(empty);
          if (largestSingle) {
            placeIntoSlot(ri, group, [largestSingle]);
            continue;
          }

          // 5. Largest pair under-fill
          const largestPair = findLargestPairUnder(empty);
          if (largestPair) {
            placeIntoSlot(ri, group, largestPair);
            continue;
          }

          // No splitting allowed: oversize codes (>15) can only be used
          // when their count exactly equals `empty` (handled in step 1).
          // If we reach here, this group's remaining seats stay empty.

          // Truly nothing left — break
          break;
        }
      }
    }

    // ================================================================
    // PHASE 2 — C/D MIDDLE-ORDER FILL
    // ----------------------------------------------------------------
    // After A/B is fully filled, fill the middle Groups C (6 seats) and
    // D (9 seats) of each room using whatever exam codes still remain
    // in the pool.
    //
    // Rules (per user spec):
    //   * Take the largest remaining code first.
    //   * Pour it into successive rooms, room-by-room. In each room,
    //     pick whichever of (C, D) is still completely empty:
    //       - if BOTH empty: prefer C first (6), then next room D (9),
    //         alternating so each pair of rooms = 15 students.
    //       - if only D is empty (C already used by an earlier code in
    //         that room): use D (9) in this room, then C (6) in the next.
    //   * Each placement uses the FULL group capacity (6 or 9). The
    //     code stays contiguous across rooms.
    //   * Final TAIL (count < 15): find the next room whose still-empty
    //     C or D group exactly matches the remaining count (6 or 9), or
    //     any single empty C/D group large enough to hold it. Tail size
    //     of e.g. 7 → place into an empty D (9), leaving 2 seats blank.
    //   * Departments inside a code stay contiguous (largest dept first),
    //     same ordering rule as A/B phase.
    // ================================================================
    {
      const sortedPool = () =>
        [...pool].sort((a, b) => b.count - a.count);

      const placeIntoCDGroup = (
        roomIdx: number,
        group: 'C' | 'D',
        students: StudentRecord[]
      ): number => {
        // Returns the number of students placed (capped at group size).
        const slotList = roomSlots[roomIdx][group];
        const groupSize = slotList.length;
        // Count current usage of this group
        let used = 0;
        for (const s of slotList) {
          if (rooms[roomIdx].grid[s.row][s.col] !== null) used++;
        }
        const capacity = groupSize - used;
        const toPlace = Math.min(capacity, students.length);
        for (let i = 0; i < toPlace; i++) {
          const pos = slotList[used + i];
          rooms[roomIdx].grid[pos.row][pos.col] = students[i];
          rooms[roomIdx].students.push(students[i]);
        }
        return toPlace;
      };

      const isGroupEmpty = (roomIdx: number, group: 'C' | 'D'): boolean => {
        const slotList = roomSlots[roomIdx][group];
        for (const s of slotList) {
          if (rooms[roomIdx].grid[s.row][s.col] !== null) return false;
        }
        return true;
      };

      const groupSizeOf = (roomIdx: number, group: 'C' | 'D'): number =>
        roomSlots[roomIdx][group].length;

      let mainGuard = 0;
      while (mainGuard++ < 500) {
        const queueCodes = sortedPool();
        if (queueCodes.length === 0) break;
        const code = queueCodes[0];

        // Build flat student queue (largest dept already first per leftover build).
        let remaining = [...code.students];

        // Pour through successive rooms.
        // Track which group we used "last" in the alternation so the next
        // room takes the opposite group when both are empty.
        let preferNext: 'C' | 'D' = 'C';
        let placedAny = false;

        for (let ri = 0; ri < rooms.length && remaining.length > 0; ri++) {
          const cEmpty = isGroupEmpty(ri, 'C');
          const dEmpty = isGroupEmpty(ri, 'D');
          if (!cEmpty && !dEmpty) continue;

          // Pick which group to use in THIS room
          let useGroup: 'C' | 'D';
          if (cEmpty && dEmpty) {
            useGroup = preferNext;
          } else if (cEmpty) {
            useGroup = 'C';
          } else {
            useGroup = 'D';
          }

          const capacity = groupSizeOf(ri, useGroup);

          // TAIL handling: if remaining < capacity, only place if remaining
          // exactly fits OR this is the largest available slot we can find
          // for it. Strategy: if remaining < smallest C/D size (6), still
          // place into smallest available group ≥ remaining further down.
          if (remaining.length >= capacity) {
            const chunk = remaining.slice(0, capacity);
            placeIntoCDGroup(ri, useGroup, chunk);
            remaining = remaining.slice(capacity);
            placedAny = true;
            // Flip preference for next room
            preferNext = useGroup === 'C' ? 'D' : 'C';
          } else {
            // TAIL: remaining < capacity. Stay SEQUENTIAL.
            // First try this room's chosen empty group. If it fits, place here.
            if (remaining.length <= capacity) {
              placeIntoCDGroup(ri, useGroup, remaining);
              remaining = [];
              placedAny = true;
              break;
            }

            // Otherwise, look FORWARD ONLY for the next completely empty C/D group
            // that can hold the tail. Never jump backward into earlier rooms.
            type Cand = { ri: number; group: 'C' | 'D'; size: number };
            const cands: Cand[] = [];
            for (let rj = ri + 1; rj < rooms.length; rj++) {
              if (isGroupEmpty(rj, 'C')) cands.push({ ri: rj, group: 'C', size: groupSizeOf(rj, 'C') });
              if (isGroupEmpty(rj, 'D')) cands.push({ ri: rj, group: 'D', size: groupSizeOf(rj, 'D') });
            }
            const fits = cands
              .filter((c) => c.size >= remaining.length)
              .sort((a, b) => a.ri - b.ri || a.size - b.size);
            const target = fits[0];
            if (target) {
              placeIntoCDGroup(target.ri, target.group, remaining);
              remaining = [];
              placedAny = true;
              break;
            }

            // No forward slot exists: leave the remainder for the final fresh-room pass.
            break;
          }
        }

        // Remove this code from pool whether or not fully placed (avoid loop)
        const idx = pool.indexOf(code);
        if (idx >= 0) pool.splice(idx, 1);

        // If something remains and no progress, stop
        if (remaining.length > 0 && !placedAny) break;
        // If something remains, push it back as a smaller code so the next
        // iteration can try to place it in a later fresh room/group.
        if (remaining.length > 0) {
          pool.push({
            examCode: code.examCode,
            students: remaining,
            count: remaining.length,
          });
        }
      }
    }
    // ===== END PHASE 2 (C/D fill) =====

    // ================================================================
    // PHASE 3 — SAFETY PASS: GUARANTEE ZERO STUDENT LOSS
    // ----------------------------------------------------------------
    // IMPORTANT: do NOT backfill arbitrary empty cells in earlier rooms.
    // That breaks the fresh-room logic and creates false violation-heavy rooms.
    // Instead, place any remaining students only into NEW rooms appended at end.
    // ================================================================
    {
      const remainingByCode = [...pool].sort((a, b) => b.count - a.count);
      pool.length = 0;

      const createEmptyRoom = (): RoomAllocation => {
        const i = rooms.length;
        const grid: (StudentRecord | null)[][] = Array.from(
          { length: rows },
          () => Array(totalCols).fill(null)
        );
        const newRoom: RoomAllocation = {
          roomNumber: normalStartingRoomNumber + i,
          students: [],
          grid,
          totalRows: rows,
          seatsPerRow: totalCols,
          mainColumns,
          seatsPerColumn,
        };
        rooms.push(newRoom);
        roomSlots.push(buildRoomSlots(rows, mainColumns, seatsPerColumn));
        usedA.push(0);
        usedB.push(0);
        allRooms.push(newRoom);
        return newRoom;
      };

      const placeFreshRoomSequential = (room: RoomAllocation, queue: StudentRecord[]) => {
        let qIdx = 0;
        for (let r = 0; r < room.grid.length && qIdx < queue.length; r++) {
          for (let c = 0; c < room.grid[r].length && qIdx < queue.length; c++) {
            room.grid[r][c] = queue[qIdx];
            room.students.push(queue[qIdx]);
            qIdx++;
          }
        }
        return qIdx;
      };

      for (const code of remainingByCode) {
        let remaining = [...code.students];
        while (remaining.length > 0) {
          const room = createEmptyRoom();
          const consumed = placeFreshRoomSequential(room, remaining);
          remaining = remaining.slice(consumed);
        }
      }
    }
    // ===== END PHASE 3 (fresh-room safety pass) =====
  }
  // ===== END SLACK-FILLER PHASE =====

  // FINAL VERIFICATION: warn (in console) if any student is missing.
  const seatedCount = allRooms.reduce((sum, r) => {
    let n = 0;
    for (const row of r.grid) for (const cell of row) if (cell) n++;
    return sum + n;
  }, 0);
  if (seatedCount !== students.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[seating-algorithm] Mismatch: ${students.length} input students vs ${seatedCount} seated. Diff = ${students.length - seatedCount}.`
    );
  }

  return {
    rooms: allRooms,
    patternDecision: { pattern: 'CRISS_CROSS', message: null, violations: 0 },
  };
}
