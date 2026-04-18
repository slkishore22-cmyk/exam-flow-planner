import { StudentRecord, RoomConfig, RoomAllocation } from '../seating-utils';
import { buildRoomSlots, normalizeDepartmentKey, RoomSlots } from './room-slots';

interface CodeDeptUnit {
  examCode: string;
  department: string; // display form (upper-cased, trimmed)
  deptKey: string;    // normalized key
  students: StudentRecord[];
}

interface Reservation {
  unit: CodeDeptUnit;
  group: 'A' | 'B';
  startRoom: number;
  roomCount: number;
  seats: number;
}

export function allocateNormalRooms(
  normalStudents: StudentRecord[],
  config: RoomConfig,
  startingRoomNumber: number
): RoomAllocation[] {
  const { studentsPerRoom, mainColumns, seatsPerColumn } = config;
  const totalCols = mainColumns * seatsPerColumn;
  const rows = Math.ceil(studentsPerRoom / totalCols);
  const total = normalStudents.length;
  const roomsNeeded = total === 0 ? 0 : Math.max(1, Math.ceil(total / studentsPerRoom));

  if (roomsNeeded === 0) return [];

  const rooms: RoomAllocation[] = [];
  const roomSlots: RoomSlots[] = [];
  for (let i = 0; i < roomsNeeded; i++) {
    const grid: (StudentRecord | null)[][] = Array.from(
      { length: rows },
      () => Array(totalCols).fill(null)
    );
    rooms.push({
      roomNumber: startingRoomNumber + i,
      students: [],
      grid,
      totalRows: rows,
      seatsPerRow: totalCols,
      mainColumns,
      seatsPerColumn,
    });
    roomSlots.push(buildRoomSlots(rows, mainColumns, seatsPerColumn));
  }

  const groupASize = roomSlots[0].A.length;
  const groupBSize = roomSlots[0].B.length;

  const usedA: number[] = Array(roomsNeeded).fill(0);
  const usedB: number[] = Array(roomsNeeded).fill(0);

  // Build (examCode, department) units — each is treated as an independent block.
  // Same exam code with different departments => different units => fresh rooms.
  const unitMap = new Map<string, CodeDeptUnit>();
  for (const s of normalStudents) {
    const deptKey = normalizeDepartmentKey(s.department);
    const key = `${s.examCode}__${deptKey}`;
    if (!unitMap.has(key)) {
      unitMap.set(key, {
        examCode: s.examCode,
        department: s.department.trim().toUpperCase(),
        deptKey,
        students: [],
      });
    }
    unitMap.get(key)!.students.push(s);
  }

  // Sort each unit's roll numbers for stable placement.
  for (const u of unitMap.values()) {
    u.students.sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));
  }

  // Only units with >=100 students go through the reserve-then-fill logic.
  // Sort largest first, ties broken by examCode then department for stability.
  const sortedUnits: CodeDeptUnit[] = Array.from(unitMap.values())
    .filter((u) => u.students.length >= 100)
    .sort((a, b) => {
      if (b.students.length !== a.students.length) return b.students.length - a.students.length;
      if (a.examCode !== b.examCode) return a.examCode.localeCompare(b.examCode);
      return a.department.localeCompare(b.department);
    });

  console.log('[ALLOC] Code+Dept units (size desc, >=100 only):');
  for (const u of sortedUnits) {
    console.log(`[ALLOC]   ${u.examCode} [${u.department}] = ${u.students.length}`);
  }

  // Reserve room ranges per unit. Each unit starts in a FRESH room (no sharing
  // with other units, even those with the same examCode).
  const reservations: Reservation[] = [];
  let nextRoomA = 0;
  let nextRoomB = 0;
  let useA = true;

  for (const unit of sortedUnits) {
    const primary: 'A' | 'B' = useA ? 'A' : 'B';
    const secondary: 'A' | 'B' = useA ? 'B' : 'A';
    useA = !useA;

    const primarySize = primary === 'A' ? groupASize : groupBSize;
    const secondarySize = secondary === 'A' ? groupASize : groupBSize;

    const totalStudents = unit.students.length;

    const primaryAvailable = roomsNeeded - (primary === 'A' ? nextRoomA : nextRoomB);
    const primaryCapacity = primaryAvailable * primarySize;

    const primaryStudents = Math.min(totalStudents, primaryCapacity);
    const primaryRooms = Math.ceil(primaryStudents / primarySize);
    const remaining = totalStudents - primaryStudents;

    if (primaryRooms > 0) {
      const startRoom = primary === 'A' ? nextRoomA : nextRoomB;
      reservations.push({ unit, group: primary, startRoom, roomCount: primaryRooms, seats: primaryRooms * primarySize });
      if (primary === 'A') nextRoomA += primaryRooms;
      else nextRoomB += primaryRooms;
    }

    if (remaining > 0) {
      const secondaryAvailable = roomsNeeded - (secondary === 'A' ? nextRoomA : nextRoomB);
      const secondaryRooms = Math.min(secondaryAvailable, Math.ceil(remaining / secondarySize));
      if (secondaryRooms > 0) {
        const startRoom = secondary === 'A' ? nextRoomA : nextRoomB;
        reservations.push({ unit, group: secondary, startRoom, roomCount: secondaryRooms, seats: secondaryRooms * secondarySize });
        if (secondary === 'A') nextRoomA += secondaryRooms;
        else nextRoomB += secondaryRooms;
      }
    }
  }

  // Fill each reservation linearly with that unit's students.
  const resByUnitKey = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const key = `${r.unit.examCode}__${r.unit.deptKey}`;
    if (!resByUnitKey.has(key)) resByUnitKey.set(key, []);
    resByUnitKey.get(key)!.push(r);
  }

  for (const unit of sortedUnits) {
    const key = `${unit.examCode}__${unit.deptKey}`;
    const unitReservations = resByUnitKey.get(key) ?? [];
    if (unitReservations.length === 0) continue;

    const queue = [...unit.students];
    let qIdx = 0;

    for (const res of unitReservations) {
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
  }

  return rooms;
}
