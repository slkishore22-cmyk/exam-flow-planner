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

describe("allocateRooms", () => {
  it("alternates middle exam codes between D and C across rooms", () => {
    const students = [
      ...makeStudents("CLZ4R", 30, "A"),
      ...makeStudents("CPZ4E", 30, "B"),
      ...makeStudents("123", 15, "C"),
    ];

    const result = allocateRooms(students, config);

    expect(result.rooms).toHaveLength(2);

    const room1Seats = getExamSeats(result.rooms[0], "123");
    const room2Seats = getExamSeats(result.rooms[1], "123");

    expect(room1Seats).toHaveLength(6);
    expect(room2Seats).toHaveLength(9);
    expect(room1Seats.every((seat) => seat.group === "D")).toBe(true);
    expect(room2Seats.every((seat) => seat.group === "C")).toBe(true);
  });

  it("restarts from A and B when only later-ranked buckets remain", () => {
    const students = [
      ...makeStudents("CLZ4R", 30, "A"),
      ...makeStudents("CPZ4E", 30, "B"),
      ...makeStudents("123", 45, "C"),
    ];

    const result = allocateRooms(students, config);

    expect(result.rooms).toHaveLength(3);

    const room3Seats = getExamSeats(result.rooms[2], "123");

    expect(room3Seats).toHaveLength(30);
    expect(room3Seats.every((seat) => seat.group === "A" || seat.group === "B")).toBe(true);
    expect(room3Seats.some((seat) => seat.group === "A")).toBe(true);
    expect(room3Seats.some((seat) => seat.group === "B")).toBe(true);
  });
});
