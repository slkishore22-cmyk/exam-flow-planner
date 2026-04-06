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
  isGeneralExam?: boolean;
  roomConfig?: RoomConfig; // per-room config (may differ for general exam rooms)
  roomExamCode?: string; // single exam code for this room (regular rooms)
  roomExamLabel?: string; // display label e.g. "CPZ6B"
}

export type PatternType = 'CRISS_CROSS' | 'CHECKERBOARD';

export interface PatternDecision {
  pattern: PatternType;
  message: string | null;
  violations: number | 'unavoidable';
}

export interface AllocationResult {
  rooms: RoomAllocation[];
  patternDecision: PatternDecision;
}

const DEPT_COLOR_PALETTE = [
  { bg: '#D32F2F', text: '#FFFFFF', name: 'Red' },
  { bg: '#1565C0', text: '#FFFFFF', name: 'Blue' },
  { bg: '#2E7D32', text: '#FFFFFF', name: 'Green' },
  { bg: '#FF6F00', text: '#000000', name: 'Orange' },
  { bg: '#7B1FA2', text: '#FFFFFF', name: 'Purple' },
  { bg: '#00897B', text: '#FFFFFF', name: 'Teal' },
  { bg: '#C2185B', text: '#FFFFFF', name: 'Magenta' },
  { bg: '#0277BD', text: '#FFFFFF', name: 'Sky Blue' },
  { bg: '#827717', text: '#FFFFFF', name: 'Olive' },
  { bg: '#4527A0', text: '#FFFFFF', name: 'Deep Purple' },
  { bg: '#EF6C00', text: '#000000', name: 'Tangerine' },
  { bg: '#00695C', text: '#FFFFFF', name: 'Dark Teal' },
  { bg: '#AD1457', text: '#FFFFFF', name: 'Rose' },
  { bg: '#1565C0', text: '#FFFFFF', name: 'Cobalt' },
  { bg: '#558B2F', text: '#FFFFFF', name: 'Lime' },
];

const FIXED_DEPT_COLORS: Record<string, { bg: string; text: string }> = {
  'BBA':          { bg: '#D32F2F', text: '#FFFFFF' },   // Bold Red
  'B.COM.':       { bg: '#1565C0', text: '#FFFFFF' },   // Blue
  'B.SC.':        { bg: '#2E7D32', text: '#FFFFFF' },   // Green
  'B.A':          { bg: '#FF6F00', text: '#000000' },   // Vivid Orange (was dull amber)
  'MA':           { bg: '#7B1FA2', text: '#FFFFFF' },   // Vivid Purple
  'B.COM.(CS)':   { bg: '#00897B', text: '#FFFFFF' },   // Teal
  'BSC[VC]':      { bg: '#C2185B', text: '#FFFFFF' },   // Magenta (was deep orange — too close to red)
  'M.COM.':       { bg: '#0277BD', text: '#FFFFFF' },   // Sky Blue (was dark pink — too close to red)
  'M.SC.':        { bg: '#827717', text: '#FFFFFF' },   // Olive (was dark teal — too close to teal)
  'B.COM.(CA)':   { bg: '#4527A0', text: '#FFFFFF' },   // Deep Purple (was indigo — too close to blue)
  'UNKNOWN':      { bg: '#424242', text: '#FFFFFF' },
};

const deptColorMap: Record<string, { bg: string; text: string }> = {};

export function getDeptColor(dept: string): { bg: string; text: string } {
  if (FIXED_DEPT_COLORS[dept]) return FIXED_DEPT_COLORS[dept];

  const clean = dept.toUpperCase().replace(/\s+/g, '').replace(/\.$/, '');
  for (const [key, value] of Object.entries(FIXED_DEPT_COLORS)) {
    const cleanKey = key.toUpperCase().replace(/\s+/g, '').replace(/\.$/, '');
    if (clean === cleanKey || clean.includes(cleanKey) || cleanKey.includes(clean)) {
      return value;
    }
  }

  if (!deptColorMap[dept]) {
    const usedColors = Object.values(deptColorMap).map(c => c.bg);
    const available = DEPT_COLOR_PALETTE.filter(c => !usedColors.includes(c.bg));
    deptColorMap[dept] = available.length > 0
      ? available[0]
      : DEPT_COLOR_PALETTE[Object.keys(deptColorMap).length % DEPT_COLOR_PALETTE.length];
  }
  return deptColorMap[dept];
}

// Exam-code-based color assignment — each unique exam code gets a distinct color
const examCodeColorMap: Record<string, { bg: string; text: string }> = {};

export function getExamCodeColor(examCode: string): { bg: string; text: string } {
  if (!examCodeColorMap[examCode]) {
    const usedColors = Object.values(examCodeColorMap).map(c => c.bg);
    const available = DEPT_COLOR_PALETTE.filter(c => !usedColors.includes(c.bg));
    examCodeColorMap[examCode] = available.length > 0
      ? available[0]
      : DEPT_COLOR_PALETTE[Object.keys(examCodeColorMap).length % DEPT_COLOR_PALETTE.length];
  }
  return examCodeColorMap[examCode];
}

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

export function interleaveStudents(students: StudentRecord[]): StudentRecord[] {
  const deptMap: Record<string, StudentRecord[]> = {};
  for (const s of students) {
    if (!deptMap[s.department]) deptMap[s.department] = [];
    deptMap[s.department].push(s);
  }

  const queues = Object.entries(deptMap)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([, list]) => [...list]);

  const result: StudentRecord[] = [];
  let i = 0;

  while (result.length < students.length) {
    let added = false;
    const startI = i;

    do {
      if (queues[i] && queues[i].length > 0) {
        result.push(queues[i].shift()!);
        added = true;
        i = (i + 1) % queues.length;
        break;
      }
      i = (i + 1) % queues.length;
    } while (i !== startI);

    if (!added) break;
  }

  return result;
}

function buildThreePassOrder(rows: number, mainCols: number, subCols: number) {
  const oddPositions: [number, number][] = [];
  const evenPositions: [number, number][] = [];
  const middlePositions: [number, number][] = [];

  for (let mc = 0; mc < mainCols; mc++) {
    const s1 = mc * subCols + 0;
    const s2 = mc * subCols + 1;
    const s3 = mc * subCols + (subCols - 1);

    // ODD positions = S1 odd rows + S3 even rows (zigzag)
    for (let row = 0; row < rows; row++) {
      if (row % 2 === 0) {
        oddPositions.push([row, s1]);  // S1 rows 0,2,4
      } else {
        oddPositions.push([row, s3]);  // S3 rows 1,3
      }
    }

    // EVEN positions = S3 odd rows + S1 even rows (mirror zigzag)
    for (let row = 0; row < rows; row++) {
      if (row % 2 === 0) {
        evenPositions.push([row, s3]);  // S3 rows 0,2,4
      } else {
        evenPositions.push([row, s1]);  // S1 rows 1,3
      }
    }

    // MIDDLE positions = S2 all rows
    for (let row = 0; row < rows; row++) {
      middlePositions.push([row, s2]);
    }
  }

  return { oddPositions, evenPositions, middlePositions };
}

function buildThreeQueues(examGroups: Record<string, StudentRecord[]>) {
  const sorted = Object.entries(examGroups)
    .filter(([, v]) => v.length > 0)
    .sort((a, b) => b[1].length - a[1].length);

  const oddQueue: StudentRecord[] = [];
  const evenQueue: StudentRecord[] = [];
  const midQueue: StudentRecord[] = [];
  const oddCodes = new Set<string>();
  const evenCodes = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const [code, students] = sorted[i];
    if (i % 3 === 0) {
      oddQueue.push(...students);
      oddCodes.add(code);
    } else if (i % 3 === 1) {
      evenQueue.push(...students);
      evenCodes.add(code);
    } else {
      midQueue.push(...students);
    }
  }

  return { oddQueue, evenQueue, midQueue, oddCodes, evenCodes };
}

function buildCheckerboardOrder(rows: number, mainCols: number, subCols: number) {
  const totalCols = mainCols * subCols;
  const aPositions: [number, number][] = [];
  const bPositions: [number, number][] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < totalCols; col++) {
      if ((row + col) % 2 === 0) {
        aPositions.push([row, col]);
      } else {
        bPositions.push([row, col]);
      }
    }
  }

  return { aPositions, bPositions };
}

export function decidePattern(
  examGroups: Record<string, StudentRecord[]>,
  roomsNeeded: number,
  mainCols: number,
  subCols: number,
  rows: number
): PatternDecision {
  const totalSeatsPerRoom = mainCols * subCols * rows;
  const crissCrossAPerRoom = mainCols * rows;
  const checkerboardAPerRoom = Math.ceil(totalSeatsPerRoom / 2);

  const crissCrossATotal = roomsNeeded * crissCrossAPerRoom;
  const checkerboardATotal = roomsNeeded * checkerboardAPerRoom;

  const groupSizes = Object.entries(examGroups)
    .map(([code, students]) => ({ code, count: students.length }))
    .sort((a, b) => b.count - a.count);

  if (groupSizes.length === 0) {
    return { pattern: 'CRISS_CROSS', message: null, violations: 0 };
  }

  const largest = groupSizes[0];

  if (largest.count <= crissCrossATotal) {
    return { pattern: 'CRISS_CROSS', message: null, violations: 0 };
  }

  if (largest.count <= checkerboardATotal) {
    return {
      pattern: 'CHECKERBOARD',
      message: `Pattern auto-switched to Checkerboard because ${largest.code} has ${largest.count.toLocaleString()} students which exceeds Criss Cross capacity of ${crissCrossATotal.toLocaleString()} A seats. Checkerboard provides ${checkerboardATotal.toLocaleString()} A seats.`,
      violations: 0,
    };
  }

  const minRoomsNeeded = Math.ceil(largest.count / checkerboardAPerRoom);
  const extraRoomsNeeded = minRoomsNeeded - roomsNeeded;

  return {
    pattern: 'CHECKERBOARD',
    message: `Warning: ${largest.code} has ${largest.count.toLocaleString()} students. Even Checkerboard cannot fully separate them with ${roomsNeeded} rooms. Need ${minRoomsNeeded} rooms (${extraRoomsNeeded} more).`,
    violations: 'unavoidable',
  };
}

function getNeighborCodes(
  grid: (StudentRecord | null)[][],
  row: number,
  col: number,
  rows: number,
  totalCols: number
): Set<string> {
  const codes = new Set<string>();
  const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of dirs) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < totalCols && grid[nr][nc]) {
      codes.add(grid[nr][nc]!.examCode);
    }
  }
  return codes;
}

function pickBest(pool: StudentRecord[], excludeCodes: Set<string>): StudentRecord | null {
  const byCode: Record<string, StudentRecord[]> = {};
  for (const s of pool) {
    if (!byCode[s.examCode]) byCode[s.examCode] = [];
    byCode[s.examCode].push(s);
  }

  const candidates = Object.entries(byCode)
    .filter(([code]) => !excludeCodes.has(code))
    .sort((a, b) => b[1].length - a[1].length);

  if (candidates.length > 0) {
    const bestCode = candidates[0][0];
    const idx = pool.findIndex(s => s.examCode === bestCode);
    return pool.splice(idx, 1)[0];
  }

  if (pool.length > 0) return pool.shift()!;
  return null;
}

export const GENERAL_EXAM_THRESHOLD = 1000;
export const GENERAL_EXAM_CONFIG: RoomConfig = {
  studentsPerRoom: 30,
  mainColumns: 3,
  seatsPerColumn: 2,
};

function allocateGeneralExamRooms(
  students: StudentRecord[],
  config: RoomConfig,
  startRoomNumber: number
): RoomAllocation[] {
  const { studentsPerRoom, mainColumns, seatsPerColumn } = config;
  const totalCols = mainColumns * seatsPerColumn;
  const rows = Math.ceil(studentsPerRoom / totalCols);
  const roomsNeeded = Math.ceil(students.length / studentsPerRoom);
  const rooms: RoomAllocation[] = [];

  // Sort by roll number
  const sorted = [...students].sort((a, b) => {
    const aNum = parseInt(a.rollNumber);
    const bNum = parseInt(b.rollNumber);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.rollNumber.localeCompare(b.rollNumber);
  });

  for (let r = 0; r < roomsNeeded; r++) {
    const start = r * studentsPerRoom;
    const roomStudents = sorted.slice(start, start + studentsPerRoom);
    const grid: (StudentRecord | null)[][] = Array.from({ length: rows }, () => Array(totalCols).fill(null));

    let idx = 0;
    for (let row = 0; row < rows && idx < roomStudents.length; row++) {
      for (let col = 0; col < totalCols && idx < roomStudents.length; col++) {
        grid[row][col] = roomStudents[idx++];
      }
    }

    rooms.push({
      roomNumber: startRoomNumber + r,
      students: roomStudents,
      grid,
      totalRows: rows,
      seatsPerRow: totalCols,
      isGeneralExam: true,
      roomConfig: config,
    });
  }

  return rooms;
}

// Sentinel record for VACANT seats
const VACANT_STUDENT: StudentRecord = {
  rollNumber: '—',
  department: '',
  examCode: 'VACANT',
  sourcePdf: '',
};

export function allocateRooms(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  // Split: exam codes with >=GENERAL_EXAM_THRESHOLD students → general exam rooms
  const examCounts: Record<string, StudentRecord[]> = {};
  for (const s of students) {
    if (!examCounts[s.examCode]) examCounts[s.examCode] = [];
    examCounts[s.examCode].push(s);
  }

  const generalStudents: StudentRecord[] = [];
  const regularStudents: StudentRecord[] = [];
  for (const [code, list] of Object.entries(examCounts)) {
    if (list.length >= GENERAL_EXAM_THRESHOLD) {
      generalStudents.push(...list);
    } else {
      regularStudents.push(...list);
    }
  }

  // Allocate general exam rooms first
  const generalRooms = generalStudents.length > 0
    ? allocateGeneralExamRooms(generalStudents, GENERAL_EXAM_CONFIG, 1)
    : [];

  const regularStartRoom = generalRooms.length + 1;

  if (regularStudents.length === 0) {
    return {
      rooms: generalRooms,
      patternDecision: { pattern: 'CRISS_CROSS', message: generalRooms.length > 0 ? `All ${generalStudents.length} students belong to general exam codes (≥${GENERAL_EXAM_THRESHOLD}). Allocated in ${generalRooms.length} general exam rooms (30/room, no adjacency restriction).` : null, violations: 0 },
    };
  }

  const { mainColumns, seatsPerColumn } = config;
  const totalCols = mainColumns * seatsPerColumn;
  const rows = Math.ceil(config.studentsPerRoom / totalCols);

  // Odd columns (0-indexed): first sub-column of each main column = 0, 3, 6
  const oddCols: number[] = [];
  for (let mc = 0; mc < mainColumns; mc++) {
    oddCols.push(mc * seatsPerColumn); // col 0, 3, 6
  }
  const oddSeatsPerRow = oddCols.length; // 3
  const totalOddSeats = oddSeatsPerRow * rows; // 15

  // Pattern: alternate 9 and 6 students per room
  // Room A: 3 rows × 3 odd cols = 9
  // Room B: 2 rows × 3 odd cols = 6
  const patternA = oddSeatsPerRow * 3; // 9
  const patternB = oddSeatsPerRow * 2; // 6

  // Group regular students by exam code, sorted by roll number
  const regularExamGroups: Record<string, StudentRecord[]> = {};
  for (const s of regularStudents) {
    if (!regularExamGroups[s.examCode]) regularExamGroups[s.examCode] = [];
    regularExamGroups[s.examCode].push(s);
  }
  for (const code of Object.keys(regularExamGroups)) {
    regularExamGroups[code].sort((a, b) => {
      const aNum = parseInt(a.rollNumber);
      const bNum = parseInt(b.rollNumber);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.rollNumber.localeCompare(b.rollNumber);
    });
  }

  // Sort exam codes by count descending for stable ordering
  const sortedCodes = Object.entries(regularExamGroups)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([code]) => code);

  const rooms: RoomAllocation[] = [];
  let roomNumber = regularStartRoom;

  for (const examCode of sortedCodes) {
    const queue = [...regularExamGroups[examCode]];
    let isFirstRoom = true; // alternates: true=9, false=6

    while (queue.length > 0) {
      const capacity = isFirstRoom ? patternA : patternB;
      const roomStudents = queue.splice(0, capacity);

      // Build grid: full rows × totalCols, only odd cols get students
      const grid: (StudentRecord | null)[][] = Array.from({ length: rows }, () => Array(totalCols).fill(null));

      let idx = 0;
      // Fill order: row by row, only odd columns
      const rowsToFill = isFirstRoom ? 3 : 2;
      for (let r = 0; r < rowsToFill && idx < roomStudents.length; r++) {
        for (const col of oddCols) {
          if (idx < roomStudents.length) {
            grid[r][col] = roomStudents[idx++];
          }
        }
      }

      // Fill remaining odd seats in this room with VACANT
      for (let r = 0; r < rows; r++) {
        for (const col of oddCols) {
          if (grid[r][col] === null) {
            grid[r][col] = { ...VACANT_STUDENT };
          }
        }
      }

      rooms.push({
        roomNumber,
        students: roomStudents,
        grid,
        totalRows: rows,
        seatsPerRow: totalCols,
        isGeneralExam: false,
        roomConfig: config,
        roomExamCode: examCode,
        roomExamLabel: `${examCode} (${roomStudents.length} students)`,
      });

      roomNumber++;
      isFirstRoom = !isFirstRoom;
    }
  }

  // Build pattern decision message
  let message: string | null = null;
  if (generalRooms.length > 0) {
    const generalCodes = [...new Set(generalStudents.map(s => s.examCode))].join(', ');
    message = `${generalStudents.length} students from general exam code(s) [${generalCodes}] allocated to ${generalRooms.length} separate rooms (30/room). `;
  }
  const totalRegularRooms = rooms.length;
  const examCodeCount = sortedCodes.length;
  message = (message || '') + `${regularStudents.length} regular students across ${examCodeCount} exam codes allocated to ${totalRegularRooms} rooms (1 exam per room, 9→6 pattern).`;

  return {
    rooms: [...generalRooms, ...rooms],
    patternDecision: { pattern: 'CRISS_CROSS', message, violations: 0 },
  };
}
