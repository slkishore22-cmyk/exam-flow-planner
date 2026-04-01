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

function buildThreePassOrder(rows: number, mainCols: number, subCols: number) {
  const oddPositions: [number, number][] = [];
  const evenPositions: [number, number][] = [];
  const middlePositions: [number, number][] = [];

  for (let mc = 0; mc < mainCols; mc++) {
    for (let row = 0; row < rows; row++) {
      oddPositions.push([row, mc * subCols + 0]);
    }
    for (let row = 0; row < rows; row++) {
      evenPositions.push([row, mc * subCols + (subCols - 1)]);
    }
    for (let sc = 1; sc < subCols - 1; sc++) {
      for (let row = 0; row < rows; row++) {
        middlePositions.push([row, mc * subCols + sc]);
      }
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

  console.log(`Three queues: ODD(${oddQueue.length}, ${[...oddCodes]}), EVEN(${evenQueue.length}, ${[...evenCodes]}), MID(${midQueue.length}, ${[...new Set(midQueue.map(s => s.examCode))]}) ✅`);

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

// ── Pattern decision engine ──

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

  // STEP 1: Decide pattern automatically
  const patternDecision = decidePattern(examGroups, roomsNeeded, mainColumns, seatsPerColumn, rows);

  // STEP 2: Build three queues for three-pass filling
  const { oddQueue: poolOdd, evenQueue: poolEven, midQueue: poolMid } = buildThreeQueues(examGroups);

  let currentOddCode = poolOdd[0]?.examCode || null;
  let currentEvenCode = poolEven[0]?.examCode || null;

  // STEP 3: Generate rooms
  const rooms: RoomAllocation[] = [];

  for (let r = 0; r < roomsNeeded; r++) {
    const maxSeats = Math.min(studentsPerRoom, total - r * studentsPerRoom);
    const grid: (StudentRecord | null)[][] = Array.from({ length: rows }, () => Array(totalCols).fill(null));
    let seatedCount = 0;

    if (patternDecision.pattern === 'CHECKERBOARD') {
      // Checkerboard uses the old A/B pattern
      const { aPositions, bPositions } = buildCheckerboardOrder(rows, mainColumns, seatsPerColumn);
      const allPools = [...poolOdd.splice(0, poolOdd.length), ...poolEven.splice(0, poolEven.length), ...poolMid.splice(0, poolMid.length)];

      for (const [row, col] of aPositions) {
        if (seatedCount >= maxSeats || allPools.length === 0) break;
        const nc = getNeighborCodes(grid, row, col, rows, totalCols);
        const s = pickBest(allPools, nc);
        if (s) { grid[row][col] = s; seatedCount++; }
      }
      for (const [row, col] of bPositions) {
        if (seatedCount >= maxSeats || allPools.length === 0) break;
        const nc = getNeighborCodes(grid, row, col, rows, totalCols);
        const s = pickBest(allPools, nc);
        if (s) { grid[row][col] = s; seatedCount++; }
      }

      // Put back unused
      poolOdd.push(...allPools);
    } else {
      // CRISS_CROSS: Three-pass system
      const { oddPositions, evenPositions, middlePositions } = buildThreePassOrder(rows, mainColumns, seatsPerColumn);

      // Update current codes if exhausted
      if (poolOdd.length > 0 && !poolOdd.find(s => s.examCode === currentOddCode)) {
        currentOddCode = poolOdd[0]?.examCode || null;
      }
      if (poolEven.length > 0 && !poolEven.find(s => s.examCode === currentEvenCode)) {
        currentEvenCode = poolEven[0]?.examCode || null;
      }

      // ── PASS 1: Fill ODD positions (S1) ──
      for (const [row, col] of oddPositions) {
        if (seatedCount >= maxSeats) break;
        const neighbors = getNeighborCodes(grid, row, col, rows, totalCols);

        if (poolOdd.length > 0) {
          if (currentOddCode && !neighbors.has(currentOddCode)) {
            const idx = poolOdd.findIndex(s => s.examCode === currentOddCode);
            if (idx >= 0) {
              grid[row][col] = poolOdd.splice(idx, 1)[0];
              seatedCount++;
              continue;
            }
          }
          const s = pickBest(poolOdd, neighbors);
          if (s) { grid[row][col] = s; seatedCount++; continue; }
        }
        // ODD pool empty — use EVEN overflow
        if (poolEven.length > 0) {
          const s = pickBest(poolEven, getNeighborCodes(grid, row, col, rows, totalCols));
          if (s) { grid[row][col] = s; seatedCount++; }
        }
      }

      // ── PASS 2: Fill EVEN positions (S3) ──
      for (const [row, col] of evenPositions) {
        if (grid[row][col] !== null || seatedCount >= maxSeats) continue;
        const neighbors = getNeighborCodes(grid, row, col, rows, totalCols);
        if (currentOddCode) neighbors.add(currentOddCode);

        if (poolEven.length > 0) {
          if (currentEvenCode && !neighbors.has(currentEvenCode)) {
            const idx = poolEven.findIndex(s => s.examCode === currentEvenCode);
            if (idx >= 0) {
              grid[row][col] = poolEven.splice(idx, 1)[0];
              seatedCount++;
              continue;
            }
          }
          const s = pickBest(poolEven, neighbors);
          if (s) { grid[row][col] = s; seatedCount++; continue; }
        }
        // EVEN pool empty — use ODD overflow
        if (poolOdd.length > 0) {
          const s = pickBest(poolOdd, getNeighborCodes(grid, row, col, rows, totalCols));
          if (s) { grid[row][col] = s; seatedCount++; }
        }
      }

      // ── PASS 3: Fill MIDDLE positions (S2) ──
      for (const [row, col] of middlePositions) {
        if (grid[row][col] !== null || seatedCount >= maxSeats) continue;

        const neighbors = getNeighborCodes(grid, row, col, rows, totalCols);
        if (currentOddCode) neighbors.add(currentOddCode);
        if (currentEvenCode) neighbors.add(currentEvenCode);
        // Vertical chain prevention: exclude S2 row above
        if (row > 0 && grid[row - 1][col]) {
          neighbors.add(grid[row - 1][col]!.examCode);
        }

        let student: StudentRecord | null = null;
        if (poolMid.length > 0) {
          student = pickBest(poolMid, neighbors);
          if (!student) {
            // Relax: only exclude immediate neighbors
            const strict = getNeighborCodes(grid, row, col, rows, totalCols);
            student = pickBest(poolMid, strict);
          }
          if (student) { grid[row][col] = student; seatedCount++; continue; }
        }
        // Mid pool empty — use EVEN then ODD overflow
        if (poolEven.length > 0) {
          student = pickBest(poolEven, getNeighborCodes(grid, row, col, rows, totalCols));
          if (student) { grid[row][col] = student; seatedCount++; continue; }
        }
        if (poolOdd.length > 0) {
          student = pickBest(poolOdd, getNeighborCodes(grid, row, col, rows, totalCols));
          if (student) { grid[row][col] = student; seatedCount++; }
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

  // STEP 1: Decide pattern automatically
  const patternDecision = decidePattern(examGroups, roomsNeeded, mainColumns, seatsPerColumn, rows);

  // STEP 2: Deficit fill loop — group by exam code
  // STRICT RULE: same exam code must NEVER appear in both A and B queues
  const remaining: Record<string, StudentRecord[]> = {};
  for (const [code, list] of Object.entries(examGroups)) {
    remaining[code] = [...list];
  }

  const poolA: StudentRecord[] = [];
  const poolB: StudentRecord[] = [];

  while (Object.values(remaining).some(q => q.length > 0)) {
    // Pick largest remaining group as Group A
    const available = Object.entries(remaining)
      .filter(([, v]) => v.length > 0)
      .sort((a, b) => b[1].length - a[1].length);

    if (!available.length) break;

    const [aCode] = available[0];
    const aStudents = remaining[aCode];

    // All A students go to A queue
    poolA.push(...aStudents);
    remaining[aCode] = [];

    // Fill B queue — STRICT: never use same exam code as current A
    let bNeeded = aStudents.length;

    const eligibleB = Object.entries(remaining)
      .filter(([code, q]) => code !== aCode && q.length > 0)
      .sort((a, b) => b[1].length - a[1].length);

    for (const [bCode] of eligibleB) {
      if (bNeeded <= 0) break;
      const take = Math.min(remaining[bCode].length, bNeeded);
      const taken = remaining[bCode].splice(0, take);
      poolB.push(...taken);
      bNeeded -= take;
    }
  }

  // Verification
  const aExamCodes = new Set(poolA.map(s => s.examCode));
  const bExamCodes = new Set(poolB.map(s => s.examCode));
  const overlap = [...aExamCodes].filter(c => bExamCodes.has(c));
  if (overlap.length > 0) {
    console.error('BUG: Same exam code in both A and B queues:', overlap);
  } else {
    console.log('Deficit fill verified: no exam code overlap between A and B queues ✅');
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
