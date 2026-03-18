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
  // Exact match
  if (FIXED_DEPT_COLORS[dept]) return FIXED_DEPT_COLORS[dept];

  // Normalize and fuzzy match
  const clean = dept.toUpperCase().replace(/\s+/g, '').replace(/\.$/, '');
  for (const [key, value] of Object.entries(FIXED_DEPT_COLORS)) {
    const cleanKey = key.toUpperCase().replace(/\s+/g, '').replace(/\.$/, '');
    if (clean === cleanKey || clean.includes(cleanKey) || cleanKey.includes(clean)) {
      return value;
    }
  }

  // Dynamic assignment for completely unknown departments
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

    // Read degree from page header
    const degreeMatch = pageText.match(
      /Degree\s*[:\-]\s*([A-Z][A-Z0-9.\(\)\[\]\/\s]{1,20}?)\s+Subject/i
    );
    if (degreeMatch) {
      currentDegree = degreeMatch[1].trim().replace(/\s+/g, ' ').toUpperCase();
    }

    // Read Subject exam code from page header (part before first hyphen)
    const subjectMatch = pageText.match(
      /Subject\s*[:\-]\s*([A-Z0-9]{3,8})-/i
    );
    if (subjectMatch) {
      currentExamCode = subjectMatch[1].trim().toUpperCase();
    }

    // Only count declared on Page No 1 of each section
    const isFirstPageOfSection = /Page\s*No\s*[:\-]?\s*1\b/.test(pageText);
    if (isFirstPageOfSection) {
      const declaredMatch = pageText.match(/No\s+of\s+Candidates\s*[:\-]?\s*(\d+)/i);
      if (declaredMatch) {
        declaredCount += parseInt(declaredMatch[1], 10);
      }
    }

    // Extract roll numbers tagged with degree AND exam code
    for (const line of lines) {
      const rollMatch = line.match(/^(\d{1,3})\s+([A-Z]{0,3}\d{5,9})\s+[A-Z]/);
      if (rollMatch) {
        rollNumbers.push({ roll: rollMatch[2], dept: currentDegree, examCode: currentExamCode });
      }
    }
  }

  // Deduplicate by roll number keeping first occurrence
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
  // Group by department
  const deptMap: Record<string, StudentRecord[]> = {};
  for (const s of students) {
    if (!deptMap[s.department]) deptMap[s.department] = [];
    deptMap[s.department].push(s);
  }

  // Sort departments by count descending
  const queues = Object.entries(deptMap)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([, list]) => [...list]);

  // Round robin with rotating index that persists across iterations
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

export function allocateRooms(
  students: StudentRecord[],
  config: RoomConfig
): RoomAllocation[] {
  const { studentsPerRoom, mainColumns, seatsPerColumn } = config;
  const seatsPerRow = mainColumns * seatsPerColumn;
  const totalRooms = Math.ceil(students.length / studentsPerRoom);
  const rooms: RoomAllocation[] = [];

  for (let r = 0; r < totalRooms; r++) {
    const roomStudents = students.slice(r * studentsPerRoom, (r + 1) * studentsPerRoom);
    const totalRows = Math.ceil(roomStudents.length / seatsPerRow);
    const grid: (StudentRecord | null)[][] = [];

    for (let row = 0; row < totalRows; row++) {
      const rowData: (StudentRecord | null)[] = [];
      for (let col = 0; col < seatsPerRow; col++) {
        const index = row * seatsPerRow + col;
        rowData.push(roomStudents[index] || null);
      }
      grid.push(rowData);
    }

    rooms.push({
      roomNumber: r + 1,
      students: roomStudents,
      grid,
      totalRows,
      seatsPerRow,
    });
  }

  return rooms;
}
