import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { RoomAllocation, RoomConfig, PatternDecision, getExamCodeColor } from '@/lib/seating-utils';

interface SeatingResultScreenProps {
  rooms: RoomAllocation[];
  config: RoomConfig;
  patternDecision?: PatternDecision | null;
  onBack: () => void;
}

const SeatingResultScreen: React.FC<SeatingResultScreenProps> = ({ rooms, config, patternDecision, onBack }) => {
  const [activeRoom, setActiveRoom] = useState(0);
  const [visibleExamCodes, setVisibleExamCodes] = useState<Set<string>>(new Set());
  const printRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const goNext = useCallback(() => {
    setActiveRoom(prev => Math.min(prev + 1, rooms.length - 1));
  }, [rooms.length]);

  const goPrev = useCallback(() => {
    setActiveRoom(prev => Math.max(prev - 1, 0));
  }, []);

  const goFirst = useCallback(() => setActiveRoom(0), []);
  const goLast = useCallback(() => setActiveRoom(rooms.length - 1), [rooms.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          goPrev();
          break;
        case 'Home':
          e.preventDefault();
          goFirst();
          break;
        case 'End':
          e.preventDefault();
          goLast();
          break;
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const allCodes = new Set<string>();
            rooms.forEach(r => r.students.forEach(s => allCodes.add(s.examCode)));
            setVisibleExamCodes(allCodes);
          }
          break;
        case 'c':
        case 'C':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setVisibleExamCodes(new Set());
          }
          break;
        case 'p':
        case 'P':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            window.print();
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, goFirst, goLast, rooms]);

  // Touch swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  };

  const toggleExamCode = (code: string) => {
    setVisibleExamCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const fillAll = () => {
    const allCodes = new Set<string>();
    rooms.forEach(r => r.students.forEach(s => allCodes.add(s.examCode)));
    setVisibleExamCodes(allCodes);
  };

  const clearAll = () => setVisibleExamCodes(new Set());

  // Collect unique exam codes across ALL rooms with total counts
  const examCodesGlobal = useMemo(() => {
    if (!rooms || rooms.length === 0) return [];
    const countMap = new Map<string, number>();
    rooms.forEach(r => r.students.forEach(s => {
      countMap.set(s.examCode, (countMap.get(s.examCode) || 0) + 1);
    }));
    return Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({
        code,
        count,
        isVisible: visibleExamCodes.has(code),
      }));
  }, [rooms, visibleExamCodes]);

  // Progress: total across ALL rooms
  const totalStudentsAll = rooms.reduce((sum, r) => sum + r.students.length, 0);
  const visibleStudentsAll = rooms.reduce((sum, r) => sum + r.students.filter(s => visibleExamCodes.has(s.examCode)).length, 0);
  const progress = totalStudentsAll > 0 ? Math.round((visibleStudentsAll / totalStudentsAll) * 100) : 0;

  // Compute violations per room
  const roomViolations = useMemo(() => {
    return rooms.map(room => {
      const violatedCells = new Set<string>();
      const totalRows = room.grid.length;
      const totalCols = room.grid[0]?.length || 0;
      let count = 0;
      for (let ri = 0; ri < totalRows; ri++) {
        for (let ci = 0; ci < totalCols; ci++) {
          const cell = room.grid[ri][ci];
          if (!cell) continue;
          const dirs: [number, number][] = [[0, 1], [1, 0]];
          for (const [dr, dc] of dirs) {
            const nr = ri + dr;
            const nc = ci + dc;
            if (nr < totalRows && nc < totalCols) {
              const neighbor = room.grid[nr][nc];
              if (neighbor && neighbor.examCode === cell.examCode) {
                violatedCells.add(`${ri}-${ci}`);
                violatedCells.add(`${nr}-${nc}`);
                count++;
              }
            }
          }
        }
      }
      return { count, violatedCells };
    });
  }, [rooms]);

  if (!rooms || rooms.length === 0) {
    return <div className="text-center py-20 text-muted-foreground">No rooms to display.</div>;
  }

  const handlePrint = () => window.print();
  const totalViolations = roomViolations.reduce((sum, v) => sum + v.count, 0);

  // Determine seat type label based on position
  const getSeatTypeLabel = (rowIdx: number, colIdx: number): string => {
    const sc = colIdx % config.seatsPerColumn;
    if (sc === 0 || sc === config.seatsPerColumn - 1) return 'A';
    return 'B';
  };

  const renderRoomGrid = (room: RoomAllocation, roomIndex: number, forPrint = false) => {
    const violations = roomViolations[roomIndex];
    const showReveal = !forPrint;

    return (
      <table className="border-collapse mx-auto" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            {Array.from({ length: config.mainColumns }).map((_, mc) => (
              <React.Fragment key={mc}>
                {Array.from({ length: config.seatsPerColumn }).map((_, sc) => (
                  <th
                    key={`${mc}-${sc}`}
                    className="border border-border px-2 py-2 text-xs font-semibold bg-secondary text-secondary-foreground"
                    style={{ minWidth: 90 }}
                  >
                    {mc * config.seatsPerColumn + sc + 1}
                  </th>
                ))}
                {mc < config.mainColumns - 1 && (
                  <th className="w-4 border-none" style={{ minWidth: 16 }} />
                )}
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {room.grid.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map((student, colIdx) => {
                const mc = Math.floor(colIdx / config.seatsPerColumn);
                const sc = colIdx % config.seatsPerColumn;
                const isLastSubCol = sc === config.seatsPerColumn - 1;
                const isLastMainCol = mc === config.mainColumns - 1;
                const showSeparator = isLastSubCol && !isLastMainCol;

                const isOccupied = student !== null;
                const isVisible = forPrint ? true : (isOccupied && visibleExamCodes.has(student!.examCode));
                const isViolation = violations?.violatedCells.has(`${rowIdx}-${colIdx}`);
                const seatLabel = getSeatTypeLabel(rowIdx, colIdx);

                let cellContent: React.ReactNode;
                let cellBg: string;
                let cellBorder: string;

                if (!isOccupied) {
                  // Truly empty seat
                  cellBg = 'hsl(var(--muted))';
                  cellBorder = '2px solid white';
                  cellContent = <span className="text-muted-foreground text-xs">—</span>;
                } else if (!isVisible && showReveal) {
                  // Occupied but hidden — show placeholder with seat label
                  cellBg = 'hsl(var(--muted))';
                  cellBorder = '1px solid hsl(var(--border))';
                  cellContent = (
                    <span className="text-muted-foreground text-xs font-medium">{seatLabel}</span>
                  );
                } else {
                  // Visible — show full student info
                  const color = getExamCodeColor(student!.examCode);
                  cellBg = color.bg;
                  cellBorder = isViolation ? '3px solid #EF4444' : '2px solid white';
                  cellContent = (
                    <div className="flex flex-col items-center justify-center gap-0">
                      <span style={{ fontSize: 9, color: color.text, fontWeight: 500 }}>
                        {student!.department}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#FFD700' }}>
                        {student!.examCode}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: color.text, fontFamily: 'monospace' }}>
                        {student!.rollNumber}
                      </span>
                    </div>
                  );
                }

                const cell = (
                  <td
                    key={`${rowIdx}-${colIdx}`}
                    className="text-center align-middle seat-cell"
                    style={{
                      minWidth: 90,
                      height: 65,
                      backgroundColor: cellBg,
                      padding: '4px 6px',
                      border: cellBorder,
                      boxShadow: isViolation && isVisible ? 'inset 0 0 8px rgba(239,68,68,0.4)' : undefined,
                    }}
                  >
                    {cellContent}
                  </td>
                );

                if (showSeparator) {
                  return (
                    <React.Fragment key={`${rowIdx}-${colIdx}`}>
                      {cell}
                      <td className="border-none" style={{ minWidth: 16 }} />
                    </React.Fragment>
                  );
                }
                return cell;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const activeViolations = roomViolations[activeRoom]?.count || 0;

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="no-print">
        <Button variant="outline" onClick={onBack} className="rounded-xl px-6 h-10 text-sm mb-6 border-foreground text-foreground bg-background hover:bg-secondary">
          ← Back
        </Button>
      </div>

      {/* Pattern decision banner */}
      {patternDecision?.message && (
        <div
          className="no-print mb-6 p-4 rounded-2xl border-2"
          style={{
            backgroundColor: patternDecision.violations === 'unavoidable' ? '#FFFBEB' : '#EFF6FF',
            borderColor: patternDecision.violations === 'unavoidable' ? '#F59E0B' : '#3B82F6',
          }}
        >
          <p className="font-bold text-sm" style={{ color: patternDecision.violations === 'unavoidable' ? '#D97706' : '#2563EB' }}>
            {patternDecision.violations === 'unavoidable' ? '⚠️ Additional Rooms Required' : 'ℹ️ Pattern Auto-Switched to Checkerboard'}
          </p>
          <p className="text-sm mt-1" style={{ color: patternDecision.violations === 'unavoidable' ? '#92400E' : '#1E40AF' }}>
            {patternDecision.message}
          </p>
        </div>
      )}

      {/* Violation summary */}
      {totalViolations > 0 && (
        <div className="no-print mb-6 p-4 rounded-2xl border-2" style={{ backgroundColor: '#FEF2F2', borderColor: '#EF4444' }}>
          <p className="font-bold text-sm" style={{ color: '#DC2626' }}>⚠ SEATING VIOLATIONS DETECTED</p>
          <p className="text-sm mt-1" style={{ color: '#991B1B' }}>
            {totalViolations} adjacent pair{totalViolations !== 1 ? 's' : ''} share the same exam code across all rooms.
            Cells with violations are highlighted with a red border in the grid below.
          </p>
          <div className="flex flex-wrap gap-3 mt-2">
            {rooms.map((room, i) => {
              const v = roomViolations[i].count;
              if (v === 0) return null;
              return (
                <span key={i} className="text-xs font-semibold px-2 py-1 rounded" style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}>
                  Room {room.roomNumber}: {v} violation{v !== 1 ? 's' : ''}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Room tabs */}
      <div className="no-print flex flex-wrap gap-2 mb-6 justify-center">
        {rooms.map((room, i) => {
          const hasViolation = roomViolations[i].count > 0;
          return (
            <button
              key={i}
              onClick={() => setActiveRoom(i)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all border ${
                i === activeRoom
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-foreground border-border hover:border-foreground'
              }`}
              style={hasViolation && i !== activeRoom ? { borderColor: '#EF4444' } : undefined}
            >
              Room {room.roomNumber}
              {hasViolation && <span style={{ color: '#EF4444' }}> •</span>}
            </button>
          );
        })}
      </div>

      {/* Exam code reveal bar — universal across all rooms */}
      <div className="no-print mb-3 p-3 bg-secondary rounded-2xl">
        <div className="flex flex-wrap gap-2">
          {examCodesGlobal.map(ec => (
            <button
              key={ec.code}
              onClick={() => toggleExamCode(ec.code)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all cursor-pointer"
              style={{
                border: ec.isVisible ? '2px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
                background: ec.isVisible ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--background))',
                fontWeight: ec.isVisible ? 600 : 400,
                color: 'hsl(var(--foreground))',
              }}
            >
              <span
                className="inline-block rounded-full flex-shrink-0"
                style={{ width: 10, height: 10, background: ec.isVisible ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
              />
              {ec.code}
              <span style={{ fontSize: 11, color: ec.isVisible ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>
                {ec.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Fill All / Clear / Progress */}
      <div className="no-print flex items-center gap-3 mb-6">
        <Button variant="outline" size="sm" onClick={fillAll} className="text-xs rounded-md">
          Fill All
        </Button>
        <Button variant="outline" size="sm" onClick={clearAll} className="text-xs rounded-md border-destructive/30 text-destructive hover:bg-destructive/10">
          Clear
        </Button>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: '#2E7D32' }}
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {visibleStudentsAll} / {totalStudentsAll} — {progress}%
        </span>
      </div>

      {/* Active room grid with swipe + nav buttons */}
      <div className="no-print" ref={gridContainerRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={activeRoom === 0}
            className="text-xs rounded-md px-3"
          >
            ← Prev
          </Button>
          <h3 className="text-xl font-bold text-center">
            Room {rooms[activeRoom].roomNumber}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({rooms[activeRoom].students.length} students)
            </span>
            {activeViolations > 0 && (
              <span className="text-sm font-semibold ml-2" style={{ color: '#EF4444' }}>
                — {activeViolations} violation{activeViolations !== 1 ? 's' : ''}
              </span>
            )}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={activeRoom === rooms.length - 1}
            className="text-xs rounded-md px-3"
          >
            Next →
          </Button>
        </div>
        <div className="overflow-x-auto pb-4">
          {renderRoomGrid(rooms[activeRoom], activeRoom)}
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-[10px] text-muted-foreground">
          <span>← → Navigate rooms</span>
          <span>Home / End  First / Last</span>
          <span>F Fill all</span>
          <span>C Clear</span>
          <span>P Print</span>
          <span>Swipe left/right on touch</span>
        </div>
      </div>

      {/* Print button */}
      <div className="no-print mt-8 text-center">
        <Button onClick={handlePrint} className="px-12 h-12 text-base rounded-xl">
          Print All Rooms
        </Button>
      </div>

      {/* Print-only: all rooms — landscape, roll numbers only */}
      <div ref={printRef} className="hidden print:block print-container">
        {rooms.map((room, roomIdx) => {
          // Collect department/exam code summary for this room
          const summaryMap = new Map<string, { dept: string; code: string; count: number }>();
          room.students.forEach(s => {
            const key = `${s.department}|${s.examCode}`;
            if (!summaryMap.has(key)) summaryMap.set(key, { dept: s.department, code: s.examCode, count: 0 });
            summaryMap.get(key)!.count++;
          });
          const summaryItems = Array.from(summaryMap.values()).sort((a, b) => b.count - a.count);

          return (
            <div key={roomIdx} className={roomIdx < rooms.length - 1 ? 'print-page-break' : ''}>
              {/* Header with blank fields for invigilator */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '2px solid #000', paddingBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Room No: <span style={{ display: 'inline-block', width: 120, borderBottom: '1px solid #000' }}>&nbsp;</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Date: <span style={{ display: 'inline-block', width: 140, borderBottom: '1px solid #000' }}>&nbsp;</span>
                </div>
              </div>

              {/* Seating grid — seat numbers + roll numbers only */}
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    {Array.from({ length: config.mainColumns }).map((_, mc) => (
                      <React.Fragment key={mc}>
                        <th style={{ border: '1px solid #000', padding: '3px 2px', fontSize: 10, fontWeight: 700, textAlign: 'center', width: 28, backgroundColor: '#f0f0f0' }}>
                          S.No
                        </th>
                        {Array.from({ length: config.seatsPerColumn }).map((_, sc) => (
                          <th key={sc} style={{ border: '1px solid #000', padding: '3px 4px', fontSize: 10, fontWeight: 700, textAlign: 'center', backgroundColor: '#f0f0f0' }}>
                            S{mc * config.seatsPerColumn + sc + 1}
                          </th>
                        ))}
                        {mc < config.mainColumns - 1 && (
                          <th style={{ width: 8, border: 'none' }} />
                        )}
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {room.grid.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {Array.from({ length: config.mainColumns }).map((_, mc) => {
                        const seatNumber = mc * room.grid.length + rowIdx + 1;
                        return (
                          <React.Fragment key={mc}>
                            <td style={{ border: '1px solid #000', padding: '2px', fontSize: 10, fontWeight: 700, textAlign: 'center', backgroundColor: '#f0f0f0' }}>
                              {seatNumber}
                            </td>
                            {Array.from({ length: config.seatsPerColumn }).map((_, sc) => {
                              const colIdx = mc * config.seatsPerColumn + sc;
                              const student = row[colIdx];
                              const color = student ? getExamCodeColor(student.examCode) : null;
                              return (
                                <td key={sc} style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', height: 28 }}>
                                  {student ? (
                                    <span style={{ fontSize: 11, fontWeight: 700, color: color!.bg, fontFamily: 'monospace' }}>
                                      {student.rollNumber}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#ccc', fontSize: 10 }}>—</span>
                                  )}
                                </td>
                              );
                            })}
                            {mc < config.mainColumns - 1 && (
                              <td style={{ width: 8, border: 'none' }} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary footer: department, exam code, count */}
              <div style={{ marginTop: 10, borderTop: '2px solid #000', paddingTop: 6 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ border: '1px solid #000', padding: '3px 8px', fontSize: 10, textAlign: 'left', backgroundColor: '#f0f0f0' }}>Department</th>
                      <th style={{ border: '1px solid #000', padding: '3px 8px', fontSize: 10, textAlign: 'left', backgroundColor: '#f0f0f0' }}>Exam Code</th>
                      <th style={{ border: '1px solid #000', padding: '3px 8px', fontSize: 10, textAlign: 'center', backgroundColor: '#f0f0f0' }}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryItems.map((item, idx) => {
                      const color = getExamCodeColor(item.code);
                      return (
                        <tr key={idx}>
                          <td style={{ border: '1px solid #000', padding: '2px 8px', fontSize: 10, color: color.bg, fontWeight: 600 }}>{item.dept}</td>
                          <td style={{ border: '1px solid #000', padding: '2px 8px', fontSize: 10, color: color.bg, fontWeight: 600 }}>{item.code}</td>
                          <td style={{ border: '1px solid #000', padding: '2px 8px', fontSize: 10, textAlign: 'center', fontWeight: 700 }}>{item.count}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={2} style={{ border: '1px solid #000', padding: '2px 8px', fontSize: 10, fontWeight: 700, textAlign: 'right' }}>Total</td>
                      <td style={{ border: '1px solid #000', padding: '2px 8px', fontSize: 10, textAlign: 'center', fontWeight: 700 }}>{room.students.length}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SeatingResultScreen;
