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

interface ExamBucket {
  rank: number;
  examCode: string;
  totalStudents: number;
  students: StudentRecord[];
  preferredGroup: GroupLabel;
  assignedGroup: GroupLabel | null;
}

interface LaneState {
  currentBucket: ExamBucket | null;
  preferredGroup: GroupLabel;
  allowUntouchedBorrow: boolean;
  allowExcludedFallback: boolean;
}

const GROUP_CYCLE: GroupLabel[] = ['A', 'B', 'D', 'C'];

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
 * Post-processing: swap students within a room's grid to eliminate adjacency violations.
 * Tries up to maxPasses full scans. Each violation found triggers a search for a safe swap partner.
 */
function fixViolations(grid: (StudentRecord | null)[][], rows: number, totalCols: number, maxPasses = 20) {
  for (let pass = 0; pass < maxPasses; pass++) {
    let fixed = false;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < totalCols; c++) {
        const cell = grid[r][c];
        if (!cell) continue;

        if (!hasAdjacentViolation(grid, r, c, rows, totalCols)) continue;

        // Find a swap partner that resolves this violation without creating new ones
        const swapped = findAndSwap(grid, r, c, rows, totalCols);
        if (swapped) fixed = true;
      }
    }

    if (!fixed) break; // No more violations fixable
  }
}

function hasAdjacentViolation(grid: (StudentRecord | null)[][], r: number, c: number, rows: number, totalCols: number): boolean {
  const code = grid[r][c]?.examCode;
  if (!code) return false;
  if (c + 1 < totalCols && grid[r][c + 1]?.examCode === code) return true;
  if (c - 1 >= 0 && grid[r][c - 1]?.examCode === code) return true;
  if (r + 1 < rows && grid[r + 1]?.[c]?.examCode === code) return true;
  if (r - 1 >= 0 && grid[r - 1]?.[c]?.examCode === code) return true;
  return false;
}

function wouldCauseViolation(grid: (StudentRecord | null)[][], r: number, c: number, examCode: string, rows: number, totalCols: number): boolean {
  if (c + 1 < totalCols && grid[r][c + 1]?.examCode === examCode) return true;
  if (c - 1 >= 0 && grid[r][c - 1]?.examCode === examCode) return true;
  if (r + 1 < rows && grid[r + 1]?.[c]?.examCode === examCode) return true;
  if (r - 1 >= 0 && grid[r - 1]?.[c]?.examCode === examCode) return true;
  return false;
}

function findAndSwap(grid: (StudentRecord | null)[][], r1: number, c1: number, rows: number, totalCols: number): boolean {
  const cellA = grid[r1][c1]!;

  for (let r2 = 0; r2 < rows; r2++) {
    for (let c2 = 0; c2 < totalCols; c2++) {
      if (r2 === r1 && c2 === c1) continue;
      const cellB = grid[r2][c2];
      if (!cellB) continue;
      if (cellB.examCode === cellA.examCode) continue; // Same code swap is useless

      // Check if swapping would fix violations without creating new ones
      // Temporarily swap
      grid[r1][c1] = cellB;
      grid[r2][c2] = cellA;

      const aOk = !hasAdjacentViolation(grid, r1, c1, rows, totalCols);
      const bOk = !hasAdjacentViolation(grid, r2, c2, rows, totalCols);

      if (aOk && bOk) {
        return true; // Swap is good, keep it
      }

      // Revert
      grid[r1][c1] = cellA;
      grid[r2][c2] = cellB;
    }
  }

  return false;
}

/**
 * Rank exam codes by student count descending.
 */
function rankExamCodes(students: StudentRecord[]): ExamBucket[] {
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
  return sorted.map(([code, studs], index) => ({
    rank: index + 1,
    examCode: code,
    totalStudents: studs.length,
    students: [...studs],
    preferredGroup: GROUP_CYCLE[index % GROUP_CYCLE.length],
    assignedGroup: null,
  }));
}

function assignBucketGroup(bucket: ExamBucket, group: GroupLabel) {
  if (bucket.assignedGroup === null) {
    bucket.assignedGroup = group;
  }
}

function pickBucketForLane(
  buckets: ExamBucket[],
  lane: LaneState,
  excludedExamCodes: Set<string>
): ExamBucket | null {
  const strategies: Array<(bucket: ExamBucket) => boolean> = [
    (bucket) => bucket.students.length > 0 && bucket.preferredGroup === lane.preferredGroup && !excludedExamCodes.has(bucket.examCode),
    (bucket) => bucket.students.length > 0 && bucket.assignedGroup !== null && !excludedExamCodes.has(bucket.examCode),
  ];

  if (lane.allowUntouchedBorrow) {
    strategies.push((bucket) => bucket.students.length > 0 && bucket.assignedGroup === null && !excludedExamCodes.has(bucket.examCode));
  }

  if (lane.allowExcludedFallback) {
    strategies.push(
      (bucket) => bucket.students.length > 0 && bucket.preferredGroup === lane.preferredGroup,
      (bucket) => bucket.students.length > 0 && bucket.assignedGroup !== null,
    );

    if (lane.allowUntouchedBorrow) {
      strategies.push((bucket) => bucket.students.length > 0 && bucket.assignedGroup === null);
    }

    strategies.push((bucket) => bucket.students.length > 0);
  }

  for (const strategy of strategies) {
    const bucket = buckets.find(strategy);
    if (bucket) {
      return bucket;
    }
  }

  return null;
}

function takeLaneStudents(
  positions: [number, number][],
  lane: LaneState,
  actualGroup: GroupLabel,
  buckets: ExamBucket[],
  excludedExamCodes: Set<string>
): StudentRecord[] {
  const laneStudents: StudentRecord[] = [];

  while (laneStudents.length < positions.length) {
    if (lane.currentBucket && lane.currentBucket.students.length === 0) {
      lane.currentBucket = null;
    }

    if (!lane.currentBucket) {
      lane.currentBucket = pickBucketForLane(buckets, lane, excludedExamCodes);
    }

    if (!lane.currentBucket) {
      break;
    }

    assignBucketGroup(lane.currentBucket, actualGroup);

    const needed = positions.length - laneStudents.length;
    laneStudents.push(...lane.currentBucket.students.splice(0, needed));

    if (lane.currentBucket.students.length === 0) {
      lane.currentBucket = null;
    }
  }

  return laneStudents;
}

export function allocateRooms(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  const { mainColumns, seatsPerColumn } = config;
  const totalCols = mainColumns * seatsPerColumn;
  const rows = 5;

  const rankedBuckets = rankExamCodes(students);
  const groupPositions = buildGroupPositions(rows, totalCols);
  const { oddRowPositions, evenRowPositions } = buildMiddlePositionsByParity(rows, mainColumns, seatsPerColumn);

  const laneA: LaneState = {
    currentBucket: null,
    preferredGroup: 'A',
    allowUntouchedBorrow: true,
    allowExcludedFallback: true,
  };
  const laneB: LaneState = {
    currentBucket: null,
    preferredGroup: 'B',
    allowUntouchedBorrow: true,
    allowExcludedFallback: true,
  };
  const laneD: LaneState = {
    currentBucket: null,
    preferredGroup: 'D',
    allowUntouchedBorrow: true,
    allowExcludedFallback: false,
  };
  const laneC: LaneState = {
    currentBucket: null,
    preferredGroup: 'C',
    allowUntouchedBorrow: true,
    allowExcludedFallback: false,
  };

  const rooms: RoomAllocation[] = [];
  let roomIndex = 0;

  const hasPending = () => rankedBuckets.some((bucket) => bucket.students.length > 0);

  while (hasPending()) {
    const grid: (StudentRecord | null)[][] = Array.from({ length: rows }, () => Array(totalCols).fill(null));
    const roomStudents: StudentRecord[] = [];

    // Track all codes placed by each lane in this room
    const placedCodesA = new Set<string>();
    const placedCodesB = new Set<string>();
    const placedCodesD = new Set<string>();
    const placedCodesC = new Set<string>();

    const lanePlans: Array<{
      actualGroup: GroupLabel;
      getExcludedCodes: () => string[];
      lane: LaneState;
      positions: [number, number][];
      placedCodes: Set<string>;
    }> = [
      {
        lane: laneA,
        positions: [...groupPositions['A']],
        actualGroup: 'A',
        placedCodes: placedCodesA,
        getExcludedCodes: () => [...placedCodesB, ...placedCodesD, ...placedCodesC],
      },
      {
        lane: laneB,
        positions: [...groupPositions['B']],
        actualGroup: 'B',
        placedCodes: placedCodesB,
        getExcludedCodes: () => [...placedCodesA, ...placedCodesD, ...placedCodesC],
      },
      {
        lane: laneD,
        positions: roomIndex % 2 === 0 ? [...evenRowPositions] : [...oddRowPositions],
        actualGroup: roomIndex % 2 === 0 ? 'D' : 'C',
        placedCodes: placedCodesD,
        getExcludedCodes: () => [...placedCodesA, ...placedCodesB, ...placedCodesC],
      },
      {
        lane: laneC,
        positions: roomIndex % 2 === 0 ? [...oddRowPositions] : [...evenRowPositions],
        actualGroup: roomIndex % 2 === 0 ? 'C' : 'D',
        placedCodes: placedCodesC,
        getExcludedCodes: () => [...placedCodesA, ...placedCodesB, ...placedCodesD],
      },
    ];

    for (const { lane, positions, actualGroup, getExcludedCodes, placedCodes } of lanePlans) {
      const laneStudents = takeLaneStudents(
        positions,
        lane,
        actualGroup,
        rankedBuckets,
        new Set(getExcludedCodes())
      );
      // Track which codes this lane placed
      for (const s of laneStudents) placedCodes.add(s.examCode);
      fillPositions(positions, laneStudents, grid, roomStudents);
    }

    // Post-process: swap students to fix any adjacency violations
    fixViolations(grid, rows, totalCols);

    rooms.push({
      roomNumber: roomIndex + 1,
      students: roomStudents,
      grid,
      totalRows: rows,
      seatsPerRow: totalCols,
    });

    roomIndex++;
  }

  const groupRankings: GroupRanking[] = rankedBuckets.map((bucket) => ({
    rank: bucket.rank,
    group: bucket.assignedGroup ?? bucket.preferredGroup,
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
    groupRankings: groupRankings.sort((a, b) => a.rank - b.rank),
    violations,
  };
}
