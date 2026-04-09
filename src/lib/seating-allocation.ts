import type {
  AllocationResult,
  GroupRanking,
  RoomAllocation,
  RoomConfig,
  StudentRecord,
} from './seating-utils';

type PhysicalGroup = 'A' | 'B' | 'C' | 'D';
type Lane = 'A' | 'B' | 'MID';

interface SeatPosition {
  row: number;
  col: number;
  group: PhysicalGroup;
}

interface LaneAssignment {
  examCode: string;
  lane: Lane;
  students: StudentRecord[];
}

const ROOM_ROWS = 5;
const ROOM_COLUMNS = 9;
const LANE_ORDER: Lane[] = ['A', 'B', 'MID'];
const PANEL_FILL_ORDER = [1, 0, 2] as const;
const MID_GROUP_ORDER: PhysicalGroup[] = ['C', 'D'];

const LANE_CAPACITY: Record<Lane, number> = {
  A: 15,
  B: 15,
  MID: 15,
};

function getGroupForCell(row: number, col: number): PhysicalGroup {
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

function compareRollNumbers(a: StudentRecord, b: StudentRecord) {
  return a.rollNumber.localeCompare(b.rollNumber, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function createEmptyRoom(roomNumber: number): RoomAllocation {
  return {
    roomNumber,
    students: [],
    grid: Array.from({ length: ROOM_ROWS }, () => Array.from({ length: ROOM_COLUMNS }, () => null)),
    totalRows: ROOM_ROWS,
    seatsPerRow: ROOM_COLUMNS,
  };
}

function sortSeatPositions(positions: SeatPosition[]): SeatPosition[] {
  const panelPriority = (col: number) => PANEL_FILL_ORDER.indexOf(Math.floor(col / 3) as (typeof PANEL_FILL_ORDER)[number]);

  return [...positions].sort((a, b) => {
    const panelDiff = panelPriority(a.col) - panelPriority(b.col);
    if (panelDiff !== 0) return panelDiff;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
}

function buildLanePositions(): Record<Lane, SeatPosition[]> {
  const grouped: Record<PhysicalGroup, SeatPosition[]> = {
    A: [],
    B: [],
    C: [],
    D: [],
  };

  for (let row = 0; row < ROOM_ROWS; row++) {
    for (let col = 0; col < ROOM_COLUMNS; col++) {
      const group = getGroupForCell(row, col);
      grouped[group].push({ row, col, group });
    }
  }

  const sortedGroups = {
    A: sortSeatPositions(grouped.A),
    B: sortSeatPositions(grouped.B),
    C: sortSeatPositions(grouped.C),
    D: sortSeatPositions(grouped.D),
  };

  return {
    A: sortedGroups.A,
    B: sortedGroups.B,
    MID: [...MID_GROUP_ORDER.flatMap(group => sortedGroups[group])],
  };
}

function buildLaneAssignments(students: StudentRecord[]): LaneAssignment[] {
  const examMap = new Map<string, StudentRecord[]>();

  for (const student of students) {
    const examCode = student.examCode || 'UNKNOWN';
    if (!examMap.has(examCode)) {
      examMap.set(examCode, []);
    }
    examMap.get(examCode)!.push(student);
  }

  const buckets = Array.from(examMap.entries())
    .map(([examCode, examStudents]) => ({
      examCode,
      students: [...examStudents].sort(compareRollNumbers),
    }))
    .sort((a, b) => b.students.length - a.students.length || a.examCode.localeCompare(b.examCode));

  return buckets.map((bucket, index) => ({
    examCode: bucket.examCode,
    lane: LANE_ORDER[index % LANE_ORDER.length],
    students: bucket.students,
  }));
}

function calculateRequiredRooms(assignments: LaneAssignment[], requestedRoomCount?: number) {
  const laneRoomUsage: Record<Lane, number> = { A: 0, B: 0, MID: 0 };

  assignments.forEach(assignment => {
    laneRoomUsage[assignment.lane] += Math.max(1, Math.ceil(assignment.students.length / LANE_CAPACITY[assignment.lane]));
  });

  return Math.max(requestedRoomCount ?? 0, laneRoomUsage.A, laneRoomUsage.B, laneRoomUsage.MID);
}

function countViolations(rooms: RoomAllocation[]) {
  let violations = 0;

  for (const room of rooms) {
    for (let row = 0; row < room.grid.length; row++) {
      for (let col = 0; col < room.grid[row].length; col++) {
        const current = room.grid[row][col];
        if (!current) continue;

        if (col + 1 < room.grid[row].length && room.grid[row][col + 1]?.examCode === current.examCode) {
          violations++;
        }

        if (row + 1 < room.grid.length && room.grid[row + 1][col]?.examCode === current.examCode) {
          violations++;
        }
      }
    }
  }

  return violations;
}

function buildGroupRankings(
  assignments: LaneAssignment[],
  groupCountsByExam: Map<string, Record<PhysicalGroup, number>>
): GroupRanking[] {
  const rankings: GroupRanking[] = [];
  let rank = 1;

  assignments.forEach(assignment => {
    const counts = groupCountsByExam.get(assignment.examCode);
    if (!counts) return;

    const groups: PhysicalGroup[] = assignment.lane === 'MID'
      ? MID_GROUP_ORDER
      : [assignment.lane as PhysicalGroup];

    groups.forEach(group => {
      const totalStudents = counts[group] ?? 0;
      if (totalStudents <= 0) return;

      rankings.push({
        rank: rank++,
        group,
        examCode: assignment.examCode,
        totalStudents,
      });
    });
  });

  return rankings;
}

export function allocateRooms(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  if (students.length === 0) {
    return { rooms: [], groupRankings: [], violations: 0 };
  }

  const lanePositions = buildLanePositions();
  const assignments = buildLaneAssignments(students);
  const roomsNeeded = calculateRequiredRooms(assignments, config.requestedRoomCount);
  const rooms = Array.from({ length: roomsNeeded }, (_, index) => createEmptyRoom(index + 1));
  const laneRoomPointers: Record<Lane, number> = { A: 0, B: 0, MID: 0 };
  const groupCountsByExam = new Map<string, Record<PhysicalGroup, number>>();

  const placeStudent = (roomIndex: number, seat: SeatPosition, student: StudentRecord) => {
    const room = rooms[roomIndex];
    room.grid[seat.row][seat.col] = student;
    room.students.push(student);

    if (!groupCountsByExam.has(student.examCode)) {
      groupCountsByExam.set(student.examCode, { A: 0, B: 0, C: 0, D: 0 });
    }

    groupCountsByExam.get(student.examCode)![seat.group] += 1;
  };

  assignments.forEach(assignment => {
    const seats = lanePositions[assignment.lane];
    let roomIndex = laneRoomPointers[assignment.lane];
    let studentIndex = 0;

    while (studentIndex < assignment.students.length) {
      const chunk = assignment.students.slice(studentIndex, studentIndex + seats.length);

      chunk.forEach((student, seatIndex) => {
        placeStudent(roomIndex, seats[seatIndex], student);
      });

      studentIndex += chunk.length;
      roomIndex += 1;
    }

    laneRoomPointers[assignment.lane] = roomIndex;
  });

  return {
    rooms,
    groupRankings: buildGroupRankings(assignments, groupCountsByExam),
    violations: countViolations(rooms),
  };
}