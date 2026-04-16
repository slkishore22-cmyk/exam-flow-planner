import type {
  AllocationResult,
  GroupLabel,
  GroupRanking,
  RoomAllocation,
  RoomConfig,
  StudentRecord,
} from './seating-types';

type BucketKind = 'primary' | 'middle' | 'small';

interface ExamBucket {
  rank: number;
  examCode: string;
  totalStudents: number;
  students: StudentRecord[];
  kind: BucketKind;
  assignedGroup: GroupLabel | null;
  startRoom: number | null;
}

interface RoomSlot {
  roomIndex: number;
  assigned: Record<GroupLabel, StudentRecord[]>;
}

const ROOM_ROWS = 5;
const GROUPS: GroupLabel[] = ['A', 'B', 'C', 'D'];
const SAME_CODE_COMPATIBILITY: Record<GroupLabel, GroupLabel[]> = {
  A: ['A', 'B'],
  B: ['A', 'B'],
  C: ['C'],
  D: ['D'],
};

function classifyBucket(totalStudents: number): BucketKind {
  if (totalStudents >= 100) return 'primary';
  if (totalStudents >= 10) return 'middle';
  return 'small';
}

function getGroupForCell(row: number, col: number): GroupLabel {
  const subCol = col % 3;

  if (row % 2 === 0) {
    if (subCol === 0) return 'A';
    if (subCol === 1) return 'C';
    return 'B';
  }

  if (subCol === 0) return 'B';
  if (subCol === 1) return 'D';
  return 'A';
}

function buildRoomGroupPositions(rows: number, totalCols: number): Record<GroupLabel, [number, number][]> {
  const positions: Record<GroupLabel, [number, number][]> = {
    A: [],
    B: [],
    C: [],
    D: [],
  };

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < totalCols; col += 1) {
      positions[getGroupForCell(row, col)].push([row, col]);
    }
  }

  return positions;
}

function getGroupCapacities(positions: Record<GroupLabel, [number, number][]>): Record<GroupLabel, number> {
  return {
    A: positions.A.length,
    B: positions.B.length,
    C: positions.C.length,
    D: positions.D.length,
  };
}

function rankExamCodes(students: StudentRecord[]): ExamBucket[] {
  const grouped = new Map<string, StudentRecord[]>();

  for (const student of students) {
    const list = grouped.get(student.examCode) ?? [];
    list.push(student);
    grouped.set(student.examCode, list);
  }

  for (const list of grouped.values()) {
    list.sort((left, right) => {
      const leftNumber = parseInt(left.rollNumber, 10);
      const rightNumber = parseInt(right.rollNumber, 10);

      if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
        return leftNumber - rightNumber;
      }

      return left.rollNumber.localeCompare(right.rollNumber);
    });
  }

  return [...grouped.entries()]
    .sort((left, right) => right[1].length - left[1].length)
    .map(([examCode, list], index) => ({
      rank: index + 1,
      examCode,
      totalStudents: list.length,
      students: [...list],
      kind: classifyBucket(list.length),
      assignedGroup: null,
      startRoom: null,
    }));
}

function makeEmptyRoom(index: number): RoomSlot {
  return {
    roomIndex: index,
    assigned: {
      A: [],
      B: [],
      C: [],
      D: [],
    },
  };
}

function ensureRoomExists(rooms: RoomSlot[], roomIndex: number) {
  while (rooms.length <= roomIndex) {
    rooms.push(makeEmptyRoom(rooms.length));
  }
}

function getGroupFill(room: RoomSlot, group: GroupLabel): number {
  return room.assigned[group].length;
}

function getGroupRemaining(
  room: RoomSlot,
  group: GroupLabel,
  groupCapacity: Record<GroupLabel, number>
): number {
  return Math.max(0, groupCapacity[group] - getGroupFill(room, group));
}

function getExamGroupsInRoom(room: RoomSlot, examCode: string): GroupLabel[] {
  return GROUPS.filter((group) => room.assigned[group].some((student) => student.examCode === examCode));
}

function canPlaceExamCodeInGroup(_room: RoomSlot, _examCode: string, _group: GroupLabel): boolean {
  // Same exam code is allowed in any group within the same room.
  // Adjacency violations are resolved later by fixViolations.
  return true;
}

function placeIntoGroup(
  room: RoomSlot,
  group: GroupLabel,
  bucket: ExamBucket,
  groupCapacity: Record<GroupLabel, number>
): number {
  const take = Math.min(getGroupRemaining(room, group, groupCapacity), bucket.students.length);
  if (take <= 0) return 0;

  room.assigned[group].push(...bucket.students.splice(0, take));
  bucket.assignedGroup ??= group;
  return take;
}

function fillBucketIntoExistingRooms(
  bucket: ExamBucket,
  rooms: RoomSlot[],
  groupOrder: readonly GroupLabel[],
  groupCapacity: Record<GroupLabel, number>,
  startRoom = 0
): void {
  for (const group of groupOrder) {
    for (let roomIndex = startRoom; roomIndex < rooms.length && bucket.students.length > 0; roomIndex += 1) {
      const room = rooms[roomIndex];
      if (!canPlaceExamCodeInGroup(room, bucket.examCode, group)) continue;

      const placed = placeIntoGroup(room, group, bucket, groupCapacity);
      if (placed > 0) {
        bucket.startRoom ??= roomIndex;
      }
    }
    if (bucket.students.length === 0) return;
  }
}

function fillBucketWithExpansion(
  bucket: ExamBucket,
  rooms: RoomSlot[],
  groupOrder: readonly GroupLabel[],
  groupCapacity: Record<GroupLabel, number>,
  startRoom: number
): number {
  let cursor = startRoom;

  while (bucket.students.length > 0) {
    const before = bucket.students.length;

    for (let roomIndex = startRoom; roomIndex < rooms.length && bucket.students.length > 0; roomIndex += 1) {
      const room = rooms[roomIndex];
      let used = false;
      for (const group of groupOrder) {
        if (bucket.students.length === 0) break;
        if (!canPlaceExamCodeInGroup(room, bucket.examCode, group)) continue;
        const placed = placeIntoGroup(room, group, bucket, groupCapacity);
        if (placed > 0) {
          used = true;
          bucket.startRoom ??= roomIndex;
        }
      }
      if (used) cursor = Math.max(cursor, roomIndex + 1);
    }

    if (bucket.students.length === 0) break;
    if (bucket.students.length === before) {
      ensureRoomExists(rooms, rooms.length);
    }
  }

  return cursor;
}

function hasViolation(grid: (StudentRecord | null)[][], row: number, col: number): boolean {
  const current = grid[row][col];
  if (!current) return false;

  const examCode = current.examCode;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  return (
    (col + 1 < cols && grid[row][col + 1]?.examCode === examCode) ||
    (col - 1 >= 0 && grid[row][col - 1]?.examCode === examCode) ||
    (row + 1 < rows && grid[row + 1][col]?.examCode === examCode) ||
    (row - 1 >= 0 && grid[row - 1][col]?.examCode === examCode)
  );
}

function fixViolations(grid: (StudentRecord | null)[][], maxPasses = 20) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let fixed = false;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const current = grid[row][col];
        if (!current || !hasViolation(grid, row, col)) continue;

        outer: for (let swapRow = 0; swapRow < rows; swapRow += 1) {
          for (let swapCol = 0; swapCol < cols; swapCol += 1) {
            if (swapRow === row && swapCol === col) continue;

            const candidate = grid[swapRow][swapCol];
            if (!candidate || candidate.examCode === current.examCode) continue;

            grid[row][col] = candidate;
            grid[swapRow][swapCol] = current;

            if (!hasViolation(grid, row, col) && !hasViolation(grid, swapRow, swapCol)) {
              fixed = true;
              break outer;
            }

            grid[row][col] = current;
            grid[swapRow][swapCol] = candidate;
          }
        }
      }
    }

    if (!fixed) break;
  }
}

function buildRoomAllocations(
  rooms: RoomSlot[],
  rows: number,
  totalCols: number,
  groupPositions: Record<GroupLabel, [number, number][]>
): RoomAllocation[] {
  return rooms.map((room) => {
    const grid: (StudentRecord | null)[][] = Array.from({ length: rows }, () => Array(totalCols).fill(null));
    const roomStudents: StudentRecord[] = [];

    for (const group of GROUPS) {
      const positions = groupPositions[group];
      const students = room.assigned[group];

      for (let index = 0; index < students.length && index < positions.length; index += 1) {
        const [row, col] = positions[index];
        grid[row][col] = students[index];
        roomStudents.push(students[index]);
      }
    }

    fixViolations(grid);

    return {
      roomNumber: room.roomIndex + 1,
      students: roomStudents,
      grid,
      totalRows: rows,
      seatsPerRow: totalCols,
    };
  });
}

function countViolations(roomAllocations: RoomAllocation[]): number {
  let violations = 0;

  for (const room of roomAllocations) {
    for (let row = 0; row < room.totalRows; row += 1) {
      for (let col = 0; col < room.seatsPerRow; col += 1) {
        const current = room.grid[row][col];
        if (!current) continue;

        if (col + 1 < room.seatsPerRow && room.grid[row][col + 1]?.examCode === current.examCode) {
          violations += 1;
        }

        if (row + 1 < room.totalRows && room.grid[row + 1][col]?.examCode === current.examCode) {
          violations += 1;
        }
      }
    }
  }

  return violations;
}

export function allocateRooms(students: StudentRecord[], config: RoomConfig): AllocationResult {
  const rows = ROOM_ROWS;
  const totalCols = Math.max(1, config.mainColumns * config.seatsPerColumn);
  const totalSeatCount = rows * totalCols;
  const roomStrength = Math.max(1, Math.min(totalSeatCount, config.studentsPerRoom || totalSeatCount));

  const groupPositions = buildRoomGroupPositions(rows, totalCols);
  const groupCapacity = getGroupCapacities(groupPositions);
  const buckets = rankExamCodes(students);

  const primaryBuckets = buckets.filter((bucket) => bucket.kind === 'primary');
  const middleBuckets = buckets.filter((bucket) => bucket.kind === 'middle');
  const smallBuckets = buckets.filter((bucket) => bucket.kind === 'small');

  const baseRoomCount = Math.max(1, Math.ceil(students.length / roomStrength));
  const primarySeatCapacity = Math.max(1, groupCapacity.A + groupCapacity.B);
  const primaryStudentCount = primaryBuckets.reduce((sum, bucket) => sum + bucket.totalStudents, 0);
  const initialRoomCount = Math.max(baseRoomCount, Math.ceil(primaryStudentCount / primarySeatCapacity));
  const rooms = Array.from({ length: initialRoomCount }, (_, index) => makeEmptyRoom(index));

  let primaryCursor = 0;
  primaryBuckets.forEach((bucket, index) => {
    const groupOrder = index % 2 === 0 ? (['A', 'B'] as const) : (['B', 'A'] as const);
    primaryCursor = fillBucketWithExpansion(bucket, rooms, groupOrder, groupCapacity, primaryCursor);
  });

  // Middle buckets: fill C/D first, then A/B, only inside existing rooms
  middleBuckets.forEach((bucket, index) => {
    const groupOrder = index % 2 === 0 ? (['C', 'D', 'A', 'B'] as const) : (['D', 'C', 'B', 'A'] as const);
    fillBucketIntoExistingRooms(bucket, rooms, groupOrder, groupCapacity, 0);
    if (bucket.students.length > 0) {
      fillBucketWithExpansion(bucket, rooms, groupOrder, groupCapacity, 0);
    }
  });

  // Small buckets: fillers for any remaining gaps
  smallBuckets.forEach((bucket) => {
    fillBucketIntoExistingRooms(bucket, rooms, ['D', 'C', 'A', 'B'], groupCapacity, 0);
    if (bucket.students.length > 0) {
      fillBucketWithExpansion(bucket, rooms, ['D', 'C', 'A', 'B'], groupCapacity, 0);
    }
  });

  const roomAllocations = buildRoomAllocations(rooms, rows, totalCols, groupPositions).filter(
    (room) => room.students.length > 0
  );

  roomAllocations.forEach((room, index) => {
    room.roomNumber = index + 1;
  });

  const groupRankings: GroupRanking[] = buckets
    .map((bucket) => ({
      rank: bucket.rank,
      group: bucket.assignedGroup ?? 'A',
      examCode: bucket.examCode,
      totalStudents: bucket.totalStudents,
    }))
    .sort((left, right) => left.rank - right.rank);

  return {
    rooms: roomAllocations,
    groupRankings,
    violations: countViolations(roomAllocations),
  };
}