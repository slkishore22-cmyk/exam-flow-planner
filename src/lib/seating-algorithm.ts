import { StudentRecord, RoomConfig, AllocationResult } from './seating-utils';
import { buildGeneralRooms } from './seating/general-rooms';
import { allocateNormalRooms } from './seating/normal-allocation';

/**
 * Top-level seating allocator.
 *
 * 1. General-exam students get dedicated rooms first (split 50/50 across A/B
 *    sub-columns, departments kept contiguous).
 * 2. Remaining students are allocated via the reserve-then-fill strategy in
 *    `allocateNormalRooms`: exam codes (>=100 students) alternate between
 *    Groups A and B, each code reserves a contiguous room range, and
 *    departments inside a code are placed largest-first with no gaps.
 */
export function allocateSeating(
  students: StudentRecord[],
  config: RoomConfig
): AllocationResult {
  const generalStudents = students.filter((s) => s.isGeneral);
  const normalStudents = students.filter((s) => !s.isGeneral);

  const generalRooms = buildGeneralRooms(generalStudents, 1);
  const normalStartingRoomNumber = generalRooms.length + 1;

  const normalRooms = allocateNormalRooms(normalStudents, config, normalStartingRoomNumber);

  return {
    rooms: [...generalRooms, ...normalRooms],
    patternDecision: { pattern: 'CRISS_CROSS', message: null, violations: 0 },
  };
}
