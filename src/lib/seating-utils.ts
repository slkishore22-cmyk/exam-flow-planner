declare const pdfjsLib: any;

export interface StudentRecord {
  rollNumber: string;
  department: string;
  sourcePdf: string;
}

export interface PdfExtractionResult {
  fileName: string;
  rollNumbers: string[];
  declaredCount: number | null;
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

// Dark rich colors for departments
const DEPT_COLORS: { bg: string; text: string }[] = [
  { bg: '#1B4332', text: '#FFFFFF' },  // Deep forest green
  { bg: '#1E3A5F', text: '#FFFFFF' },  // Deep navy blue
  { bg: '#4A1942', text: '#FFFFFF' },  // Deep purple
  { bg: '#7B2D00', text: '#FFFFFF' },  // Deep burnt orange
  { bg: '#1A3A4A', text: '#FFFFFF' },  // Deep teal
  { bg: '#3D1A00', text: '#FFFFFF' },  // Deep brown
  { bg: '#0D3B2E', text: '#FFFFFF' },  // Dark emerald
  { bg: '#2C1654', text: '#FFFFFF' },  // Deep violet
  { bg: '#4A0E0E', text: '#FFFFFF' },  // Deep crimson
  { bg: '#1A2E1A', text: '#FFFFFF' },  // Dark olive
  { bg: '#003366', text: '#FFFFFF' },  // Royal blue
  { bg: '#4A3000', text: '#FFFFFF' },  // Dark gold
  { bg: '#2D4A00', text: '#FFFFFF' },  // Dark lime
  { bg: '#4A0030', text: '#FFFFFF' },  // Deep magenta
  { bg: '#002B36', text: '#FFFFFF' },  // Dark cyan
];

// Stable department list for consistent color assignment
let knownDepts: string[] = [];

export function resetDeptColors() {
  knownDepts = [];
}

export function getDeptColor(dept: string): { bg: string; text: string } {
  if (!knownDepts.includes(dept)) {
    knownDepts.push(dept);
  }
  const index = knownDepts.indexOf(dept) % DEPT_COLORS.length;
  return DEPT_COLORS[index];
}

export function detectDepartment(rollNumber: string): string {
  const match = rollNumber.match(/^([A-Z]+)/);
  if (match) {
    return match[1];
  }
  if (/^\d+$/.test(rollNumber) && rollNumber.length >= 5) {
    return rollNumber.substring(2, 5);
  }
  return 'GEN';
}

export async function extractRollNumbersFromPdf(
  file: File,
  onProgress: (page: number, total: number, fileName: string) => void
): Promise<PdfExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const rollNumbers: string[] = [];
  let declaredCount: number | null = null;

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

    const lines = sortedYs.map(y => {
      return rows[y]
        .sort((a, b) => a.x - b.x)
        .map(item => item.text)
        .join(' ');
    });

    for (const line of lines) {
      const declaredMatch = line.match(/No of Candidates\s*[:\-]?\s*(\d+)/i);
      if (declaredMatch) {
        declaredCount = (declaredCount || 0) + parseInt(declaredMatch[1], 10);
      }

      const rollMatch = line.match(/^(\d{1,3})\s+([A-Z]{0,3}\d{5,9})\s+[A-Z]/);
      if (rollMatch) {
        rollNumbers.push(rollMatch[2]);
      }
    }
  }

  return {
    fileName: file.name,
    rollNumbers,
    declaredCount,
    extractedCount: rollNumbers.length,
  };
}

export function deduplicateStudents(
  results: PdfExtractionResult[]
): StudentRecord[] {
  const seen = new Set<string>();
  const students: StudentRecord[] = [];
  
  for (const result of results) {
    for (const rn of result.rollNumbers) {
      if (!seen.has(rn)) {
        seen.add(rn);
        students.push({
          rollNumber: rn,
          department: detectDepartment(rn),
          sourcePdf: result.fileName,
        });
      }
    }
  }
  
  return students;
}

export function interleaveStudents(students: StudentRecord[]): StudentRecord[] {
  // Step 1: Group by department
  const deptMap: Record<string, StudentRecord[]> = {};
  for (const s of students) {
    if (!deptMap[s.department]) deptMap[s.department] = [];
    deptMap[s.department].push(s);
  }

  // Step 2: Sort departments by size largest first
  const queues = Object.entries(deptMap)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([, list]) => [...list]);

  // Step 3: Round robin interleave
  const interleaved: StudentRecord[] = [];
  let hasStudents = true;

  while (hasStudents) {
    hasStudents = false;
    for (const queue of queues) {
      if (queue.length > 0) {
        interleaved.push(queue.shift()!);
        hasStudents = true;
      }
    }
  }

  return interleaved;
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
