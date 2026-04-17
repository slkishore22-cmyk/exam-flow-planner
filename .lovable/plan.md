
The user wants to wipe the existing seating algorithm in `src/lib/seating-utils.ts` and start fresh — keeping all UI/UX, buttons, screens, PDF extraction, and dedup logic intact.

## Scope

**Keep (untouched):**
- All UI components (`UploadScreen`, `VerificationScreen`, `RoomConfigScreen`, `SeatingResultScreen`, `StepIndicator`)
- PDF extraction (`extractRollNumbersFromPdf`)
- Deduplication (`deduplicateStudents`)
- Department color helpers (`getDeptColor`, color palettes)
- All TypeScript interfaces (`StudentRecord`, `RoomConfig`, `RoomAllocation`, `PatternDecision`, `AllocationResult`, `PatternType`, `PdfExtractionResult`)
- `interleaveStudents` (used elsewhere if any)
- `Index.tsx` orchestration — it calls `allocateRooms(students, config)` and reads `{ rooms, patternDecision }`

**Strip out (the seating brain):**
- `buildThreePassOrder`
- `buildThreeQueues`
- `buildCheckerboardOrder`
- `decidePattern`
- `getNeighborCodes`
- `pickBest`
- The entire body of `allocateRooms`

## Plan

1. Edit only `src/lib/seating-utils.ts`.
2. Remove all seating-algorithm helpers listed above.
3. Replace `allocateRooms` with a **minimal stub** that:
   - Keeps the same signature: `allocateRooms(students, config): AllocationResult`
   - Computes `rows`, `totalCols`, `roomsNeeded` from config
   - Returns empty rooms (every grid cell `null`, `students: []`) — one entry per `roomsNeeded`
   - Returns a neutral `patternDecision` (e.g. `{ pattern: 'CRISS_CROSS', message: null, violations: 0 }`)
4. Leave `decidePattern` removed — but if needed by another file, re-export a stub. (Quick check: it's only referenced inside `seating-utils.ts`, so safe to delete.)

This gives a clean slate. The app will still compile, navigate through all 4 steps, render empty rooms, and be ready for you to dictate the new seating logic from scratch.

## Files changed

- `src/lib/seating-utils.ts` — strip seating logic, keep types + helpers + stub `allocateRooms`

## Next step

After you approve, I'll wipe the logic. Then in your next message describe the new seating algorithm rules and I'll implement them fresh.

