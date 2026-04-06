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

export type SeatGroup = 'A' | 'B' | 'C' | 'D';

export interface RoomAllocation {
  roomNumber: number;
  students: StudentRecord[];
  grid: (StudentRecord | null)[][];
  totalRows: number;
  seatsPerRow: number;
}

export interface RankingEntry {
  rank: number;
  group: SeatGroup;
  examCode: string;
  totalStudents: number;
}

export interface AllocationResult {
  rooms: RoomAllocation[];
  rankingTable: RankingEntry[];
  examToGroup: Record<string, SeatGroup>;
}

// ─── Fixed room dimensions ───
const ROWS = 5;
const COLS = 9;
const SEATS_PER_ROOM = 45;

// ─── Group colors ───
export const GROUP_COLORS: Record<SeatGroup, { bg: string; text: string }> = {
  A: { bg: '#1D1D1F', text: '#FFFFFF' },
  B: { bg: '#3A3A3C', text: '#FFFFFF' },
  C: { bg: '#6E6E73', text: '#FFFFFF' },
  D: { bg: '#AEAEB2', text: '#000000' },
};

export const EMPTY_CELL_COLOR = '#F5F5F7';

// ─── Determine group from grid position ───
export function getGroup(row: number, col: number): SeatGroup {
  const panelCol = col % 3;
  const isMiddle = panelCol === 1;
  const isOddRow = row % 2 === 0; // rows 0,2,4 are "odd" (1,3,5 in 1-indexed)

  if (isOddRow && !isMiddle) return 'A';
  if (!isOddRow && !isMiddle) return 'B';
  if (isOddRow && isMiddle) return 'C';
  return 'D';
}

// ─── Get fill-order positions for a group ───
function getGroupPositions(group: SeatGroup): [number, number][] {
  const positions: [number, number][] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (getGroup(row, col) === group) {
        positions.push([row, col]);
      }
    }
  }
  return positions;
}

// Seats per room per group
const GROUP_SEATS: Record<SeatGroup, number> = {
  A: 18,
  B: 12,
  C: 9,
  D: 6,
};

// ─── Rank exam codes by student count descending ───
function rankExamCodes(students: StudentRecord[]): { examCode: string; count: number; group: SeatGroup }[] {
  const counts: Record<string, number> = {};
  for (const s of students) {
    counts[s.examCode] = (counts[s.examCode] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const groups: SeatGroup[] = ['A', 'B', 'C', 'D'];
  return sorted.map(([code, count], i) => ({
    examCode: code,
    count,
    group: groups[i % 4],
  }));
}

// ─── Main allocation ───
export function allocateRooms(
  students: StudentRecord[],
  _config: RoomConfig
): AllocationResult {
  if (students.length === 0) {
    return { rooms: [], rankingTable: [], examToGroup: {} };
  }

  const ranking = rankExamCodes(students);

  // Map exam code → group
  const examToGroup: Record<string, SeatGroup> = {};
  for (const r of ranking) {
    examToGroup[r.examCode] = r.group;
  }

  // Build queues per group (sorted by roll number within each exam code)
  const byExam: Record<string, StudentRecord[]> = {};
  for (const s of students) {
    if (!byExam[s.examCode]) byExam[s.examCode] = [];
    byExam[s.examCode].push(s);
  }
  for (const code of Object.keys(byExam)) {
    byExam[code].sort((a, b) => {
      const aNum = parseInt(a.rollNumber);
      const bNum = parseInt(b.rollNumber);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.rollNumber.localeCompare(b.rollNumber);
    });
  }

  const groupQueues: Record<SeatGroup, StudentRecord[]> = { A: [], B: [], C: [], D: [] };
  // Add in ranking order so exam codes within same group stay together
  for (const r of ranking) {
    if (byExam[r.examCode]) {
      groupQueues[r.group].push(...byExam[r.examCode]);
    }
  }

  // Compute rooms needed: max across groups
  const roomsNeeded = Math.max(
    1,
    Math.ceil(groupQueues.A.length / GROUP_SEATS.A),
    Math.ceil(groupQueues.B.length / GROUP_SEATS.B),
    Math.ceil(groupQueues.C.length / GROUP_SEATS.C),
    Math.ceil(groupQueues.D.length / GROUP_SEATS.D),
    Math.ceil(students.length / SEATS_PER_ROOM),
  );

  // Precompute positions
  const positions: Record<SeatGroup, [number, number][]> = {
    A: getGroupPositions('A'),
    B: getGroupPositions('B'),
    C: getGroupPositions('C'),
    D: getGroupPositions('D'),
  };

  const queueIdx: Record<SeatGroup, number> = { A: 0, B: 0, C: 0, D: 0 };
  const rooms: RoomAllocation[] = [];

  for (let r = 0; r < roomsNeeded; r++) {
    const grid: (StudentRecord | null)[][] = Array.from({ length: ROWS }, () =>
      Array(COLS).fill(null)
    );

    for (const group of ['A', 'B', 'C', 'D'] as SeatGroup[]) {
      const queue = groupQueues[group];
      for (const [row, col] of positions[group]) {
        if (queueIdx[group] >= queue.length) break;
        grid[row][col] = queue[queueIdx[group]++];
      }
    }

    const roomStudents = grid.flat().filter((s): s is StudentRecord => s !== null);
    rooms.push({
      roomNumber: r + 1,
      students: roomStudents,
      grid,
      totalRows: ROWS,
      seatsPerRow: COLS,
    });
  }

  const rankingTable: RankingEntry[] = ranking.map((r, i) => ({
    rank: i + 1,
    group: r.group,
    examCode: r.examCode,
    totalStudents: r.count,
  }));

  return { rooms, rankingTable, examToGroup };
}

// ─── PDF extraction (unchanged) ───

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
