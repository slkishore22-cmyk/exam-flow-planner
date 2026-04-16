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

function getRoomLoad(room: RoomSlot): number {
  return (['A', 'B', 'C', 'D'] as GroupLabel[]).reduce(
    (total, group) => total + room.assigned[group].length,
    0
  );
}

function getRemainingCapacity(room: RoomSlot, group: GroupLabel): number {
  return GROUP_CAPACITY[group] - room.assigned[group].length;
}

function assignStudentsToGroup(
  room: RoomSlot,
  group: GroupLabel,
  bucket: ExamBucket,
  count: number
): number {
  if (count <= 0) return 0;

  const taken = bucket.students.splice(0, count);
  if (taken.length === 0) return 0;

  room.assigned[group].push(...taken);
  if (bucket.assignedGroup === null) bucket.assignedGroup = group;

  return taken.length;
}

/**
 * Allocate big exam codes into fresh A/B room blocks only.
 * Each new big code starts in a fresh room block, never mid-block.
 */
function allocatePrimarySideBlocks(buckets: ExamBucket[], rooms: RoomSlot[]) {
  const bigBuckets = buckets.filter((bucket) => bucket.totalStudents > 9);
  let freshStart = 0;
  let index = 0;

  while (freshStart < rooms.length && index < bigBuckets.length) {
    const bucketA = bigBuckets[index++] ?? null;
    const bucketB = index < bigBuckets.length ? bigBuckets[index++] : null;

    const roomsNeededA = bucketA ? Math.ceil(bucketA.students.length / GROUP_CAPACITY.A) : 0;
    const roomsNeededB = bucketB ? Math.ceil(bucketB.students.length / GROUP_CAPACITY.B) : 0;
    const blockSize = Math.min(
      rooms.length - freshStart,
      Math.max(roomsNeededA, roomsNeededB, 1)
    );

    for (let offset = 0; offset < blockSize; offset++) {
      const room = rooms[freshStart + offset];

      if (bucketA && bucketA.students.length > 0) {
        assignStudentsToGroup(
          room,
          'A',
          bucketA,
          Math.min(getRemainingCapacity(room, 'A'), bucketA.students.length)
        );
      }

      if (bucketB && bucketB.students.length > 0) {
        assignStudentsToGroup(
          room,
          'B',
          bucketB,
          Math.min(getRemainingCapacity(room, 'B'), bucketB.students.length)
        );
      }
    }

    freshStart += blockSize;
  }
}

function fillBucket(
  bucket: ExamBucket,
  rooms: RoomSlot[],
  groupOrder: GroupLabel[]
): boolean {
  let placed = false;
  let safety = 10000;

  while (bucket.students.length > 0 && safety-- > 0) {
    const sortedRooms = [...rooms].sort(
      (a, b) => getRoomLoad(a) - getRoomLoad(b) || a.roomIndex - b.roomIndex
    );
    let placedInPass = false;

    for (const group of groupOrder) {
      for (const room of sortedRooms) {
        const capacity = getRemainingCapacity(room, group);
        if (capacity <= 0) continue;

        const assigned = assignStudentsToGroup(
          room,
          group,
          bucket,
          Math.min(capacity, bucket.students.length)
        );

        if (assigned > 0) {
          placed = true;
          placedInPass = true;
          break;
        }
      }

      if (placedInPass) break;
    }

    if (!placedInPass) break;
  }

  return placed;
}

/**
 * Remaining fill rules:
 * - Small exam codes (≤9) prefer C/D first.
 * - While any small code is still pending, big codes can use only A/B.
 * - Once all small codes are exhausted, big codes may also use C/D.
 * - Never create more rooms than the computed total room count.
 */
function fillRemaining(buckets: ExamBucket[], rooms: RoomSlot[]) {
  let safety = 10000;

  while (buckets.some((bucket) => bucket.students.length > 0) && safety-- > 0) {
    const smallLeft = buckets.some(
      (bucket) => bucket.students.length > 0 && bucket.totalStudents <= 9
    );
    let placedAny = false;

    const remainingBuckets = buckets
      .filter((bucket) => bucket.students.length > 0)
      .sort((a, b) => b.students.length - a.students.length || a.rank - b.rank);

    for (const bucket of remainingBuckets) {
      const isSmall = bucket.totalStudents <= 9;
      const groupOrder: GroupLabel[] = isSmall
        ? ['C', 'D', 'A', 'B']
        : smallLeft
          ? ['A', 'B']
          : ['A', 'B', 'C', 'D'];

      if (fillBucket(bucket, rooms, groupOrder)) {
        placedAny = true;
      }
    }

    if (!placedAny) break;
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
  const totalStudents = students.length;
  const roomStrength = Math.max(1, Math.min(config.studentsPerRoom || 45, 45));
  const targetRoomCount = Math.max(1, Math.ceil(totalStudents / roomStrength));
  const rooms: RoomSlot[] = Array.from({ length: targetRoomCount }, (_, i) => makeEmptyRoom(i));

  allocatePrimarySideBlocks(buckets, rooms);
  fillRemaining(buckets, rooms);

  const groupPositions = buildRoomGroupPositions(rows, totalCols);
  const roomAllocations: RoomAllocation[] = [];

  for (const room of rooms) {
    const grid: (StudentRecord | null)[][] = Array.from({ length: rows }, () => Array(totalCols).fill(null));
    const roomStudents: StudentRecord[] = [];

    (['A', 'B', 'C', 'D'] as GroupLabel[]).forEach((g) => {
      const positions = groupPositions[g];
      const studs = room.assigned[g];
      for (let i = 0; i < studs.length && i < positions.length; i++) {
        const [r, c] = positions[i];
        grid[r][c] = studs[i];
        roomStudents.push(studs[i]);
      }
    });

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
