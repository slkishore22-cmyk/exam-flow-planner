import { StudentRecord, RoomConfig, RoomAllocation, AllocationResult, getGroupLabel } from './seating-utils';

/**
 * Seating algorithm:
 *
 * 1. Group exam codes by count, sorted descending.
 * 2. Each room has 4 groups based on getGroupLabel:
 *    - For default 3 main cols × 3 sub cols × 5 rows:
 *      A = 15 seats, B = 15 seats, C = 9 seats, D = 6 seats (total 45).
 * 3. Total rooms needed = ceil(totalStudents / seatsPerRoom).
 * 4. Allocate biggest codes to A and B in alternating order:
 *    Code-1 → A queue, Code-2 → B queue, Code-3 → A queue, Code-4 → B queue, ...
 *    Each code consumes ceil(count/groupASize) consecutive FRESH rooms in its queue.
 *    Each code starts on a fresh (unused-for-that-group) room — never mid-room.
 * 5. If a code is too big to fit in remaining fresh A/B slots, the overflow
 *    spills into C/D of EARLIER rooms (of that code), looping room-by-room:
 *    Room 1 → fill C, Room 2 → fill D, Room 3 → fill C, ... until done.
 * 6. Remaining free C/D seats are filled with the smallest exam codes
 *    (one student per code first, then continue with next-smallest leftovers).
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

function buildRoomSlots(rows: number, mainCols: number, subCols: number): RoomSlots {
  const slots: RoomSlots = { A: [], B: [], C: [], D: [] };
  const totalCols = mainCols * subCols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < totalCols; c++) {
      const g = getGroupLabel(r, c, subCols);
      slots[g].push({ row: r, col: c, group: g });
    }
  }
  return slots;
}

export function allocateSeating(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  const { studentsPerRoom, mainColumns, seatsPerColumn } = config;
  const totalCols = mainColumns * seatsPerColumn;
  const rows = Math.ceil(studentsPerRoom / totalCols);
  const total = students.length;
  const roomsNeeded = Math.max(1, Math.ceil(total / studentsPerRoom));

  // Build empty rooms
  const rooms: RoomAllocation[] = [];
  const roomSlots: RoomSlots[] = [];
  for (let i = 0; i < roomsNeeded; i++) {
    const grid: (StudentRecord | null)[][] = Array.from(
      { length: rows },
      () => Array(totalCols).fill(null)
    );
    rooms.push({
      roomNumber: i + 1,
      students: [],
      grid,
      totalRows: rows,
      seatsPerRow: totalCols,
    });
    roomSlots.push(buildRoomSlots(rows, mainColumns, seatsPerColumn));
  }

  if (roomsNeeded === 0 || total === 0) {
    return { rooms, patternDecision: { pattern: 'CRISS_CROSS', message: null, violations: 0 } };
  }

  const groupASize = roomSlots[0].A.length; // typically 15
  const groupBSize = roomSlots[0].B.length; // typically 15

  // Track how many seats have been used in each group of each room
  const usedA: number[] = Array(roomsNeeded).fill(0);
  const usedB: number[] = Array(roomsNeeded).fill(0);
  const usedC: number[] = Array(roomsNeeded).fill(0);
  const usedD: number[] = Array(roomsNeeded).fill(0);

  // Group + sort exam codes by count desc, sort students within each by roll number
  const byCode = new Map<string, StudentRecord[]>();
  for (const s of students) {
    if (!byCode.has(s.examCode)) byCode.set(s.examCode, []);
    byCode.get(s.examCode)!.push(s);
  }
  for (const list of byCode.values()) {
    list.sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));
  }
  const sortedCodes = Array.from(byCode.entries())
    .sort((a, b) => b[1].length - a[1].length);

  // Helper: place a student at a room/group slot
  const placeAt = (
    roomIdx: number,
    group: 'A' | 'B' | 'C' | 'D',
    student: StudentRecord
  ): boolean => {
    const slots = roomSlots[roomIdx][group];
    const used = group === 'A' ? usedA : group === 'B' ? usedB : group === 'C' ? usedC : usedD;
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

  // Track per-code which rooms got A or B for spillover
  const codeRoomsForCD: { code: string; rooms: number[]; remaining: StudentRecord[] }[] = [];

  // Pass 1: Alternating A/B fill with biggest codes
  let useA = true;
  const leftoverCodes: { code: string; students: StudentRecord[] }[] = [];

  for (const [code, list] of sortedCodes) {
    const stuQueue = [...list];
    const targetGroup: 'A' | 'B' = useA ? 'A' : 'B';
    const groupSize = useA ? groupASize : groupBSize;
    let cursor = useA ? nextFreshA : nextFreshB;

    const roomsUsedByThisCode: number[] = [];

    while (stuQueue.length > 0 && cursor < roomsNeeded) {
      // Fill up to groupSize students into this fresh room's group
      let placed = 0;
      while (placed < groupSize && stuQueue.length > 0) {
        if (!placeAt(cursor, targetGroup, stuQueue[0])) break;
        stuQueue.shift();
        placed++;
      }
      roomsUsedByThisCode.push(cursor);
      cursor++;
    }

    if (useA) nextFreshA = cursor;
    else nextFreshB = cursor;

    // If still students left, spill into C/D of this code's rooms
    if (stuQueue.length > 0) {
      codeRoomsForCD.push({ code, rooms: roomsUsedByThisCode, remaining: stuQueue });
    }

    // Toggle A/B for next code
    useA = !useA;
  }

  // Pass 2: Spillover into C/D of code's own rooms (loop: room1-C, room2-D, room3-C, ...)
  for (const entry of codeRoomsForCD) {
    const { rooms: rIdxs, remaining } = entry;
    let i = 0;
    let useC = true;
    while (remaining.length > 0 && rIdxs.length > 0) {
      const ri = rIdxs[i % rIdxs.length];
      const grp: 'C' | 'D' = useC ? 'C' : 'D';
      const slots = roomSlots[ri][grp];
      const used = useC ? usedC : usedD;
      if (used[ri] < slots.length) {
        placeAt(ri, grp, remaining[0]);
        remaining.shift();
      }
      // Advance: next room, alternate C/D
      i++;
      if (i % rIdxs.length === 0) {
        useC = !useC;
      }
      // Safety: if all C and D slots in these rooms are full, break
      const allFull = rIdxs.every(r =>
        usedC[r] >= roomSlots[r].C.length && usedD[r] >= roomSlots[r].D.length
      );
      if (allFull) break;
    }
    if (remaining.length > 0) {
      leftoverCodes.push({ code: entry.code, students: remaining });
    }
  }

  // Pass 3: Fill remaining C/D seats with smallest exam codes (single students first)
  // Collect all students NOT yet placed: from leftoverCodes plus codes that were never given any room
  const placedRolls = new Set<string>();
  for (const r of rooms) for (const s of r.students) placedRolls.add(s.rollNumber);

  const unplaced: StudentRecord[] = [];
  for (const [, list] of sortedCodes) {
    for (const s of list) {
      if (!placedRolls.has(s.rollNumber)) unplaced.push(s);
    }
  }

  // Sort unplaced: smaller code count first, then by roll
  const codeCount = new Map<string, number>();
  unplaced.forEach(s => codeCount.set(s.examCode, (codeCount.get(s.examCode) || 0) + 1));
  unplaced.sort((a, b) => {
    const ca = codeCount.get(a.examCode)!;
    const cb = codeCount.get(b.examCode)!;
    if (ca !== cb) return ca - cb;
    if (a.examCode !== b.examCode) return a.examCode.localeCompare(b.examCode);
    return a.rollNumber.localeCompare(b.rollNumber);
  });

  // Fill C then D across all rooms in order
  const fillRemaining = (group: 'C' | 'D') => {
    const used = group === 'C' ? usedC : usedD;
    for (let ri = 0; ri < roomsNeeded && unplaced.length > 0; ri++) {
      const slots = roomSlots[ri][group];
      while (used[ri] < slots.length && unplaced.length > 0) {
        placeAt(ri, group, unplaced.shift()!);
      }
    }
  };
  fillRemaining('C');
  fillRemaining('D');

  // If anything still unplaced (shouldn't happen if room count is right), put in any free slot
  if (unplaced.length > 0) {
    for (let ri = 0; ri < roomsNeeded && unplaced.length > 0; ri++) {
      for (const g of ['A', 'B', 'C', 'D'] as const) {
        const slots = roomSlots[ri][g];
        const used = g === 'A' ? usedA : g === 'B' ? usedB : g === 'C' ? usedC : usedD;
        while (used[ri] < slots.length && unplaced.length > 0) {
          placeAt(ri, g, unplaced.shift()!);
        }
      }
    }
  }

  return {
    rooms,
    patternDecision: { pattern: 'CRISS_CROSS', message: null, violations: 0 },
  };
}
