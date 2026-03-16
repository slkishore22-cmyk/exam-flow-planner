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
}

// Pastel colors for departments
const DEPT_COLORS = [
  'hsl(210, 80%, 92%)',  // blue
  'hsl(340, 80%, 92%)',  // pink
  'hsl(120, 60%, 90%)',  // green
  'hsl(45, 90%, 90%)',   // yellow
  'hsl(270, 70%, 92%)',  // purple
  'hsl(180, 60%, 90%)',  // teal
  'hsl(15, 80%, 92%)',   // peach
  'hsl(200, 70%, 90%)',  // sky
  'hsl(330, 60%, 92%)',  // rose
  'hsl(90, 60%, 90%)',   // lime
  'hsl(250, 60%, 92%)',  // lavender
  'hsl(30, 80%, 90%)',   // orange
];

const deptColorMap: Record<string, string> = {};
let colorIndex = 0;

export function getDeptColor(dept: string): string {
  if (!deptColorMap[dept]) {
    deptColorMap[dept] = DEPT_COLORS[colorIndex % DEPT_COLORS.length];
    colorIndex++;
  }
  return deptColorMap[dept];
}

export function detectDepartment(rollNumber: string): string {
  const match = rollNumber.match(/^([A-Z]+)/);
  if (match) {
    return match[1];
  }
  // Pure numeric — University of Madras: positions 3-5 (0-indexed: chars at index 2,3,4)
  if (/^\d+$/.test(rollNumber) && rollNumber.length >= 5) {
    return rollNumber.substring(2, 5);
  }
  return 'GEN';
}

function extractRollNumbersFromText(text: string): string[] {
  const results: string[] = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(
      /^(\d{1,3})\s+([A-Z]{0,3}\d{5,9})\s+[A-Z]/
    );
    if (match) {
      results.push(match[2]);
    }
  }
  return results;
}

export async function extractRollNumbersFromPdf(
  file: File,
  onProgress: (page: number, total: number, fileName: string) => void
): Promise<PdfExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  
  let allText = '';
  let declaredCount: number | null = null;
  
  for (let i = 1; i <= totalPages; i++) {
    onProgress(i, totalPages, file.name);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(' ');
    allText += pageText + '\n';
    
    // Try to find declared count in first 2 pages
    if (i <= 2 && declaredCount === null) {
      const countMatch = pageText.match(/No\.?\s*of\s*Candidates\s*[:\-]?\s*(\d+)/i);
      if (countMatch) {
        declaredCount = parseInt(countMatch[1], 10);
      }
    }
  }
  
  const allRollNumbers = extractRollNumbersFromText(allText);
  
  return {
    fileName: file.name,
    rollNumbers: allRollNumbers,
    declaredCount,
    extractedCount: allRollNumbers.length,
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
  // Group by department
  const groups: Record<string, StudentRecord[]> = {};
  for (const s of students) {
    if (!groups[s.department]) groups[s.department] = [];
    groups[s.department].push(s);
  }
  
  // Sort queues largest first
  const queues = Object.values(groups).sort((a, b) => b.length - a.length);
  
  const result: StudentRecord[] = [];
  let hasMore = true;
  
  while (hasMore) {
    hasMore = false;
    for (const q of queues) {
      if (q.length > 0) {
        result.push(q.shift()!);
        hasMore = true;
      }
    }
  }
  
  return result;
}

export function allocateRooms(
  students: StudentRecord[],
  roomStrength: number
): RoomAllocation[] {
  const rooms: RoomAllocation[] = [];
  const totalRooms = Math.ceil(students.length / roomStrength);
  
  for (let i = 0; i < totalRooms; i++) {
    rooms.push({
      roomNumber: i + 1,
      students: students.slice(i * roomStrength, (i + 1) * roomStrength),
    });
  }
  
  return rooms;
}
