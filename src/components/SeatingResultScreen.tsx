import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  RoomAllocation,
  RoomConfig,
  RankingEntry,
  SeatGroup,
  getGroup,
  GROUP_COLORS,
  EMPTY_CELL_COLOR,
} from '@/lib/seating-utils';

interface SeatingResultScreenProps {
  rooms: RoomAllocation[];
  config: RoomConfig;
  rankingTable: RankingEntry[];
  examToGroup: Record<string, SeatGroup>;
  onBack: () => void;
  onAddRoom?: () => void;
}

const SeatingResultScreen: React.FC<SeatingResultScreenProps> = ({
  rooms,
  config,
  rankingTable,
  examToGroup,
  onBack,
  onAddRoom,
}) => {
  const [activeRoom, setActiveRoom] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);
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

  // Build legend for active room: which exam codes are in each group
  const roomGroupLegend = useMemo(() => {
    if (!rooms[activeRoom]) return [];
    const groupCodes: Record<SeatGroup, Set<string>> = { A: new Set(), B: new Set(), C: new Set(), D: new Set() };
    rooms[activeRoom].grid.forEach((row, ri) => {
      row.forEach((student, ci) => {
        if (student) groupCodes[getGroup(ri, ci)].add(student.examCode);
      });
    });
    return (['A', 'B', 'C', 'D'] as SeatGroup[]).map(g => ({
      group: g,
      codes: Array.from(groupCodes[g]),
      color: GROUP_COLORS[g],
    })).filter(g => g.codes.length > 0);
  }, [rooms, activeRoom]);

  const totalStudentsAll = rooms.reduce((sum, r) => sum + r.students.length, 0);

  if (!rooms || rooms.length === 0) {
    return <div className="text-center py-20 text-muted-foreground">No rooms to display.</div>;
  }

  const renderCell = (student: StudentRecord | null, rowIdx: number, colIdx: number) => {
    if (!student) {
      return (
        <td
          key={`${rowIdx}-${colIdx}`}
          className="text-center align-middle"
          style={{
            minWidth: 90,
            height: 65,
            backgroundColor: EMPTY_CELL_COLOR,
            border: '1px solid #E5E5EA',
            padding: '4px 6px',
          }}
        />
      );
    }

    const group = getGroup(rowIdx, colIdx);
    const colors = GROUP_COLORS[group];

    return (
      <td
        key={`${rowIdx}-${colIdx}`}
        className="text-center align-middle"
        style={{
          minWidth: 90,
          height: 65,
          backgroundColor: colors.bg,
          color: colors.text,
          border: '1px solid #E5E5EA',
          padding: '4px 6px',
        }}
      >
        <div className="flex flex-col items-center justify-center gap-0.5">
          <span style={{ fontSize: 11, fontWeight: 700 }}>{student.examCode}</span>
          <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'monospace' }}>{student.rollNumber}</span>
        </div>
      </td>
    );
  };

  const renderRoomGrid = (room: RoomAllocation) => (
    <table className="border-collapse mx-auto" style={{ borderSpacing: 0 }}>
      <thead>
        <tr>
          {Array.from({ length: 3 }).map((_, mc) => (
            <React.Fragment key={mc}>
              {Array.from({ length: 3 }).map((_, sc) => (
                <th
                  key={`${mc}-${sc}`}
                  className="text-xs font-semibold"
                  style={{
                    minWidth: 90,
                    padding: '6px 2px',
                    border: '1px solid #E5E5EA',
                    backgroundColor: '#F5F5F7',
                    color: '#1D1D1F',
                  }}
                >
                  {mc * 3 + sc + 1}
                </th>
              ))}
              {mc < 2 && <th className="w-4 border-none" style={{ minWidth: 16 }} />}
            </React.Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {room.grid.map((row, rowIdx) => (
          <tr key={rowIdx}>
            {row.map((student, colIdx) => {
              const mc = Math.floor(colIdx / 3);
              const sc = colIdx % 3;
              const isLastSubCol = sc === 2;
              const isLastMainCol = mc === 2;
              const showSep = isLastSubCol && !isLastMainCol;

              const cell = renderCell(student, rowIdx, colIdx);
              if (showSep) {
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

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="no-print">
        <Button variant="outline" onClick={onBack} className="rounded-xl px-6 h-10 text-sm mb-6 border-foreground text-foreground bg-background hover:bg-secondary">
          ← Back
        </Button>
      </div>

      {/* Ranking Table — shown once at top */}
      <div className="no-print mb-8">
        <h2 className="text-lg font-bold mb-3" style={{ color: '#1D1D1F' }}>Group Ranking</h2>
        <div className="overflow-x-auto">
          <table className="border-collapse w-full max-w-xl">
            <thead>
              <tr>
                {['Rank', 'Group', 'Exam Code', 'Total Students'].map(h => (
                  <th key={h} className="text-xs font-semibold text-left px-4 py-2" style={{ borderBottom: '2px solid #1D1D1F', color: '#1D1D1F' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rankingTable.map(r => (
                <tr key={r.rank}>
                  <td className="px-4 py-2 text-sm font-medium" style={{ borderBottom: '1px solid #E5E5EA' }}>{r.rank}</td>
                  <td className="px-4 py-2" style={{ borderBottom: '1px solid #E5E5EA' }}>
                    <span
                      className="inline-block px-3 py-1 rounded text-xs font-bold"
                      style={{ backgroundColor: GROUP_COLORS[r.group].bg, color: GROUP_COLORS[r.group].text }}
                    >
                      {r.group}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm font-semibold" style={{ borderBottom: '1px solid #E5E5EA' }}>{r.examCode}</td>
                  <td className="px-4 py-2 text-sm" style={{ borderBottom: '1px solid #E5E5EA' }}>{r.totalStudents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {totalStudentsAll} total students across {rooms.length} room{rooms.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Room tabs */}
      <div className="no-print flex flex-wrap gap-2 mb-6 justify-center">
        {rooms.map((room, i) => (
          <button
            key={i}
            onClick={() => setActiveRoom(i)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all border ${
              i === activeRoom
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-border hover:border-foreground'
            }`}
          >
            Room {room.roomNumber}
          </button>
        ))}
      </div>

      {/* Active room */}
      <div className="no-print" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="sm" onClick={goPrev} disabled={activeRoom === 0} className="text-xs rounded-md px-3">← Prev</Button>
          <h3 className="text-xl font-bold text-center">
            Room {rooms[activeRoom].roomNumber}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({rooms[activeRoom].students.length} students)
            </span>
          </h3>
          <Button variant="outline" size="sm" onClick={goNext} disabled={activeRoom === rooms.length - 1} className="text-xs rounded-md px-3">Next →</Button>
        </div>

        {/* Color legend for this room */}
        <div className="flex flex-wrap gap-3 justify-center mb-4">
          {roomGroupLegend.map(g => (
            <div key={g.group} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block rounded"
                style={{ width: 14, height: 14, backgroundColor: g.color.bg }}
              />
              <span className="font-bold">{g.group}</span>
              <span className="text-muted-foreground">— {g.codes.join(', ')}</span>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto pb-4">
          {renderRoomGrid(rooms[activeRoom])}
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
        <Button onClick={() => window.print()} className="px-12 h-12 text-base rounded-xl">
          Print All Rooms
        </Button>
      </div>

      {/* Print-only layout */}
      <div ref={printRef} className="hidden print:block print-container">
        {rooms.map((room, roomIdx) => {
          // Summary for this room
          const summaryMap = new Map<string, { dept: string; code: string; count: number; group: SeatGroup }>();
          room.grid.forEach((row, ri) => {
            row.forEach((s, ci) => {
              if (!s) return;
              const key = `${s.department}|${s.examCode}`;
              if (!summaryMap.has(key)) summaryMap.set(key, { dept: s.department, code: s.examCode, count: 0, group: getGroup(ri, ci) });
              summaryMap.get(key)!.count++;
            });
          });
          const summaryItems = Array.from(summaryMap.values()).sort((a, b) => b.count - a.count);

          return (
            <div key={roomIdx} className={roomIdx < rooms.length - 1 ? 'print-page-break' : ''}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '2px solid #000', paddingBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Room No: <span style={{ display: 'inline-block', width: 120, borderBottom: '1px solid #000' }}>&nbsp;</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Date: <span style={{ display: 'inline-block', width: 140, borderBottom: '1px solid #000' }}>&nbsp;</span>
                </div>
              </div>

              {/* Print grid */}
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    {Array.from({ length: 3 }).map((_, mc) => (
                      <React.Fragment key={mc}>
                        <th style={{ border: '1px solid #000', padding: '3px 2px', fontSize: 10, fontWeight: 700, textAlign: 'center', width: 28, backgroundColor: '#f0f0f0' }}>
                          S.No
                        </th>
                        {Array.from({ length: 3 }).map((_, sc) => (
                          <th key={sc} style={{ border: '1px solid #000', padding: '3px 4px', fontSize: 10, fontWeight: 700, textAlign: 'center', backgroundColor: '#f0f0f0' }}>
                            S{mc * 3 + sc + 1}
                          </th>
                        ))}
                        {mc < 2 && <th style={{ width: 8, border: 'none' }} />}
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {room.grid.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {Array.from({ length: 3 }).map((_, mc) => {
                        const seatNumber = mc * room.grid.length + rowIdx + 1;
                        return (
                          <React.Fragment key={mc}>
                            <td style={{ border: '1px solid #000', padding: '2px', fontSize: 10, fontWeight: 700, textAlign: 'center', backgroundColor: '#f0f0f0' }}>
                              {seatNumber}
                            </td>
                            {Array.from({ length: 3 }).map((_, sc) => {
                              const colIdx = mc * 3 + sc;
                              const student = row[colIdx];
                              const group = getGroup(rowIdx, colIdx);
                              const colors = GROUP_COLORS[group];
                              return (
                                <td key={sc} style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', height: 28 }}>
                                  {student ? (
                                    <span style={{ fontSize: 11, fontWeight: 700, color: colors.bg, fontFamily: 'monospace' }}>
                                      {student.rollNumber}
                                    </span>
                                  ) : null}
                                </td>
                              );
                            })}
                            {mc < 2 && <td style={{ width: 8, border: 'none' }} />}
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary footer */}
              <div style={{ marginTop: 10, borderTop: '2px solid #000', paddingTop: 6 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ border: '1px solid #000', padding: '3px 8px', fontSize: 10, textAlign: 'left', backgroundColor: '#f0f0f0' }}>Department</th>
                      <th style={{ border: '1px solid #000', padding: '3px 8px', fontSize: 10, textAlign: 'left', backgroundColor: '#f0f0f0' }}>Exam Code</th>
                      <th style={{ border: '1px solid #000', padding: '3px 8px', fontSize: 10, textAlign: 'center', backgroundColor: '#f0f0f0' }}>Group</th>
                      <th style={{ border: '1px solid #000', padding: '3px 8px', fontSize: 10, textAlign: 'center', backgroundColor: '#f0f0f0' }}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryItems.map((item, idx) => {
                      const colors = GROUP_COLORS[item.group];
                      return (
                        <tr key={idx}>
                          <td style={{ border: '1px solid #000', padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>{item.dept}</td>
                          <td style={{ border: '1px solid #000', padding: '2px 8px', fontSize: 10, color: colors.bg, fontWeight: 600 }}>{item.code}</td>
                          <td style={{ border: '1px solid #000', padding: '2px 8px', fontSize: 10, textAlign: 'center', fontWeight: 700 }}>{item.group}</td>
                          <td style={{ border: '1px solid #000', padding: '2px 8px', fontSize: 10, textAlign: 'center', fontWeight: 700 }}>{item.count}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={3} style={{ border: '1px solid #000', padding: '2px 8px', fontSize: 10, fontWeight: 700, textAlign: 'right' }}>Total</td>
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
