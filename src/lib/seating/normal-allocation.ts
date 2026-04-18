import { StudentRecord, RoomConfig, RoomAllocation } from '../seating-utils';
import { buildRoomSlots, normalizeDepartmentKey, RoomSlots } from './room-slots';

interface SortedCode {
  examCode: string;
  totalCount: number;
  departments: { department: string; students: StudentRecord[] }[];
}

interface Reservation {
  code: SortedCode;
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

  // Group + sort exam codes by count desc. Phase 1: only codes with >=100 students.
  const byCode = new Map<string, StudentRecord[]>();
  for (const s of normalStudents) {
    if (!byCode.has(s.examCode)) byCode.set(s.examCode, []);
    byCode.get(s.examCode)!.push(s);
  }

  const sortedCodes: SortedCode[] = Array.from(byCode.entries())
    .map(([examCode, list]) => {
      const deptGroups = new Map<string, { department: string; students: StudentRecord[] }>();
      for (const student of list) {
        const key = normalizeDepartmentKey(student.department);
        if (!deptGroups.has(key)) {
          deptGroups.set(key, { department: student.department.trim().toUpperCase(), students: [] });
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

      return { examCode, totalCount: list.length, departments };
    })
    .sort((a, b) => b.totalCount - a.totalCount)
    .filter((code) => code.totalCount >= 100);

  console.log('[ALLOC] Exam codes (size desc, >=100 only):');
  for (const c of sortedCodes) {
    const deptSummary = c.departments.map((d) => `${d.department}(${d.students.length})`).join(', ');
    console.log(`[ALLOC]   ${c.examCode} total=${c.totalCount} → ${deptSummary}`);
  }

  // Reserve room ranges per (code, group) up front.
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

    const primaryAvailable = roomsNeeded - (primary === 'A' ? nextRoomA : nextRoomB);
    const primaryCapacity = primaryAvailable * primarySize;

    const primaryStudents = Math.min(totalStudents, primaryCapacity);
    const primaryRooms = Math.ceil(primaryStudents / primarySize);
    const remaining = totalStudents - primaryStudents;

    if (primaryRooms > 0) {
      const startRoom = primary === 'A' ? nextRoomA : nextRoomB;
      reservations.push({ code, group: primary, startRoom, roomCount: primaryRooms, seats: primaryRooms * primarySize });
      if (primary === 'A') nextRoomA += primaryRooms;
      else nextRoomB += primaryRooms;
    }

    if (remaining > 0) {
      const secondaryAvailable = roomsNeeded - (secondary === 'A' ? nextRoomA : nextRoomB);
      const secondaryRooms = Math.min(secondaryAvailable, Math.ceil(remaining / secondarySize));
      if (secondaryRooms > 0) {
        const startRoom = secondary === 'A' ? nextRoomA : nextRoomB;
        reservations.push({ code, group: secondary, startRoom, roomCount: secondaryRooms, seats: secondaryRooms * secondarySize });
        if (secondary === 'A') nextRoomA += secondaryRooms;
        else nextRoomB += secondaryRooms;
      }
    }
  }

  // Fill each reservation linearly.
  const resByCode = new Map<string, Reservation[]>();
  for (const r of reservations) {
    if (!resByCode.has(r.code.examCode)) resByCode.set(r.code.examCode, []);
    resByCode.get(r.code.examCode)!.push(r);
  }

  for (const code of sortedCodes) {
    const codeReservations = resByCode.get(code.examCode) ?? [];
    if (codeReservations.length === 0) continue;

    const queue: StudentRecord[] = [];
    for (const dept of code.departments) {
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
  }

  return rooms;
}
