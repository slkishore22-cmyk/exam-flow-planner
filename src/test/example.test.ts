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

describe("allocateRooms", () => {
  it("alternates middle exam codes between D and C across rooms", () => {
    const students = [
      ...makeStudents("CLZ4R", 30, "A"),
      ...makeStudents("CPZ4E", 30, "B"),
      ...makeStudents("123", 20, "C"),
    ];

    const result = allocateRooms(students, config);

    expect(result.rooms).toHaveLength(2);

    const room1MiddleC = result.rooms[0].grid
      .flat()
      .filter((student) => student?.examCode === "123" && student && [1, 4, 7].includes(result.rooms[0].grid.flat().indexOf(student) % 9));

    const room2MiddleD = result.rooms[1].grid
      .flat()
      .filter((student) => student?.examCode === "123" && student && [4].includes(result.rooms[1].grid.flat().indexOf(student) % 9));

    expect(room1MiddleC).toHaveLength(0);
    expect(room2MiddleD).toHaveLength(0);

    const room1Has123OnlyInD = result.rooms[0].grid.every((row, rowIndex) =>
      row.every((student, colIndex) => {
        if (student?.examCode !== "123") return true;
        return rowIndex % 2 === 1 && colIndex % 3 === 1;
      })
    );

    const room2Has123OnlyInC = result.rooms[1].grid.every((row, rowIndex) =>
      row.every((student, colIndex) => {
        if (student?.examCode !== "123") return true;
        return rowIndex % 2 === 0 && colIndex % 3 === 1;
      })
    );

    expect(room1Has123OnlyInD).toBe(true);
    expect(room2Has123OnlyInC).toBe(true);
  });
});
