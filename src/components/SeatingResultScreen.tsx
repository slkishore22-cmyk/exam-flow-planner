import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { RoomAllocation, RoomConfig, PatternDecision, getDeptColor } from '@/lib/seating-utils';

interface SeatingResultScreenProps {
  rooms: RoomAllocation[];
  config: RoomConfig;
  patternDecision?: PatternDecision | null;
  onBack: () => void;
}

const SeatingResultScreen: React.FC<SeatingResultScreenProps> = ({ rooms, config, patternDecision, onBack }) => {
  const [activeRoom, setActiveRoom] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

  // Collect unique departments across all rooms for legend
  const allDepts = React.useMemo(() => {
    if (!rooms || rooms.length === 0) return [];
    const set = new Set<string>();
    rooms.forEach(r => r.students.forEach(s => set.add(s.department)));
    return Array.from(set);
  }, [rooms]);

  // Compute violations per room: cells where same examCode is adjacent
  const roomViolations = React.useMemo(() => {
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

  const handlePrint = () => {
    window.print();
  };

  const totalViolations = roomViolations.reduce((sum, v) => sum + v.count, 0);

  const renderRoomGrid = (room: RoomAllocation, roomIndex: number, forPrint = false) => {
    const violations = roomViolations[roomIndex];
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

                const color = student ? getDeptColor(student.department) : null;
                const isViolation = violations?.violatedCells.has(`${rowIdx}-${colIdx}`);

                const cell = (
                  <td
                    key={`${rowIdx}-${colIdx}`}
                    className="text-center align-middle"
                    style={{
                      minWidth: 90,
                      height: 65,
                      backgroundColor: student ? color!.bg : 'hsl(var(--muted))',
                      padding: '4px 6px',
                      border: isViolation ? '3px solid #EF4444' : '2px solid white',
                      boxShadow: isViolation ? 'inset 0 0 8px rgba(239,68,68,0.4)' : undefined,
                    }}
                  >
                    {student ? (
                      <div className="flex flex-col items-center justify-center gap-0">
                        <span style={{ fontSize: 9, color: color!.text, fontWeight: 500 }}>
                          {student.department}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#FFD700' }}>
                          {student.examCode}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: color!.text, fontFamily: 'monospace' }}>
                          {student.rollNumber}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
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

      {/* Violation summary - red box */}
      {totalViolations > 0 && (
        <div className="no-print mb-6 p-4 rounded-2xl border-2" style={{ backgroundColor: '#FEF2F2', borderColor: '#EF4444' }}>
          <p className="font-bold text-sm" style={{ color: '#DC2626' }}>
            ⚠ SEATING VIOLATIONS DETECTED
          </p>
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

      {/* Color legend */}
      <div className="no-print mb-6 p-4 bg-secondary rounded-2xl">
        <p className="text-sm font-bold mb-3 tracking-wide uppercase">Color Legend</p>
        <div className="flex flex-wrap gap-4">
          {allDepts.map(dept => {
            const color = getDeptColor(dept);
            return (
              <div key={dept} className="flex items-center gap-2">
                <span className="w-6 h-6 rounded inline-block" style={{ backgroundColor: color.bg }} />
                <span className="text-sm font-semibold">{dept}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active room grid */}
      <div className="no-print">
        <h3 className="text-xl font-bold text-center mb-4">
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
        <div className="overflow-x-auto pb-4">
          {renderRoomGrid(rooms[activeRoom], activeRoom)}
        </div>
      </div>

      {/* Print button */}
      <div className="no-print mt-8 text-center">
        <Button onClick={handlePrint} className="px-12 h-12 text-base rounded-xl">
          Print All Rooms
        </Button>
      </div>

      {/* Print-only: all rooms */}
      <div ref={printRef} className="hidden print:block">
        {rooms.map((room, i) => (
          <div key={i} className={i < rooms.length - 1 ? 'print-page-break' : ''}>
            <h2 className="text-xl font-bold text-center mb-4 mt-4">
              Room {room.roomNumber} — {room.students.length} students
              {roomViolations[i].count > 0 && (
                <span style={{ color: '#EF4444' }}> — {roomViolations[i].count} violations</span>
              )}
            </h2>
            {renderRoomGrid(room, i, true)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SeatingResultScreen;
