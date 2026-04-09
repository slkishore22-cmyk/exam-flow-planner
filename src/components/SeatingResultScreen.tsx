import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { RoomAllocation, RoomConfig, GroupRanking, getExamCodeColor, GROUP_COLORS } from '@/lib/seating-utils';

interface SeatingResultScreenProps {
  rooms: RoomAllocation[];
  config: RoomConfig;
  groupRankings: GroupRanking[];
  violations: number;
  onBack: () => void;
  onAddRoom?: () => void;
}

const GROUP_LABELS = ['A', 'B', 'C', 'D'] as const;

function getGroupForCell(row: number, col: number): 'A' | 'B' | 'C' | 'D' {
  const subCol = col % 3;
  const isOddRow = row % 2 === 0;
  const isMiddleCol = subCol === 1;
  if (isMiddleCol) return isOddRow ? 'C' : 'D';
  return isOddRow ? 'A' : 'B';
}

const SeatingResultScreen: React.FC<SeatingResultScreenProps> = ({ rooms, config, groupRankings, violations, onBack, onAddRoom }) => {
  const [activeRoom, setActiveRoom] = useState(0);
  const [visibleExamCodes, setVisibleExamCodes] = useState<Set<string>>(new Set());
  const printRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const goNext = useCallback(() => setActiveRoom(prev => Math.min(prev + 1, rooms.length - 1)), [rooms.length]);
  const goPrev = useCallback(() => setActiveRoom(prev => Math.max(prev - 1, 0)), []);
  const goFirst = useCallback(() => setActiveRoom(0), []);
  const goLast = useCallback(() => setActiveRoom(rooms.length - 1), [rooms.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': e.preventDefault(); goNext(); break;
        case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); goPrev(); break;
        case 'Home': e.preventDefault(); goFirst(); break;
        case 'End': e.preventDefault(); goLast(); break;
        case 'p': case 'P':
          if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); window.print(); }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, goFirst, goLast]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNext() : goPrev(); }
    touchStartX.current = null;
  };

  // Per-room violation cells
  const roomViolations = useMemo(() => {
    return rooms.map(room => {
      const violatedCells = new Set<string>();
      let count = 0;
      const totalRows = room.grid.length;
      const totalCols = room.grid[0]?.length || 0;
      for (let ri = 0; ri < totalRows; ri++) {
        for (let ci = 0; ci < totalCols; ci++) {
          const cell = room.grid[ri][ci];
          if (!cell) continue;
          const dirs: [number, number][] = [[0, 1], [1, 0]];
          for (const [dr, dc] of dirs) {
            const nr = ri + dr, nc = ci + dc;
            if (nr < totalRows && nc < totalCols && room.grid[nr][nc]?.examCode === cell.examCode) {
              violatedCells.add(`${ri}-${ci}`);
              violatedCells.add(`${nr}-${nc}`);
              count++;
            }
          }
        }
      }
      return { count, violatedCells };
    });
  }, [rooms]);

  const totalStudentsAll = rooms.reduce((sum, r) => sum + r.students.length, 0);

  // Build exam code → group map from rankings
  const examGroupMap = useMemo(() => {
    const m: Record<string, string> = {};
    (groupRankings || []).forEach(r => { m[r.examCode] = r.group; });
    return m;
  }, [groupRankings]);

  // All unique exam codes across all rooms
  const allExamCodes = useMemo(() => {
    const codes = new Set<string>();
    rooms.forEach(r => r.students.forEach(s => codes.add(s.examCode)));
    return Array.from(codes).sort();
  }, [rooms]);

  const toggleExamCode = (code: string) => {
    setVisibleExamCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const fillAll = () => setVisibleExamCodes(new Set(allExamCodes));
  const clearAll = () => setVisibleExamCodes(new Set());

  const revealedCount = useMemo(() => {
    let count = 0;
    rooms.forEach(r => r.students.forEach(s => { if (visibleExamCodes.has(s.examCode)) count++; }));
    return count;
  }, [rooms, visibleExamCodes]);

  const revealPercent = totalStudentsAll > 0 ? Math.round((revealedCount / totalStudentsAll) * 100) : 0;

  // Room-level legend: which exam codes are in this room
  const getRoomLegend = (room: RoomAllocation) => {
    const codeSet = new Set(room.students.map(s => s.examCode));
    const legend: Record<string, string[]> = { A: [], B: [], C: [], D: [] };
    (groupRankings || []).forEach(r => {
      if (codeSet.has(r.examCode)) {
        legend[r.group].push(r.examCode);
      }
    });
    return legend;
  };

  if (!rooms || rooms.length === 0) {
    return <div className="text-center py-20 text-muted-foreground">No rooms to display.</div>;
  }

  const handlePrint = () => window.print();
  const totalViolations = roomViolations.reduce((sum, v) => sum + v.count, 0);
  const activeViolations = roomViolations[activeRoom]?.count || 0;

  const renderRoomGrid = (room: RoomAllocation, roomIndex: number) => {
    const viol = roomViolations[roomIndex];
    return (
      <table className="border-collapse mx-auto" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            {Array.from({ length: config.mainColumns }).map((_, mc) => (
              <React.Fragment key={mc}>
                {Array.from({ length: config.seatsPerColumn }).map((_, sc) => (
                  <th key={`${mc}-${sc}`} className="border border-border px-2 py-2 text-xs font-semibold bg-secondary text-secondary-foreground" style={{ minWidth: 90 }}>
                    {mc * config.seatsPerColumn + sc + 1}
                  </th>
                ))}
                {mc < config.mainColumns - 1 && <th className="w-4 border-none" style={{ minWidth: 16 }} />}
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
                const group = getGroupForCell(rowIdx, colIdx);
                const isViolation = viol?.violatedCells.has(`${rowIdx}-${colIdx}`);

                let cellContent: React.ReactNode;
                let cellBg: string;
                let cellBorder: string;

                if (!student) {
                  cellBg = '#F5F5F7';
                  cellBorder = '1px solid #E5E5EA';
                  cellContent = null;
                } else {
                  const gc = GROUP_COLORS[group];
                  cellBg = gc.bg;
                  cellBorder = isViolation ? '3px solid #EF4444' : '2px solid white';
                  cellContent = (
                    <div className="flex flex-col items-center justify-center gap-0">
                      <span style={{ fontSize: 11, fontWeight: 700, color: gc.text }}>{student.examCode}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: gc.text, fontFamily: 'monospace' }}>{student.rollNumber}</span>
                    </div>
                  );
                }

                const cell = (
                  <td key={`${rowIdx}-${colIdx}`} className="text-center align-middle" style={{
                    minWidth: 90, height: 65, backgroundColor: cellBg, padding: '4px 6px', border: cellBorder,
                    boxShadow: isViolation && student ? 'inset 0 0 8px rgba(239,68,68,0.4)' : undefined,
                  }}>
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

  const currentRoomLegend = getRoomLegend(rooms[activeRoom]);

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="no-print">
        <Button variant="outline" onClick={onBack} className="rounded-xl px-6 h-10 text-sm mb-6 border-foreground text-foreground bg-background hover:bg-secondary">
          ← Back
        </Button>
      </div>

      {/* Violation banner */}
      {totalViolations > 0 && (
        <div className="no-print mb-6 p-4 rounded-2xl border-2" style={{ backgroundColor: '#FEF2F2', borderColor: '#EF4444' }}>
          <p className="font-bold text-sm" style={{ color: '#DC2626' }}>⚠ SEATING VIOLATIONS DETECTED</p>
          <p className="text-sm mt-1" style={{ color: '#991B1B' }}>
            {totalViolations} adjacent pair{totalViolations !== 1 ? 's' : ''} share the same exam code.
          </p>
          {onAddRoom && (
            <Button onClick={onAddRoom} className="mt-3 rounded-xl px-6 h-10 text-sm font-bold" style={{ backgroundColor: '#D97706', color: '#FFFFFF' }}>
              + Add Additional Room & Regenerate
            </Button>
          )}
        </div>
      )}

      {/* Group Ranking Table */}
      <div className="no-print mb-6">
        <h3 className="text-sm font-bold mb-2">Group Ranking</h3>
        <table className="border-collapse text-sm w-full max-w-lg">
          <thead>
            <tr>
              <th className="border border-border px-3 py-1.5 text-left bg-secondary text-secondary-foreground">Rank</th>
              <th className="border border-border px-3 py-1.5 text-left bg-secondary text-secondary-foreground">Group</th>
              <th className="border border-border px-3 py-1.5 text-left bg-secondary text-secondary-foreground">Exam Code</th>
              <th className="border border-border px-3 py-1.5 text-right bg-secondary text-secondary-foreground">Total Students</th>
            </tr>
          </thead>
          <tbody>
            {(groupRankings || []).map(r => {
              const gc = GROUP_COLORS[r.group];
              return (
                <tr key={r.rank}>
                  <td className="border border-border px-3 py-1.5">{r.rank}</td>
                  <td className="border border-border px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span style={{ display: 'inline-block', width: 14, height: 14, backgroundColor: gc.bg, borderRadius: 3 }} />
                      {r.group}
                    </span>
                  </td>
                  <td className="border border-border px-3 py-1.5 font-semibold">{r.examCode}</td>
                  <td className="border border-border px-3 py-1.5 text-right">{r.totalStudents.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Room tabs */}
      <div className="no-print flex flex-wrap gap-2 mb-6 justify-center">
        {rooms.map((room, i) => {
          const hasViolation = roomViolations[i].count > 0;
          return (
            <button key={i} onClick={() => setActiveRoom(i)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all border ${
                i === activeRoom ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:border-foreground'
              }`}
              style={hasViolation && i !== activeRoom ? { borderColor: '#EF4444' } : undefined}
            >
              Room {room.roomNumber}
              {hasViolation && <span style={{ color: '#EF4444' }}> •</span>}
            </button>
          );
        })}
      </div>

      {/* Active room grid */}
      <div className="no-print" ref={gridContainerRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="sm" onClick={goPrev} disabled={activeRoom === 0} className="text-xs rounded-md px-3">← Prev</Button>
          <h3 className="text-xl font-bold text-center">
            Room {rooms[activeRoom].roomNumber}
            <span className="text-sm font-normal text-muted-foreground ml-2">({rooms[activeRoom].students.length} students)</span>
            {activeViolations > 0 && (
              <span className="text-sm font-semibold ml-2" style={{ color: '#EF4444' }}>— {activeViolations} violation{activeViolations !== 1 ? 's' : ''}</span>
            )}
          </h3>
          <Button variant="outline" size="sm" onClick={goNext} disabled={activeRoom === rooms.length - 1} className="text-xs rounded-md px-3">Next →</Button>
        </div>

        {/* Color legend for this room */}
        <div className="flex flex-wrap gap-4 mb-4 justify-center">
          {GROUP_LABELS.map(g => {
            const codes = currentRoomLegend[g];
            if (codes.length === 0) return null;
            const gc = GROUP_COLORS[g];
            return (
              <div key={g} className="flex items-center gap-1.5 text-xs">
                <span style={{ display: 'inline-block', width: 16, height: 16, backgroundColor: gc.bg, borderRadius: 3 }} />
                <span className="font-semibold">{g}</span>
                <span className="text-muted-foreground">— {codes.join(', ')}</span>
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto pb-4">
          {renderRoomGrid(rooms[activeRoom], activeRoom)}
        </div>

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-[10px] text-muted-foreground">
          <span>← → Navigate rooms</span>
          <span>Home / End  First / Last</span>
          <span>P Print</span>
          <span>Swipe left/right on touch</span>
        </div>
      </div>

      {/* Print button */}
      <div className="no-print mt-8 text-center">
        <Button onClick={handlePrint} className="px-12 h-12 text-base rounded-xl">Print All Rooms</Button>
      </div>

      {/* Print-only: all rooms */}
      <div ref={printRef} className="hidden print:block print-container">
        {rooms.map((room, roomIdx) => {
          const summaryMap = new Map<string, { dept: string; code: string; count: number }>();
          room.students.forEach(s => {
            const key = `${s.department}|${s.examCode}`;
            if (!summaryMap.has(key)) summaryMap.set(key, { dept: s.department, code: s.examCode, count: 0 });
            summaryMap.get(key)!.count++;
          });
          const summaryItems = Array.from(summaryMap.values()).sort((a, b) => b.count - a.count);

          return (
            <div key={roomIdx} className={roomIdx < rooms.length - 1 ? 'print-page-break' : ''}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '2px solid #000', paddingBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Room No: <span style={{ display: 'inline-block', width: 120, borderBottom: '1px solid #000' }}>&nbsp;</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Date: <span style={{ display: 'inline-block', width: 140, borderBottom: '1px solid #000' }}>&nbsp;</span>
                </div>
              </div>

              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    {Array.from({ length: config.mainColumns }).map((_, mc) => (
                      <React.Fragment key={mc}>
                        <th style={{ border: '1px solid #000', padding: '3px 2px', fontSize: 10, fontWeight: 700, textAlign: 'center', width: 28, backgroundColor: '#f0f0f0' }}>S.No</th>
                        {Array.from({ length: config.seatsPerColumn }).map((_, sc) => (
                          <th key={sc} style={{ border: '1px solid #000', padding: '3px 4px', fontSize: 10, fontWeight: 700, textAlign: 'center', backgroundColor: '#f0f0f0' }}>
                            S{mc * config.seatsPerColumn + sc + 1}
                          </th>
                        ))}
                        {mc < config.mainColumns - 1 && <th style={{ width: 8, border: 'none' }} />}
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
                            <td style={{ border: '1px solid #000', padding: '2px', fontSize: 10, fontWeight: 700, textAlign: 'center', backgroundColor: '#f0f0f0' }}>{seatNumber}</td>
                            {Array.from({ length: config.seatsPerColumn }).map((_, sc) => {
                              const colIdx = mc * config.seatsPerColumn + sc;
                              const student = row[colIdx];
                              const color = student ? getExamCodeColor(student.examCode) : null;
                              return (
                                <td key={sc} style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', height: 28 }}>
                                  {student ? (
                                    <span style={{ fontSize: 11, fontWeight: 700, color: color!.bg, fontFamily: 'monospace' }}>{student.rollNumber}</span>
                                  ) : (
                                    <span style={{ color: '#ccc', fontSize: 10 }}>—</span>
                                  )}
                                </td>
                              );
                            })}
                            {mc < config.mainColumns - 1 && <td style={{ width: 8, border: 'none' }} />}
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

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
