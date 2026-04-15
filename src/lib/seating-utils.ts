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

/**
 * For a 5×9 grid (3 panels × 3 sub-cols), returns the group label for each cell.
 * 
 * Pattern per panel:
 *   Col:  1  2  3
 *   R1:   A  C  A
 *   R2:   B  D  B
 *   R3:   A  C  A
 *   R4:   B  D  B
 *   R5:   A  C  A
 */
function getGroupForCell(row: number, col: number): GroupLabel {
  const subCol = col % 3; // 0, 1, 2 within a panel
  const isOddDisplayRow = row % 2 === 0; // rows 0,2,4

  if (isOddDisplayRow) {
    // A C B pattern
    if (subCol === 0) return 'A';
    if (subCol === 1) return 'C';
    return 'B';
  } else {
    // B D A pattern
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
 * Rank exam codes by student count descending. A=largest, B=2nd, Middle(C+D)=rest.
 */
function rankExamCodes(students: StudentRecord[]): {
  rankings: GroupRanking[];
  queueA: StudentRecord[];
  queueB: StudentRecord[];
  queueMiddle: StudentRecord[];
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
  const queueMiddle: StudentRecord[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const [code, studs] = sorted[i];
    let group: GroupLabel;
    if (i === 0) {
      group = 'A';
      queueA.push(...studs);
    } else if (i === 1) {
      group = 'B';
      queueB.push(...studs);
    } else {
      group = i % 2 === 0 ? 'D' : 'C';
      queueMiddle.push(...studs);
    }
    rankings.push({
      rank: i + 1,
      group,
      examCode: code,
      totalStudents: studs.length,
    });
  }

  return { rankings, queueA, queueB, queueMiddle };
}

export function allocateRooms(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  const { mainColumns, seatsPerColumn } = config;
  const totalCols = mainColumns * seatsPerColumn;
  const rows = 5;
  const seatsPerRoom = rows * totalCols;

  const { rankings, queueA, queueB, queueMiddle } = rankExamCodes(students);
  const roomsNeeded = Math.ceil(students.length / seatsPerRoom);
  const groupPositions = buildGroupPositions(rows, totalCols);

  const rooms: RoomAllocation[] = [];

  for (let r = 0; r < roomsNeeded; r++) {
    const grid: (StudentRecord | null)[][] = Array.from({ length: rows }, () => Array(totalCols).fill(null));
    const roomStudents: StudentRecord[] = [];

    // Fill A positions
    for (const [row, col] of groupPositions['A']) {
      if (queueA.length === 0) break;
      const student = queueA.shift()!;
      grid[row][col] = student;
      roomStudents.push(student);
    }

    // Fill B positions
    for (const [row, col] of groupPositions['B']) {
      if (queueB.length === 0) break;
      const student = queueB.shift()!;
      grid[row][col] = student;
      roomStudents.push(student);
    }

    // Fill middle: D first then C, from ONE shared queue
    // So an exam code flows from D in room 1 → C in room 2 continuously
    for (const [row, col] of groupPositions['D']) {
      if (queueMiddle.length === 0) break;
      const student = queueMiddle.shift()!;
      grid[row][col] = student;
      roomStudents.push(student);
    }
    for (const [row, col] of groupPositions['C']) {
      if (queueMiddle.length === 0) break;
      const student = queueMiddle.shift()!;
      grid[row][col] = student;
      roomStudents.push(student);
    }

    rooms.push({
      roomNumber: r + 1,
      students: roomStudents,
      grid,
      totalRows: rows,
      seatsPerRow: totalCols,
    });
  }

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

  return { rooms, groupRankings: rankings, violations };
}
  const countMap: Record<string, StudentRecord[]> = {};
  for (const s of students) {
    if (!countMap[s.examCode]) countMap[s.examCode] = [];
    countMap[s.examCode].push(s);
  }

  // Sort each exam code's students by roll number
  for (const code of Object.keys(countMap)) {
    countMap[code].sort((a, b) => {
      const aNum = parseInt(a.rollNumber);
      const bNum = parseInt(b.rollNumber);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.rollNumber.localeCompare(b.rollNumber);
    });
  }

  const sorted = Object.entries(countMap).sort((a, b) => b[1].length - a[1].length);
  const groupLabels: GroupLabel[] = ['A', 'B', 'C', 'D'];
  const rankings: GroupRanking[] = [];
  const groupQueues: Record<GroupLabel, StudentRecord[]> = { A: [], B: [], C: [], D: [] };

  for (let i = 0; i < sorted.length; i++) {
    const [code, studs] = sorted[i];
    const group = groupLabels[i % 4];
    rankings.push({
      rank: i + 1,
      group,
      examCode: code,
      totalStudents: studs.length,
    });
    groupQueues[group].push(...studs);
  }

  return { rankings, groupQueues };
}

export function allocateRooms(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  const { mainColumns, seatsPerColumn } = config;
  const totalCols = mainColumns * seatsPerColumn; // 9
  const rows = 5; // fixed 5 rows
  const seatsPerRoom = rows * totalCols; // 45

  const { rankings, groupQueues } = rankExamCodes(students);
  const roomsNeeded = Math.ceil(students.length / seatsPerRoom);
  const groupPositions = buildGroupPositions(rows, totalCols);

  const rooms: RoomAllocation[] = [];

  for (let r = 0; r < roomsNeeded; r++) {
    const grid: (StudentRecord | null)[][] = Array.from({ length: rows }, () => Array(totalCols).fill(null));
    const roomStudents: StudentRecord[] = [];

    // Fill each group's positions in this room
    for (const group of ['A', 'B', 'C', 'D'] as GroupLabel[]) {
      const positions = groupPositions[group];
      const queue = groupQueues[group];

      for (const [row, col] of positions) {
        if (queue.length === 0) break;
        const student = queue.shift()!;
        grid[row][col] = student;
        roomStudents.push(student);
      }
    }

    rooms.push({
      roomNumber: r + 1,
      students: roomStudents,
      grid,
      totalRows: rows,
      seatsPerRow: totalCols,
    });
  }

  // Count violations (adjacent same exam code)
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

  return { rooms, groupRankings: rankings, violations };
}
