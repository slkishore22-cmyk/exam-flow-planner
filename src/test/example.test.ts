import { describe, it, expect } from "vitest";

import { allocateRooms, type RoomConfig, type StudentRecord } from "@/lib/seating-utils";

const config: RoomConfig = {
  studentsPerRoom: 45,
  mainColumns: 3,
  seatsPerColumn: 3,
};

function makeStudents(examCode: string, count: number, prefix: string): StudentRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    rollNumber: `${prefix}${String(index + 1).padStart(3, "0")}`,
    department: `${examCode}-DEPT`,
    examCode,
    sourcePdf: `${examCode}.pdf`,
  }));
}

function getGroupForSeat(rowIndex: number, colIndex: number) {
  const subCol = colIndex % 3;

  if (rowIndex % 2 === 0) {
    if (subCol === 0) return "A";
    if (subCol === 1) return "C";
    return "B";
  }

  if (subCol === 0) return "B";
  if (subCol === 1) return "D";
  return "A";
}

function getExamSeats(room: ReturnType<typeof allocateRooms>["rooms"][number], examCode: string) {
  return room.grid.flatMap((row, rowIndex) =>
    row.flatMap((student, colIndex) =>
      student?.examCode === examCode
        ? [{ row: rowIndex, col: colIndex, group: getGroupForSeat(rowIndex, colIndex) }]
        : []
    )
  );
}

function getExamRooms(result: ReturnType<typeof allocateRooms>, examCode: string) {
  return result.rooms.flatMap((room) => (getExamSeats(room, examCode).length > 0 ? [room.roomNumber] : []));
}

describe("allocateRooms", () => {
  it("keeps three-digit-count buckets inside contiguous A/B room blocks", () => {
    const students = [
      ...makeStudents("MAM4P", 180, "A"),
      ...makeStudents("PHY6B", 105, "B"),
      ...makeStudents("ENG4A", 34, "C"),
      ...makeStudents("ART2B", 28, "D"),
    ];

    const result = allocateRooms(students, config);
    const mamRooms = getExamRooms(result, "MAM4P");
    const phyRooms = getExamRooms(result, "PHY6B");
    const mamSeats = result.rooms.flatMap((room) => getExamSeats(room, "MAM4P"));

    expect(result.rooms).toHaveLength(10);
    expect(mamRooms).toEqual([1, 2, 3, 4, 5, 6]);
    expect(phyRooms).toEqual([7, 8, 9, 10]);
    expect(mamSeats.every((seat) => seat.group === "A" || seat.group === "B")).toBe(true);
    expect(result.violations).toBe(0);
  });

  it("fills the middle rows with two-digit buckets before using extra rooms", () => {
    const students = [
      ...makeStudents("MAM4P", 180, "A"),
      ...makeStudents("PHY6B", 105, "B"),
      ...makeStudents("ENG4A", 34, "C"),
      ...makeStudents("ART2B", 28, "D"),
      ...makeStudents("SAYSB", 1, "E"),
      ...makeStudents("SAKSB", 1, "F"),
      ...makeStudents("PSDEJ", 1, "G"),
      ...makeStudents("MGR2C", 1, "H"),
      ...makeStudents("MCG3A", 1, "I"),
      ...makeStudents("CPW6C", 1, "J"),
    ];

    const result = allocateRooms(students, config);
    const engSeats = result.rooms.flatMap((room) => getExamSeats(room, "ENG4A"));
    const artSeats = result.rooms.flatMap((room) => getExamSeats(room, "ART2B"));
    const singletonRooms = ["SAYSB", "SAKSB", "PSDEJ", "MGR2C", "MCG3A", "CPW6C"].flatMap((code) =>
      getExamRooms(result, code)
    );

    expect(result.rooms).toHaveLength(10);
    expect(engSeats.length).toBe(34);
    expect(artSeats.length).toBe(28);
    expect(engSeats.every((seat) => seat.group === "C")).toBe(true);
    expect(artSeats.every((seat) => seat.group === "D")).toBe(true);
    expect(singletonRooms.every((roomNumber) => roomNumber <= 10)).toBe(true);
    expect(new Set([...engSeats.map((seat) => seat.group), ...artSeats.map((seat) => seat.group)])).toEqual(
      new Set(["C", "D"])
    );
  });
});
