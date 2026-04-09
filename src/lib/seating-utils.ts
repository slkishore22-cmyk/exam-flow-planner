import { allocateRooms as allocateRoomsInternal } from './seating-allocation';

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
  requestedRoomCount?: number;
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

export function allocateRooms(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  return allocateRoomsInternal(students, config);
}
