declare const pdfjsLib: any;

export interface StudentRecord {
  rollNumber: string;
  department: string;
  examCode: string;
  sourcePdf: string;
}

export interface PdfExtractionResult {
  fileName: string;
  rollNumbers: { roll: string; dept: string; examCode: string }[];
  declaredCount: number;
  extractedCount: number;
}

export interface RoomConfig {
  studentsPerRoom: number;
  mainColumns: number;
  seatsPerColumn: number;
}

export interface RoomAllocation {
  roomNumber: number;
  students: StudentRecord[];
  grid: (StudentRecord | null)[][];
  totalRows: number;
  seatsPerRow: number;
}

export interface GroupRanking {
  rank: number;
  group: 'A' | 'B' | 'C' | 'D';
  examCode: string;
  totalStudents: number;
}

export interface AllocationResult {
  rooms: RoomAllocation[];
  groupRankings: GroupRanking[];
  violations: number;
}

// ── Colors ──

// Fixed palette of maximally distinct colors
const DISTINCT_PALETTE: { bg: string; text: string }[] = [
  { bg: '#E53935', text: '#FFFFFF' }, // Red
  { bg: '#1E88E5', text: '#FFFFFF' }, // Blue
  { bg: '#43A047', text: '#FFFFFF' }, // Green
  { bg: '#FB8C00', text: '#000000' }, // Orange
  { bg: '#8E24AA', text: '#FFFFFF' }, // Purple
  { bg: '#00ACC1', text: '#000000' }, // Cyan
  { bg: '#D81B60', text: '#FFFFFF' }, // Pink
  { bg: '#FFD600', text: '#000000' }, // Yellow
  { bg: '#3949AB', text: '#FFFFFF' }, // Indigo
  { bg: '#00897B', text: '#FFFFFF' }, // Teal
  { bg: '#6D4C41', text: '#FFFFFF' }, // Brown
  { bg: '#546E7A', text: '#FFFFFF' }, // Blue Grey
  { bg: '#F4511E', text: '#FFFFFF' }, // Deep Orange
  { bg: '#7CB342', text: '#000000' }, // Light Green
  { bg: '#C0CA33', text: '#000000' }, // Lime
  { bg: '#AB47BC', text: '#FFFFFF' }, // Medium Purple
  { bg: '#26A69A', text: '#000000' }, // Medium Teal
  { bg: '#EC407A', text: '#FFFFFF' }, // Rose
  { bg: '#5C6BC0', text: '#FFFFFF' }, // Medium Indigo
  { bg: '#EF6C00', text: '#FFFFFF' }, // Dark Orange
];

const examCodeColorCache = new Map<string, number>();
let nextColorIndex = 0;

export function resetExamCodeColors() {
  examCodeColorCache.clear();
  nextColorIndex = 0;
}

export function getExamCodeColor(examCode: string): { bg: string; text: string } {
  const key = examCode.trim().toUpperCase() || 'UNKNOWN';

  if (!examCodeColorCache.has(key)) {
    examCodeColorCache.set(key, nextColorIndex);
    nextColorIndex++;
  }

  const index = examCodeColorCache.get(key)!;
  return DISTINCT_PALETTE[index % DISTINCT_PALETTE.length];
}

// Group display colors (for the grid cells)
export const GROUP_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: '#1565C0', text: '#FFFFFF' },
  B: { bg: '#C62828', text: '#FFFFFF' },
  C: { bg: '#2E7D32', text: '#FFFFFF' },
  D: { bg: '#F57F17', text: '#000000' },
};

// ── PDF Extraction ──

export async function extractRollNumbersFromPdf(
  file: File,
  onProgress: (page: number, total: number, fileName: string) => void
): Promise<PdfExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const rollNumbers: { roll: string; dept: string; examCode: string }[] = [];
  let declaredCount = 0;
  let currentDegree = 'UNKNOWN';
  let currentExamCode = 'UNKNOWN';

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress(pageNum, totalPages, file.name);
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const rows: Record<number, { x: number; text: string }[]> = {};
    for (const item of content.items as any[]) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 5) * 5;
      if (!rows[y]) rows[y] = [];
      rows[y].push({ x: item.transform[4], text: item.str.trim() });
    }

    const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);
    const lines = sortedYs.map(y =>
      rows[y].sort((a, b) => a.x - b.x).map(i => i.text).join(' ')
    );

    const pageText = lines.join(' ');

    const degreeMatch = pageText.match(
      /Degree\s*[:\-]\s*([A-Z][A-Z0-9.\(\)\[\]\/\s]{1,20}?)\s+Subject/i
    );
    if (degreeMatch) {
      currentDegree = degreeMatch[1].trim().replace(/\s+/g, ' ').toUpperCase();
    }

    const subjectMatch = pageText.match(
      /Subject\s*[:\-]\s*([A-Z0-9]{3,8})-/i
    );
    if (subjectMatch) {
      currentExamCode = subjectMatch[1].trim().toUpperCase();
    }

    const isFirstPageOfSection = /Page\s*No\s*[:\-]?\s*1\b/.test(pageText);
    if (isFirstPageOfSection) {
      const declaredMatch = pageText.match(/No\s+of\s+Candidates\s*[:\-]?\s*(\d+)/i);
      if (declaredMatch) {
        declaredCount += parseInt(declaredMatch[1], 10);
      }
    }

    for (const line of lines) {
      const rollMatch = line.match(/^(\d{1,3})\s+([A-Z]{0,3}\d{5,9})\s+[A-Z]/);
      if (rollMatch) {
        rollNumbers.push({ roll: rollMatch[2], dept: currentDegree, examCode: currentExamCode });
      }
    }
  }

  const seen = new Set<string>();
  const uniqueRolls: { roll: string; dept: string; examCode: string }[] = [];
  for (const entry of rollNumbers) {
    if (!seen.has(entry.roll)) {
      seen.add(entry.roll);
      uniqueRolls.push(entry);
    }
  }

  return {
    fileName: file.name,
    declaredCount,
    extractedCount: uniqueRolls.length,
    rollNumbers: uniqueRolls,
  };
}

export function deduplicateStudents(
  results: PdfExtractionResult[]
): StudentRecord[] {
  const seen = new Set<string>();
  const students: StudentRecord[] = [];

  for (const result of results) {
    for (const entry of result.rollNumbers) {
      if (!seen.has(entry.roll)) {
        seen.add(entry.roll);
        students.push({
          rollNumber: entry.roll,
          department: entry.dept,
          examCode: entry.examCode,
          sourcePdf: result.fileName,
        });
      }
    }
  }

  return students;
}

// ── NEW Seating Algorithm ──
// Model:
//   - 5x9 grid per room (3 panels × 3 sub-cols)
//   - Group A = 15 seats, Group B = 15 seats, Group C = 9 seats, Group D = 6 seats
//   - Pattern per panel:
//       Row 0: A C B
//       Row 1: B D A
//       Row 2: A C B
//       Row 3: B D A
//       Row 4: A C B
//   - Sort exam codes big → small.
//   - Largest code fills Group A across N rooms; next largest fills Group B across M rooms (from room 1).
//   - A new exam code never starts in the middle of an A/B block — it starts at a fresh room or fresh group.
//   - Middle rows (C/D) are filled in parallel with A/B for overflow / smaller codes.
//   - Final leftover seats are filled with single-student / small codes to balance.

type GroupLabel = 'A' | 'B' | 'C' | 'D';

const GROUP_CAPACITY: Record<GroupLabel, number> = { A: 15, B: 15, C: 9, D: 6 };

interface ExamBucket {
  rank: number;
  examCode: string;
  totalStudents: number;
  students: StudentRecord[];
  assignedGroup: GroupLabel | null;
}

function getGroupForCell(row: number, col: number): GroupLabel {
  const subCol = col % 3;
  const isOddDisplayRow = row % 2 === 0; // rows 0,2,4
  if (isOddDisplayRow) {
    if (subCol === 0) return 'A';
    if (subCol === 1) return 'C';
    return 'B';
  } else {
    if (subCol === 0) return 'B';
    if (subCol === 1) return 'D';
    return 'A';
  }
}

/** Build per-room positions for each group, in fill order (top→bottom, left→right). */
function buildRoomGroupPositions(rows: number, totalCols: number): Record<GroupLabel, [number, number][]> {
  const positions: Record<GroupLabel, [number, number][]> = { A: [], B: [], C: [], D: [] };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < totalCols; c++) {
      positions[getGroupForCell(r, c)].push([r, c]);
    }
  }
  return positions;
}

function rankExamCodes(students: StudentRecord[]): ExamBucket[] {
  const map: Record<string, StudentRecord[]> = {};
  for (const s of students) {
    if (!map[s.examCode]) map[s.examCode] = [];
    map[s.examCode].push(s);
  }
  for (const code of Object.keys(map)) {
    map[code].sort((a, b) => {
      const an = parseInt(a.rollNumber);
      const bn = parseInt(b.rollNumber);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return a.rollNumber.localeCompare(b.rollNumber);
    });
  }
  const sorted = Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  return sorted.map(([code, studs], idx) => ({
    rank: idx + 1,
    examCode: code,
    totalStudents: studs.length,
    students: [...studs],
    assignedGroup: null,
  }));
}

interface RoomSlot {
  roomIndex: number;
  assigned: Record<GroupLabel, StudentRecord[]>;
}

function makeEmptyRoom(idx: number): RoomSlot {
  return {
    roomIndex: idx,
    assigned: { A: [], B: [], C: [], D: [] },
  };
}

function getGroupFill(room: RoomSlot, group: GroupLabel): number {
  return room.assigned[group].length;
}

function getGroupRemaining(room: RoomSlot, group: GroupLabel): number {
  return GROUP_CAPACITY[group] - getGroupFill(room, group);
}

function roomHasExamCode(room: RoomSlot, examCode: string): boolean {
  return (['A', 'B', 'C', 'D'] as GroupLabel[]).some((group) =>
    room.assigned[group].some((student) => student.examCode === examCode)
  );
}

function roomHasExamCodeInOtherGroup(room: RoomSlot, examCode: string, group: GroupLabel): boolean {
  return (['A', 'B', 'C', 'D'] as GroupLabel[]).some(
    (currentGroup) =>
      currentGroup !== group && room.assigned[currentGroup].some((student) => student.examCode === examCode)
  );
}

function appendToGroup(room: RoomSlot, group: GroupLabel, bucket: ExamBucket, maxCount: number): number {
  const remainingCapacity = getGroupRemaining(room, group);
  if (remainingCapacity <= 0 || bucket.students.length === 0) return 0;
  if (roomHasExamCodeInOtherGroup(room, bucket.examCode, group)) return 0;

  const take = Math.min(maxCount, remainingCapacity, bucket.students.length);
  if (take <= 0) return 0;

  room.assigned[group].push(...bucket.students.splice(0, take));
  if (bucket.assignedGroup === null) bucket.assignedGroup = group;
  return take;
}

function allocatePrimaryGroup(
  bucket: ExamBucket,
  group: GroupLabel,
  rooms: RoomSlot[],
  startRoom: number
): number {
  let cursor = startRoom;

  while (bucket.students.length > 0 && cursor < rooms.length) {
    const room = rooms[cursor];

    if (getGroupFill(room, group) !== 0 || roomHasExamCode(room, bucket.examCode)) {
      cursor++;
      continue;
    }

    appendToGroup(room, group, bucket, GROUP_CAPACITY[group]);
    cursor++;
  }

  return cursor;
}

function buildMiddleOverflowTargets(roomCount: number): Array<{ roomIndex: number; group: GroupLabel }> {
  const targets: Array<{ roomIndex: number; group: GroupLabel }> = [];

  for (let roomIndex = 0; roomIndex < roomCount; roomIndex++) {
    targets.push({ roomIndex, group: roomIndex % 2 === 0 ? 'C' : 'D' });
  }

  for (let roomIndex = 0; roomIndex < roomCount; roomIndex++) {
    targets.push({ roomIndex, group: roomIndex % 2 === 0 ? 'D' : 'C' });
  }

  return targets;
}

function allocateMiddleOverflow(bucket: ExamBucket, rooms: RoomSlot[]) {
  for (const target of buildMiddleOverflowTargets(rooms.length)) {
    if (bucket.students.length === 0) break;

    const room = rooms[target.roomIndex];
    if (getGroupFill(room, target.group) !== 0) continue;
    if (roomHasExamCode(room, bucket.examCode)) continue;

    appendToGroup(room, target.group, bucket, GROUP_CAPACITY[target.group]);
  }
}

function selectBestBucket(
  buckets: ExamBucket[],
  room: RoomSlot,
  group: GroupLabel,
  space: number
): ExamBucket | null {
  const candidates = buckets.filter(
    (bucket) => bucket.students.length > 0 && !roomHasExamCodeInOtherGroup(room, bucket.examCode, group)
  );

  if (candidates.length === 0) return null;

  const sorter = (a: ExamBucket, b: ExamBucket) => {
    if (b.students.length !== a.students.length) return b.students.length - a.students.length;
    return a.rank - b.rank;
  };

  const fitting = candidates.filter((bucket) => bucket.students.length <= space).sort(sorter);
  if (fitting.length > 0) return fitting[0];

  return [...candidates].sort(sorter)[0];
}

function fillPass(
  buckets: ExamBucket[],
  rooms: RoomSlot[],
  groups: GroupLabel[],
  mode: 'partial' | 'empty'
): boolean {
  let progress = false;

  for (const room of rooms) {
    for (const group of groups) {
      const fill = getGroupFill(room, group);
      const remaining = getGroupRemaining(room, group);
      if (remaining <= 0) continue;
      if (mode === 'partial' && fill === 0) continue;
      if (mode === 'empty' && fill > 0) continue;

      const bucket = selectBestBucket(buckets, room, group, remaining);
      if (!bucket) continue;

      const placed = appendToGroup(room, group, bucket, remaining);
      if (placed > 0) progress = true;
    }
  }

  return progress;
}

function fillAvailableSeats(buckets: ExamBucket[], rooms: RoomSlot[]) {
  let progressed = true;

  while (progressed) {
    progressed = false;

    while (fillPass(buckets, rooms, ['C', 'D'], 'partial')) progressed = true;
    while (fillPass(buckets, rooms, ['A', 'B'], 'partial')) progressed = true;
    while (fillPass(buckets, rooms, ['C', 'D'], 'empty')) progressed = true;
    while (fillPass(buckets, rooms, ['A', 'B'], 'empty')) progressed = true;
  }
}

function hasRemainingStudents(buckets: ExamBucket[]): boolean {
  return buckets.some((bucket) => bucket.students.length > 0);
}

/** Detect & fix adjacency violations by swapping students between cells. */
function hasViolation(grid: (StudentRecord | null)[][], r: number, c: number, rows: number, cols: number): boolean {
  const code = grid[r][c]?.examCode;
  if (!code) return false;
  if (c + 1 < cols && grid[r][c + 1]?.examCode === code) return true;
  if (c - 1 >= 0 && grid[r][c - 1]?.examCode === code) return true;
  if (r + 1 < rows && grid[r + 1][c]?.examCode === code) return true;
  if (r - 1 >= 0 && grid[r - 1][c]?.examCode === code) return true;
  return false;
}

function fixViolations(grid: (StudentRecord | null)[][], rows: number, cols: number, maxPasses = 20) {
  for (let pass = 0; pass < maxPasses; pass++) {
    let fixed = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c]) continue;
        if (!hasViolation(grid, r, c, rows, cols)) continue;
        outer: for (let r2 = 0; r2 < rows; r2++) {
          for (let c2 = 0; c2 < cols; c2++) {
            if (r2 === r && c2 === c) continue;
            const a = grid[r][c]!;
            const b = grid[r2][c2];
            if (!b || b.examCode === a.examCode) continue;
            grid[r][c] = b;
            grid[r2][c2] = a;
            if (!hasViolation(grid, r, c, rows, cols) && !hasViolation(grid, r2, c2, rows, cols)) {
              fixed = true;
              break outer;
            }
            grid[r][c] = a;
            grid[r2][c2] = b;
          }
        }
      }
    }
    if (!fixed) break;
  }
}

export function allocateRooms(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  const { mainColumns, seatsPerColumn } = config;
  const totalCols = mainColumns * seatsPerColumn;
  const rows = 5;

  const buckets = rankExamCodes(students);
  const roomStrength = Math.max(1, Math.min(45, config.studentsPerRoom || 45));
  const initialRoomCount = Math.max(1, Math.ceil(students.length / roomStrength));
  const rooms: RoomSlot[] = Array.from({ length: initialRoomCount }, (_, i) => makeEmptyRoom(i));

  let nextPrimaryGroup: GroupLabel = 'A';
  let primaryCursorA = 0;
  let primaryCursorB = 0;

  // Large codes (>15 students) only go into Group A or B — never the middle (C/D).
  // Middle rows (C/D) are reserved exclusively for small codes (≤15 students).
  for (const bucket of buckets) {
    if (bucket.totalStudents <= 15) continue;

    if (nextPrimaryGroup === 'A') {
      primaryCursorA = allocatePrimaryGroup(bucket, 'A', rooms, primaryCursorA);
    } else {
      primaryCursorB = allocatePrimaryGroup(bucket, 'B', rooms, primaryCursorB);
    }

    // If still has leftovers, spill into the OTHER primary group (A↔B), NOT into C/D.
    if (bucket.students.length > 0) {
      if (nextPrimaryGroup === 'A') {
        primaryCursorB = allocatePrimaryGroup(bucket, 'B', rooms, primaryCursorB);
      } else {
        primaryCursorA = allocatePrimaryGroup(bucket, 'A', rooms, primaryCursorA);
      }
    }

    // Still leftover? Add a fresh room and place into the original primary group there.
    while (bucket.students.length > 0) {
      rooms.push(makeEmptyRoom(rooms.length));
      if (nextPrimaryGroup === 'A') {
        primaryCursorA = allocatePrimaryGroup(bucket, 'A', rooms, rooms.length - 1);
      } else {
        primaryCursorB = allocatePrimaryGroup(bucket, 'B', rooms, rooms.length - 1);
      }
    }

    nextPrimaryGroup = nextPrimaryGroup === 'A' ? 'B' : 'A';
  }

  // Fill middle rows (C/D) and any remaining A/B gaps with SMALL codes only (≤15 students).
  const smallBuckets = buckets.filter((b) => b.totalStudents <= 15);
  fillAvailableSeats(smallBuckets, rooms);

  let extraRooms = 0;
  while (hasRemainingStudents(buckets) && extraRooms < 2) {
    rooms.push(makeEmptyRoom(rooms.length));
    fillAvailableSeats(buckets, rooms);
    extraRooms++;
  }

  while (hasRemainingStudents(buckets)) {
    rooms.push(makeEmptyRoom(rooms.length));
    fillAvailableSeats(buckets, rooms);
  }

  const groupPositions = buildRoomGroupPositions(rows, totalCols);
  const roomAllocations: RoomAllocation[] = [];

  for (const room of rooms) {
    const grid: (StudentRecord | null)[][] = Array.from({ length: rows }, () => Array(totalCols).fill(null));
    const roomStudents: StudentRecord[] = [];

    (['A', 'B', 'C', 'D'] as GroupLabel[]).forEach((group) => {
      const positions = groupPositions[group];
      const groupStudents = room.assigned[group];

      for (let i = 0; i < groupStudents.length && i < positions.length; i++) {
        const [r, c] = positions[i];
        grid[r][c] = groupStudents[i];
        roomStudents.push(groupStudents[i]);
      }
    });

    fixViolations(grid, rows, totalCols);

    roomAllocations.push({
      roomNumber: room.roomIndex + 1,
      students: roomStudents,
      grid,
      totalRows: rows,
      seatsPerRow: totalCols,
    });
  }

  while (roomAllocations.length > 0 && roomAllocations[roomAllocations.length - 1].students.length === 0) {
    roomAllocations.pop();
  }

  roomAllocations.forEach((room, index) => {
    room.roomNumber = index + 1;
  });

  const groupRankings: GroupRanking[] = buckets
    .map((bucket) => ({
      rank: bucket.rank,
      group: (bucket.assignedGroup ?? 'A') as GroupLabel,
      examCode: bucket.examCode,
      totalStudents: bucket.totalStudents,
    }))
    .sort((a, b) => a.rank - b.rank);

  let violations = 0;
  for (const room of roomAllocations) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < totalCols; c++) {
        const cell = room.grid[r][c];
        if (!cell) continue;
        if (c + 1 < totalCols && room.grid[r][c + 1]?.examCode === cell.examCode) violations++;
        if (r + 1 < rows && room.grid[r + 1][c]?.examCode === cell.examCode) violations++;
      }
    }
  }

  return { rooms: roomAllocations, groupRankings, violations };
}
