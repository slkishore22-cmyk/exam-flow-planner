# Project Memory

## Core
React Vite (non-SWC), Supabase. Centralized parent state across 4-step flow.
Minimal Apple-like UI: white bg, black text, gold accent, Inter font.
Calculation: `Math.ceil(totalStudents / roomStrength)`. Default 45 seats (5x9 grid).
Pattern: 5x9 grid. Odd rows A|C|B, Even rows B|D|A.
A/B fill is universal two-phase: Phase 0 oversize spillover (15-chunks into empty groups), Phase 1 small-gap filler (≤15 only, never split, never mid-start).
C/D fill runs after A/B: largest leftover code first, alternates C(6)/D(9) across successive rooms (15 per pair), uses whichever of C/D is empty in each room, tail best-fits into smallest empty C/D ≥ remaining.

## Seating Logic
Department-Block Allocator. Major codes (>= 100) fill A/B (15 seats each). Each code starts in a fresh room.
Departments within a code are kept contiguous; one ends before next starts.
Minor codes (< 100) fill C/D (9 and 6 seats).

## Memories
- [A/B Fill Strategy](mem://logic/ab-fill-strategy) — Universal two-phase rule: oversize spillover then small-gap filler
- [C/D Fill Strategy](mem://logic/cd-fill-strategy) — Middle-order alternating C(6)/D(9) per room, tail best-fit
- [Design Principles](mem://style/design-principles) — Minimalist Apple-inspired UI, 4-step workflow, gold accent
- [Color Palette](mem://style/color-palette) — Group background colors (A/B/C/D), distinct bold colors for exam codes in print
- [Tech Stack & Architecture](mem://technical/implementation-constraints) — React Vite (non-SWC), Supabase, centralized parent state
- [PDF Extraction Logic](mem://logic/pdf-extraction) — PDF.js row reconstruction, regex parsing, deduping roll numbers
- [Room Calculation Rule](mem://logic/room-calculation) — Math.ceil(totalStudents / roomStrength), default 45 seats
- [Seating Allocation Pattern](mem://logic/seating-pattern-final) — Fixed 5x9 grid, A|C|B and B|D|A alternating pattern, department-block logic
- [Seating Grid UI](mem://features/seating-grid) — 5x9 grid (45 seats), group ranking, seating violations, add room feature
- [Seating Reveal](mem://features/seating-reveal) — Interactive global exam-code visibility toggle in room view
- [Seating Result Navigation](mem://features/result-navigation) — Keyboard/touch navigation, persistence of reveal state
- [Verification Screen](mem://features/verification-screen) — Exam code summary, manual entry, mismatch warnings
- [Print Layout](mem://features/print-layout) — Print-optimized landscape orientation, 1 room/page, exam code colors
