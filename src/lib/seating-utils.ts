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

// Fixed degree color map
const DEGREE_COLORS: Record<string, { bg: string; text: string }> = {
  'BBA':         { bg: '#1B4332', text: '#FFFFFF' },
  'B.COM.':      { bg: '#1E3A5F', text: '#FFFFFF' },
  'B.SC.':       { bg: '#4A1942', text: '#FFFFFF' },
  'B.A':         { bg: '#7B2D00', text: '#FFFFFF' },
  'MA':          { bg: '#1A3A4A', text: '#FFFFFF' },
  'B.COM.(CS)':  { bg: '#3D1A00', text: '#FFFFFF' },
  'BSC[VC]':     { bg: '#0D3B2E', text: '#FFFFFF' },
  'M.COM.':      { bg: '#2C1654', text: '#FFFFFF' },
  'M.SC.':       { bg: '#4A0E0E', text: '#FFFFFF' },
  'UNKNOWN':     { bg: '#333333', text: '#FFFFFF' },
};

export function getDeptColor(dept: string): { bg: string; text: string } {
  // Exact match first
  if (DEGREE_COLORS[dept]) return DEGREE_COLORS[dept];

  // Fuzzy match for variations
  const normalized = dept.toUpperCase().replace(/\s+/g, '');
  for (const [key, value] of Object.entries(DEGREE_COLORS)) {
    if (normalized.includes(key.replace(/\./g, '').replace(/\s+/g, ''))) {
      return value;
    }
  }

  // Fallback using hash
  const hash = dept.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const fallbacks = ['#1A2E4A', '#2E1A4A', '#4A2E1A', '#1A4A2E', '#4A1A2E'];
  return { bg: fallbacks[hash % fallbacks.length], text: '#FFFFFF' };
}

export async function extractRollNumbersFromPdf(
  file: File,
  onProgress: (page: number, total: number, fileName: string) => void
): Promise<PdfExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const rollNumbers: { roll: string; dept: string }[] = [];
  let declaredCount = 0;
  let currentDegree = 'UNKNOWN';

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

    // Only count declared on Page No 1 of each section
    const isFirstPageOfSection = /Page\s*No\s*[:\-]?\s*1\b/.test(pageText);
    if (isFirstPageOfSection) {
      const declaredMatch = pageText.match(/No\s+of\s+Candidates\s*[:\-]?\s*(\d+)/i);
      if (declaredMatch) {
        declaredCount += parseInt(declaredMatch[1], 10);
      }
    }

    // Extract roll numbers tagged with degree from this page
    for (const line of lines) {
      const rollMatch = line.match(/^(\d{1,3})\s+([A-Z]{0,3}\d{5,9})\s+[A-Z]/);
      if (rollMatch) {
        rollNumbers.push({ roll: rollMatch[2], dept: currentDegree });
      }
    }
  }

  // Deduplicate by roll number keeping first occurrence
  const seen = new Set<string>();
  const uniqueRolls: { roll: string; dept: string }[] = [];
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
