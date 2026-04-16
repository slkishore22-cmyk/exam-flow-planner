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

const EXAM_CODE_COLORS = [
  { bg: '#D32F2F', text: '#FFFFFF' },
  { bg: '#1565C0', text: '#FFFFFF' },
  { bg: '#2E7D32', text: '#FFFFFF' },
  { bg: '#FF6F00', text: '#000000' },
  { bg: '#7B1FA2', text: '#FFFFFF' },
  { bg: '#00897B', text: '#FFFFFF' },
  { bg: '#C2185B', text: '#FFFFFF' },
  { bg: '#0277BD', text: '#FFFFFF' },
  { bg: '#827717', text: '#FFFFFF' },
  { bg: '#4527A0', text: '#FFFFFF' },
  { bg: '#EF6C00', text: '#000000' },
  { bg: '#00695C', text: '#FFFFFF' },
  { bg: '#AD1457', text: '#FFFFFF' },
  { bg: '#558B2F', text: '#FFFFFF' },
  { bg: '#424242', text: '#FFFFFF' },
];

const examCodeColorMap: Record<string, { bg: string; text: string }> = {};

export function getExamCodeColor(examCode: string): { bg: string; text: string } {
  if (!examCodeColorMap[examCode]) {
    const usedColors = Object.values(examCodeColorMap).map(c => c.bg);
    const available = EXAM_CODE_COLORS.filter(c => !usedColors.includes(c.bg));
    examCodeColorMap[examCode] = available.length > 0
      ? available[0]
      : EXAM_CODE_COLORS[Object.keys(examCodeColorMap).length % EXAM_CODE_COLORS.length];
  }
  return examCodeColorMap[examCode];
}

// Group display colors (for the grid cells)
export const GROUP_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: '#1D1D1F', text: '#FFFFFF' },
  B: { bg: '#3A3A3C', text: '#FFFFFF' },
  C: { bg: '#6E6E73', text: '#FFFFFF' },
  D: { bg: '#AEAEB2', text: '#000000' },
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

type GroupLabel = 'A' | 'B' | 'C' | 'D';

interface MiddleExamBucket {
  rank: number;
  examCode: string;
  totalStudents: number;
  students: StudentRecord[];
  initialGroup: 'C' | 'D' | null;
}

/**
 * For a 5×9 grid (3 panels × 3 sub-cols), returns the group label for each cell.
 * 
 * Pattern per panel:
 *   Col:  1  2  3
 *   R1:   A  C  B
 *   R2:   B  D  A
 *   R3:   A  C  B
 *   R4:   B  D  A
 *   R5:   A  C  B
 */
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

/**
 * Build ordered seat positions for each group (top-to-bottom, left-to-right).
 */
function buildGroupPositions(rows: number, totalCols: number): Record<GroupLabel, [number, number][]> {
  const positions: Record<GroupLabel, [number, number][]> = { A: [], B: [], C: [], D: [] };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < totalCols; c++) {
      const group = getGroupForCell(r, c);
      positions[group].push([r, c]);
    }
  }

  return positions;
}

/**
 * Build middle column positions split by row parity.
 * oddRowPositions = S2 on rows 0,2,4 (C group rows) — 9 seats
 * evenRowPositions = S2 on rows 1,3 (D group rows) — 6 seats
 */
function buildMiddlePositionsByParity(rows: number, mainColumns: number, seatsPerColumn: number): {
  oddRowPositions: [number, number][];  // rows 0,2,4
  evenRowPositions: [number, number][]; // rows 1,3
} {
  const oddRowPositions: [number, number][] = [];
  const evenRowPositions: [number, number][] = [];

  for (let mc = 0; mc < mainColumns; mc++) {
    const s2 = mc * seatsPerColumn + 1; // middle sub-column
    for (let r = 0; r < rows; r++) {
      if (r % 2 === 0) {
        oddRowPositions.push([r, s2]);
      } else {
        evenRowPositions.push([r, s2]);
      }
    }
  }

  return { oddRowPositions, evenRowPositions };
}

function fillPositions(
  positions: [number, number][],
  source: StudentRecord[],
  grid: (StudentRecord | null)[][],
  roomStudents: StudentRecord[]
) {
  for (const [row, col] of positions) {
    if (source.length === 0) break;
    const student = source.shift()!;
    grid[row][col] = student;
    roomStudents.push(student);
  }
}

/**
 * Rank exam codes by student count descending.
 */
function rankExamCodes(students: StudentRecord[]): {
  rankings: GroupRanking[];
  queueA: StudentRecord[];
  queueB: StudentRecord[];
  middleBuckets: MiddleExamBucket[];
} {
  const countMap: Record<string, StudentRecord[]> = {};
  for (const s of students) {
    if (!countMap[s.examCode]) countMap[s.examCode] = [];
    countMap[s.examCode].push(s);
  }

  for (const code of Object.keys(countMap)) {
    countMap[code].sort((a, b) => {
      const aNum = parseInt(a.rollNumber);
      const bNum = parseInt(b.rollNumber);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.rollNumber.localeCompare(b.rollNumber);
    });
  }

  const sorted = Object.entries(countMap).sort((a, b) => b[1].length - a[1].length);
  const rankings: GroupRanking[] = [];
  const queueA: StudentRecord[] = [];
  const queueB: StudentRecord[] = [];
  const middleBuckets: MiddleExamBucket[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const [code, studs] = sorted[i];
    if (i === 0) {
      queueA.push(...studs);
      rankings.push({ rank: i + 1, group: 'A', examCode: code, totalStudents: studs.length });
    } else if (i === 1) {
      queueB.push(...studs);
      rankings.push({ rank: i + 1, group: 'B', examCode: code, totalStudents: studs.length });
    } else {
      middleBuckets.push({
        rank: i + 1,
        examCode: code,
        totalStudents: studs.length,
        students: [...studs],
        initialGroup: null,
      });
    }
  }

  return { rankings, queueA, queueB, middleBuckets };
}

export function allocateRooms(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  const { mainColumns, seatsPerColumn } = config;
  const totalCols = mainColumns * seatsPerColumn;
  const rows = 5;

  const { rankings: topRankings, queueA, queueB, middleBuckets } = rankExamCodes(students);
  const groupPositions = buildGroupPositions(rows, totalCols);
  const { oddRowPositions, evenRowPositions } = buildMiddlePositionsByParity(rows, mainColumns, seatsPerColumn);

  const rooms: RoomAllocation[] = [];
  let nextMiddleBucketIndex = 0;
  let roomIndex = 0;

  // Track the current middle bucket being consumed
  let currentMiddleBucket: MiddleExamBucket | null = null;
  // Track which parity set this bucket started on
  let currentBucketStartedOnEven = true; // first bucket starts on even rows (D)

  const hasPendingMiddle = () =>
    nextMiddleBucketIndex < middleBuckets.length || currentMiddleBucket !== null;

  while (queueA.length > 0 || queueB.length > 0 || hasPendingMiddle()) {
    const grid: (StudentRecord | null)[][] = Array.from({ length: rows }, () => Array(totalCols).fill(null));
    const roomStudents: StudentRecord[] = [];

    // Fill A and B groups
    fillPositions([...groupPositions['A']], queueA, grid, roomStudents);
    fillPositions([...groupPositions['B']], queueB, grid, roomStudents);

    // Determine which parity set to fill first for this room
    // Even-indexed rooms: fill even rows (D) first, then odd rows (C)
    // Odd-indexed rooms: fill odd rows (C) first, then even rows (D)
    const primaryPositions = roomIndex % 2 === 0 ? [...evenRowPositions] : [...oddRowPositions];
    const secondaryPositions = roomIndex % 2 === 0 ? [...oddRowPositions] : [...evenRowPositions];
    const primaryCapacity = primaryPositions.length;
    const secondaryCapacity = secondaryPositions.length;

    // Fill PRIMARY middle positions
    // Try to use current bucket first, then pull new buckets
    const primaryQueue: StudentRecord[] = [];
    while (primaryQueue.length < primaryCapacity) {
      if (!currentMiddleBucket && nextMiddleBucketIndex < middleBuckets.length) {
        currentMiddleBucket = middleBuckets[nextMiddleBucketIndex++];
        currentBucketStartedOnEven = roomIndex % 2 === 0;
        currentMiddleBucket.initialGroup = roomIndex % 2 === 0 ? 'D' : 'C';
      }
      if (!currentMiddleBucket) break;

      const needed = primaryCapacity - primaryQueue.length;
      const batch = currentMiddleBucket.students.splice(0, needed);
      primaryQueue.push(...batch);

      if (currentMiddleBucket.students.length === 0) {
        currentMiddleBucket = null;
      }
    }
    fillPositions(primaryPositions, primaryQueue, grid, roomStudents);

    // Fill SECONDARY middle positions with DIFFERENT exam codes
    const secondaryQueue: StudentRecord[] = [];
    // If currentMiddleBucket is still active (same code), skip it for secondary
    // and pull next buckets
    const savedBucket = currentMiddleBucket;
    const savedStartedOnEven = currentBucketStartedOnEven;

    // Use a separate stream for secondary positions
    let secBucketIndex = nextMiddleBucketIndex;
    let tempSecBucket: MiddleExamBucket | null = null;

    while (secondaryQueue.length < secondaryCapacity) {
      if (!tempSecBucket && secBucketIndex < middleBuckets.length) {
        tempSecBucket = middleBuckets[secBucketIndex++];
      }
      if (!tempSecBucket) break;

      const needed = secondaryCapacity - secondaryQueue.length;
      const batch = tempSecBucket.students.splice(0, needed);
      secondaryQueue.push(...batch);

      if (tempSecBucket.students.length === 0) {
        tempSecBucket = null;
      }
    }

    // Update the global index
    nextMiddleBucketIndex = secBucketIndex;
    // If tempSecBucket still has students, it becomes the next current bucket
    if (tempSecBucket && tempSecBucket.students.length > 0) {
      // Push remaining back - actually we consumed from the array directly
      // so we need to handle this differently
    }

    fillPositions(secondaryPositions, secondaryQueue, grid, roomStudents);

    rooms.push({
      roomNumber: roomIndex + 1,
      students: roomStudents,
      grid,
      totalRows: rows,
      seatsPerRow: totalCols,
    });

    roomIndex++;
  }

  const middleRankings: GroupRanking[] = middleBuckets.map((bucket) => ({
    rank: bucket.rank,
    group: bucket.initialGroup ?? 'D',
    examCode: bucket.examCode,
    totalStudents: bucket.totalStudents,
  }));

  // Count violations
  let violations = 0;
  for (const room of rooms) {
    for (let ri = 0; ri < rows; ri++) {
      for (let ci = 0; ci < totalCols; ci++) {
        const cell = room.grid[ri][ci];
        if (!cell) continue;
        if (ci + 1 < totalCols && room.grid[ri][ci + 1]?.examCode === cell.examCode) violations++;
        if (ri + 1 < rows && room.grid[ri + 1]?.[ci]?.examCode === cell.examCode) violations++;
      }
    }
  }

  return {
    rooms,
    groupRankings: [...topRankings, ...middleRankings].sort((a, b) => a.rank - b.rank),
    violations,
  };
}
