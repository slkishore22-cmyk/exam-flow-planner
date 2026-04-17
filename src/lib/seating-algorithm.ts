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
 * 3. Each code consumes ceil(count / 15) consecutive FRESH rooms in its
 *    assigned group's queue. A code NEVER starts mid-room — it always
 *    begins on a room where its target group is empty.
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

  // Alternating A/B fill with biggest codes — fresh room start, no spillover.
  // If the preferred group runs out of fresh rooms mid-code, continue the SAME
  // code in the other group's fresh rooms before moving on to the next code.
  let useA = true;

  const fillInGroup = (
    group: 'A' | 'B',
    stuQueue: StudentRecord[]
  ) => {
    const groupSize = group === 'A' ? groupASize : groupBSize;
    let cursor = group === 'A' ? nextFreshA : nextFreshB;
    while (stuQueue.length > 0 && cursor < roomsNeeded) {
      let placed = 0;
      while (placed < groupSize && stuQueue.length > 0) {
        if (!placeAt(cursor, group, stuQueue[0])) break;
        stuQueue.shift();
        placed++;
      }
      cursor++;
    }
    if (group === 'A') nextFreshA = cursor;
    else nextFreshB = cursor;
  };

  for (const [, list] of sortedCodes) {
    const stuQueue = [...list];
    const primary: 'A' | 'B' = useA ? 'A' : 'B';
    const secondary: 'A' | 'B' = useA ? 'B' : 'A';

    // Fill primary group first
    fillInGroup(primary, stuQueue);

    // If this code still has students left, spill over into the other group's fresh rooms
    if (stuQueue.length > 0) {
      fillInGroup(secondary, stuQueue);
    }

    // Toggle A/B for next code
    useA = !useA;

    // If we've run out of fresh rooms in BOTH queues, stop assigning more codes.
    if (nextFreshA >= roomsNeeded && nextFreshB >= roomsNeeded) break;
  }

  return {
    rooms,
    patternDecision: { pattern: 'CRISS_CROSS', message: null, violations: 0 },
  };
}
