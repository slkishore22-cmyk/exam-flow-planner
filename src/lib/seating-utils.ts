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

// Maximum color distance palette for unknown departments
const DEPT_COLOR_PALETTE = [
  { bg: '#D32F2F', text: '#FFFFFF', name: 'Red' },
  { bg: '#1565C0', text: '#FFFFFF', name: 'Blue' },
  { bg: '#2E7D32', text: '#FFFFFF', name: 'Green' },
  { bg: '#F57F17', text: '#000000', name: 'Amber' },
  { bg: '#6A1B9A', text: '#FFFFFF', name: 'Purple' },
  { bg: '#00838F', text: '#FFFFFF', name: 'Cyan' },
  { bg: '#BF360C', text: '#FFFFFF', name: 'Deep Orange' },
  { bg: '#283593', text: '#FFFFFF', name: 'Indigo' },
  { bg: '#558B2F', text: '#FFFFFF', name: 'Olive Green' },
  { bg: '#E91E63', text: '#FFFFFF', name: 'Pink' },
  { bg: '#004D40', text: '#FFFFFF', name: 'Teal' },
  { bg: '#E65100', text: '#FFFFFF', name: 'Burnt Orange' },
  { bg: '#880E4F', text: '#FFFFFF', name: 'Dark Pink' },
  { bg: '#1A237E', text: '#FFFFFF', name: 'Deep Navy' },
  { bg: '#33691E', text: '#FFFFFF', name: 'Dark Lime' },
];

// Fixed color assignments for known University of Madras departments
const FIXED_DEPT_COLORS: Record<string, { bg: string; text: string }> = {
  'BBA':          { bg: '#D32F2F', text: '#FFFFFF' },
  'B.COM.':       { bg: '#1565C0', text: '#FFFFFF' },
  'B.SC.':        { bg: '#2E7D32', text: '#FFFFFF' },
  'B.A':          { bg: '#F57F17', text: '#000000' },
  'MA':           { bg: '#6A1B9A', text: '#FFFFFF' },
  'B.COM.(CS)':   { bg: '#00838F', text: '#FFFFFF' },
  'BSC[VC]':      { bg: '#BF360C', text: '#FFFFFF' },
  'M.COM.':       { bg: '#880E4F', text: '#FFFFFF' },
  'M.SC.':        { bg: '#004D40', text: '#FFFFFF' },
  'B.COM.(CA)':   { bg: '#283593', text: '#FFFFFF' },
  'UNKNOWN':      { bg: '#424242', text: '#FFFFFF' },
};

// Dynamic color map for unknown departments
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

// ── Pattern builders ──

function buildCrissCrossOrder(rows: number, mainCols: number, subCols: number) {
  const aPositions: [number, number][] = [];
  const bS1S3Positions: [number, number][] = []; // S1 and S3 fill FIRST
  const bS2Positions: [number, number][] = [];   // S2 fills LAST

  for (let mc = 0; mc < mainCols; mc++) {
    // A positions: zigzag down S1 and S3
    for (let row = 0; row < rows; row++) {
      const col = mc * subCols + (row % 2 === 0 ? 0 : subCols - 1);
      aPositions.push([row, col]);
    }

    // B S1 even rows (rows 1, 3) — fill FIRST
    for (let row = 0; row < rows; row++) {
      if (row % 2 !== 0) {
        bS1S3Positions.push([row, mc * subCols + 0]);
      }
    }

    // B S3 odd rows (rows 0, 2, 4) — fill FIRST
    for (let row = 0; row < rows; row++) {
      if (row % 2 === 0) {
        bS1S3Positions.push([row, mc * subCols + (subCols - 1)]);
      }
    }

    // B S2 all rows — fill LAST
    for (let row = 0; row < rows; row++) {
      bS2Positions.push([row, mc * subCols + 1]);
    }
  }

  return { aPositions, bS1S3Positions, bS2Positions };
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

// ── Pattern decision engine ──

export function decidePattern(
  examGroups: Record<string, StudentRecord[]>,
  roomsNeeded: number,
  mainCols: number,
  subCols: number,
  rows: number
): PatternDecision {
  const totalSeatsPerRoom = mainCols * subCols * rows;

  // Criss Cross A seats per room: mainCols * rows (one A seat per row per main column)
  const crissCrossAPerRoom = mainCols * Math.ceil(rows / 2) + mainCols * Math.floor(rows / 2);
  // Checkerboard A seats per room: ceil(totalSeats / 2)
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
  const largestCount = largest.count;
  const largestCode = largest.code;

  if (largestCount <= crissCrossATotal) {
    return { pattern: 'CRISS_CROSS', message: null, violations: 0 };
  }

  if (largestCount <= checkerboardATotal) {
    return {
      pattern: 'CHECKERBOARD',
      message: `Pattern auto-switched to Checkerboard because ${largestCode} has ${largestCount.toLocaleString()} students which exceeds Criss Cross capacity of ${crissCrossATotal.toLocaleString()} A seats. Checkerboard provides ${checkerboardATotal.toLocaleString()} A seats. Zero violations guaranteed.`,
      violations: 0,
    };
  }

  const minRoomsNeeded = Math.ceil(largestCount / checkerboardAPerRoom);
  const extraRoomsNeeded = minRoomsNeeded - roomsNeeded;

  return {
    pattern: 'CHECKERBOARD',
    message: `Warning: ${largestCode} has ${largestCount.toLocaleString()} students. Even Checkerboard cannot fully separate them with ${roomsNeeded} rooms. Need ${minRoomsNeeded} rooms (${extraRoomsNeeded} more) for zero violations. Using Checkerboard to minimize violations.`,
    violations: 'unavoidable',
  };
}

// ── Allocation helpers ──

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

// ── Main allocation function ──

export function allocateRooms(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  const { studentsPerRoom, mainColumns, seatsPerColumn } = config;
  const totalCols = mainColumns * seatsPerColumn;
  const rows = Math.ceil(studentsPerRoom / totalCols);

  // Group all students by EXAM CODE
  const examGroups: Record<string, StudentRecord[]> = {};
  for (const s of students) {
    if (!examGroups[s.examCode]) examGroups[s.examCode] = [];
    examGroups[s.examCode].push(s);
  }

  // Sort each exam code group by roll number ascending
  for (const code of Object.keys(examGroups)) {
    examGroups[code].sort((a, b) => {
      const aNum = parseInt(a.rollNumber);
      const bNum = parseInt(b.rollNumber);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.rollNumber.localeCompare(b.rollNumber);
    });
  }

  const total = students.length;
  const roomsNeeded = Math.ceil(total / studentsPerRoom);

  // STEP 2: Deficit fill loop — group by exam code
  const sortedCodes = Object.entries(examGroups)
    .map(([code, list]) => ({ code, students: [...list] }))
    .sort((a, b) => b.students.length - a.students.length);

  const poolA: StudentRecord[] = [];
  const poolB: StudentRecord[] = [];

  if (sortedCodes.length > 0) {
    const aGroup = sortedCodes.shift()!;
    poolA.push(...aGroup.students);
    let aRemaining = aGroup.students.length;

    while (sortedCodes.length > 0 && aRemaining > 0) {
      const bGroup = sortedCodes.shift()!;
      poolB.push(...bGroup.students);
      aRemaining -= bGroup.students.length;
    }

    for (const group of sortedCodes) {
      poolB.push(...group.students);
    }
  }

  let currentACode = poolA.length > 0 ? poolA[0].examCode : null;
  let lastS2Code: string | null = null;

  // STEP 3: Generate rooms with decided pattern
  const rooms: RoomAllocation[] = [];

  for (let r = 0; r < roomsNeeded; r++) {
    const maxSeats = Math.min(studentsPerRoom, total - r * studentsPerRoom);
    const grid: (StudentRecord | null)[][] = Array.from({ length: rows }, () => Array(totalCols).fill(null));
    let seatedCount = 0;

    // Get fill order based on pattern
    let aPositions: [number, number][];
    let bS1S3Positions: [number, number][];
    let bS2Positions: [number, number][];

    if (patternDecision.pattern === 'CHECKERBOARD') {
      aPositions = [];
      bS1S3Positions = [];
      bS2Positions = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < totalCols; col++) {
          if ((row + col) % 2 === 0) aPositions.push([row, col]);
          else bS1S3Positions.push([row, col]);
        }
      }
    } else {
      const order = buildCrissCrossOrder(rows, mainColumns, seatsPerColumn);
      aPositions = order.aPositions;
      bS1S3Positions = order.bS1S3Positions;
      bS2Positions = order.bS2Positions;
    }

    // Update current A code to largest remaining
    if (poolA.length > 0) {
      const countByCode: Record<string, number> = {};
      for (const s of poolA) {
        countByCode[s.examCode] = (countByCode[s.examCode] || 0) + 1;
      }
      currentACode = Object.keys(countByCode)
        .sort((a, b) => countByCode[b] - countByCode[a])[0];
    } else {
      currentACode = null;
    }

    // FILL STEP 1: A positions (zigzag)
    for (const [row, col] of aPositions) {
      if (seatedCount >= maxSeats) break;
      const neighborCodes = getNeighborCodes(grid, row, col, rows, totalCols);

      if (poolA.length > 0) {
        if (currentACode && !neighborCodes.has(currentACode)) {
          const idx = poolA.findIndex(s => s.examCode === currentACode);
          if (idx >= 0) {
            grid[row][col] = poolA.splice(idx, 1)[0];
            seatedCount++;
            continue;
          }
        }
        const altA = pickBest(poolA, neighborCodes);
        if (altA) {
          grid[row][col] = altA;
          seatedCount++;
          continue;
        }
      }

      // A pool empty — fill from B pool, never leave empty
      if (poolB.length > 0) {
        const nc = getNeighborCodes(grid, row, col, rows, totalCols);
        const fromB = pickBest(poolB, nc);
        if (fromB) {
          grid[row][col] = fromB;
          seatedCount++;
        }
      }
    }

    // FILL STEP 2: S1 and S3 B positions FIRST
    for (const [row, col] of bS1S3Positions) {
      if (grid[row][col] !== null) continue;
      if (seatedCount >= maxSeats) break;

      const neighborCodes = getNeighborCodes(grid, row, col, rows, totalCols);
      if (currentACode) neighborCodes.add(currentACode);

      if (poolB.length > 0) {
        const student = pickBest(poolB, neighborCodes);
        if (student) {
          grid[row][col] = student;
          seatedCount++;
          continue;
        }
      }
      if (poolA.length > 0) {
        const nc = getNeighborCodes(grid, row, col, rows, totalCols);
        const fromA = pickBest(poolA, nc);
        if (fromA) {
          grid[row][col] = fromA;
          seatedCount++;
        }
      }
    }

    // FILL STEP 3: S2 positions LAST — rotate code between rooms
    for (const [row, col] of bS2Positions) {
      if (grid[row][col] !== null) continue;
      if (seatedCount >= maxSeats) break;

      const neighborCodes = getNeighborCodes(grid, row, col, rows, totalCols);

      // Exclude current A code AND last room's S2 code to force rotation
      const excludeForS2 = new Set(neighborCodes);
      if (currentACode) excludeForS2.add(currentACode);
      if (lastS2Code) excludeForS2.add(lastS2Code);

      if (poolB.length > 0) {
        let student = pickBest(poolB, excludeForS2);
        if (!student) {
          // Relax rotation constraint — just avoid neighbors + A code
          const relaxed = new Set(neighborCodes);
          if (currentACode) relaxed.add(currentACode);
          student = pickBest(poolB, relaxed);
        }
        if (student) {
          if (row === 0 && col === 1) {
            lastS2Code = student.examCode;
          }
          grid[row][col] = student;
          seatedCount++;
          continue;
        }
      }
      if (poolA.length > 0) {
        const nc = getNeighborCodes(grid, row, col, rows, totalCols);
        const fromA = pickBest(poolA, nc);
        if (fromA) {
          grid[row][col] = fromA;
          seatedCount++;
        }
      }
    }

    const roomStudents = grid.flat().filter((s): s is StudentRecord => s !== null);

    rooms.push({
      roomNumber: r + 1,
      students: roomStudents,
      grid,
      totalRows: rows,
      seatsPerRow: totalCols,
    });
  }

  return { rooms, patternDecision };
}
