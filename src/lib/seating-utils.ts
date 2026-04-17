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

const deptColorMap: Record<string, { bg: string; text: string }> = {};

// Highly distinct palette for exam codes — each color is from a different hue family
// so no two are visually close shades.
const EXAM_CODE_PALETTE: { bg: string; text: string }[] = [
  { bg: '#E53935', text: '#FFFFFF' }, // red
  { bg: '#1E88E5', text: '#FFFFFF' }, // blue
  { bg: '#43A047', text: '#FFFFFF' }, // green
  { bg: '#FDD835', text: '#000000' }, // yellow
  { bg: '#8E24AA', text: '#FFFFFF' }, // purple
  { bg: '#FB8C00', text: '#000000' }, // orange
  { bg: '#00ACC1', text: '#FFFFFF' }, // cyan
  { bg: '#EC407A', text: '#FFFFFF' }, // pink
  { bg: '#3949AB', text: '#FFFFFF' }, // indigo
  { bg: '#6D4C41', text: '#FFFFFF' }, // brown
  { bg: '#00897B', text: '#FFFFFF' }, // teal
  { bg: '#7CB342', text: '#000000' }, // lime
  { bg: '#5E35B1', text: '#FFFFFF' }, // deep purple
  { bg: '#F4511E', text: '#FFFFFF' }, // deep orange
  { bg: '#546E7A', text: '#FFFFFF' }, // blue grey
  { bg: '#C0CA33', text: '#000000' }, // olive
];

const examCodeColorMap: Record<string, { bg: string; text: string }> = {};

export function getExamCodeColor(examCode: string): { bg: string; text: string } {
  if (!examCodeColorMap[examCode]) {
    const idx = Object.keys(examCodeColorMap).length;
    examCodeColorMap[examCode] = EXAM_CODE_PALETTE[idx % EXAM_CODE_PALETTE.length];
  }
  return examCodeColorMap[examCode];
}

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

/**
 * Returns the group label (A | B | C | D) for a given seat position.
 *
 * Pattern (within each main column of `subCols` seats, repeating every 3):
 *   Odd-indexed rows  (0, 2, 4, ...) → A | C | B
 *   Even-indexed rows (1, 3, 5, ...) → B | D | A
 */
export function getGroupLabel(
  row: number,
  col: number,
  subCols: number
): 'A' | 'B' | 'C' | 'D' {
  const sc = col % subCols;
  const isOddRow = row % 2 === 0;
  const oddPattern: ('A' | 'B' | 'C' | 'D')[] = ['A', 'C', 'B'];
  const evenPattern: ('A' | 'B' | 'C' | 'D')[] = ['B', 'D', 'A'];
  return isOddRow ? oddPattern[sc % 3] : evenPattern[sc % 3];
}

// allocateRooms has been moved to ./seating-algorithm.ts as `allocateSeating`.
// Re-exported here for backwards compatibility via a thin wrapper in Index.tsx.

