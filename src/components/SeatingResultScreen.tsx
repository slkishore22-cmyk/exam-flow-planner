import React, { useState, useRef, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { RoomAllocation, RoomConfig, PatternDecision, getDeptColor, getGroupLabel } from '@/lib/seating-utils';
import PrintRoomLayout, { getDeptShape } from './PrintRoomLayout';
import PrintSeatingLayout from './PrintSeatingLayout';
import { supabase } from '@/integrations/supabase/client';

interface SeatingResultScreenProps {
  rooms: RoomAllocation[];
  config: RoomConfig;
  patternDecision?: PatternDecision | null;
  onBack: () => void;
}

const SeatingResultScreen: React.FC<SeatingResultScreenProps> = ({ rooms, config, patternDecision, onBack }) => {
  const [activeRoom, setActiveRoom] = useState(0);
  const [visibleExamCodes, setVisibleExamCodes] = useState<Set<string>>(new Set());
  const [printMode, setPrintMode] = useState<'all' | 'single' | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [publishedSessionId, setPublishedSessionId] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [totalPublished, setTotalPublished] = useState(0);
  const [roomLabels, setRoomLabels] = useState<Record<number, string>>({});
  const [editingRoom, setEditingRoom] = useState<number | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const getRoomLabel = (room: RoomAllocation) =>
    (roomLabels[room.roomNumber]?.trim()) || String(room.roomNumber);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'ArrowRight') {
        setActiveRoom(prev => Math.min(prev + 1, rooms.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setActiveRoom(prev => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [rooms.length]);

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

  // Compute violations per room — skipped entirely for general-exam rooms
  // since same-code adjacency is expected/allowed there.
  const roomViolations = useMemo(() => {
    return rooms.map(room => {
      const violatedCells = new Set<string>();
      if (room.isGeneral) return { count: 0, violatedCells };
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

  // Global department-shape map: examCodes sorted alphabetically across ALL rooms
  const deptShapeMap = useMemo(() => {
    const codes = new Set<string>();
    rooms.forEach(r => r.students.forEach(s => codes.add(s.examCode)));
    const sorted = Array.from(codes).sort((a, b) => a.localeCompare(b));
    const map: Record<string, string> = {};
    sorted.forEach((code, i) => { map[code] = getDeptShape(i); });
    return map;
  }, [rooms]);

  // Toggle a body class so we can scope print CSS to single vs all
  useEffect(() => {
    if (printMode === 'single') document.body.classList.add('print-single');
    else document.body.classList.remove('print-single');
    return () => document.body.classList.remove('print-single');
  }, [printMode]);

  if (!rooms || rooms.length === 0) {
    return <div className="text-center py-20 text-muted-foreground">No rooms to display.</div>;
  }

  const handlePublish = async () => {
    if (publishing || isPublished) return;
    setPublishing(true);
    try {
      const sessionId = `session_${Date.now()}`;
      const rows: Array<{
        roll_number: string;
        room_number: string;
        seat_number: number;
        exam_code: string | null;
        dept: string | null;
        session_id: string;
        published_at: string;
      }> = [];
      const publishedAt = new Date().toISOString();
      const seen = new Set<string>();
      rooms.forEach(room => {
        const label = (roomLabels[room.roomNumber] ?? String(room.roomNumber)).trim() || String(room.roomNumber);
        room.students.forEach((student, idx) => {
          if (!student?.rollNumber || seen.has(student.rollNumber)) return;
          seen.add(student.rollNumber);
          rows.push({
            roll_number: student.rollNumber.toUpperCase(),
            room_number: label,
            seat_number: idx + 1,
            exam_code: student.examCode || null,
            dept: student.department || null,
            session_id: sessionId,
            published_at: publishedAt,
          });
        });
      });

      const { error } = await supabase
        .from('exam_seating_lookup')
        .upsert(rows, { onConflict: 'roll_number,session_id' });
      if (error) throw error;

      const { error: sessErr } = await supabase
        .from('exam_sessions')
        .upsert([{
          session_id: sessionId,
          total_students: rows.length,
          total_rooms: rooms.length,
          published_at: publishedAt,
          is_active: true,
        }]);
      if (sessErr) throw sessErr;

      setPublishedSessionId(sessionId);
      setTotalPublished(rows.length);
      setIsPublished(true);
      setShowQrModal(true);
    } catch (e: any) {
      alert('Publish failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setPublishing(false);
    }
  };

  const triggerPrint = (mode: 'all' | 'single') => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintMode(null), 200);
    }, 50);
  };

  const totalViolations = roomViolations.reduce((sum, v) => sum + v.count, 0);

  // Determine seat type label based on position
  const getSeatTypeLabel = (rowIdx: number, colIdx: number, seatsPerColumn: number): string => {
    const sc = colIdx % seatsPerColumn;
    if (sc === 0 || sc === seatsPerColumn - 1) return 'A';
    return 'B';
  };

  const renderRoomGrid = (room: RoomAllocation, roomIndex: number, forPrint = false) => {
    const violations = roomViolations[roomIndex];
    const showReveal = !forPrint;
    const isGeneral = !!room.isGeneral;
    const mainColumns = room.mainColumns ?? config.mainColumns;
    const seatsPerColumn = room.seatsPerColumn ?? config.seatsPerColumn;

    return (
      <table className="border-collapse mx-auto" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            {Array.from({ length: mainColumns }).map((_, mc) => (
              <React.Fragment key={mc}>
                {Array.from({ length: seatsPerColumn }).map((_, sc) => (
                  <th
                    key={`${mc}-${sc}`}
                    className="border border-border px-2 py-2 text-xs font-semibold bg-secondary text-secondary-foreground"
                    style={{ minWidth: 90 }}
                  >
                    {mc * seatsPerColumn + sc + 1}
                  </th>
                ))}
                {mc < mainColumns - 1 && (
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
                const mc = Math.floor(colIdx / seatsPerColumn);
                const sc = colIdx % seatsPerColumn;
                const isLastSubCol = sc === seatsPerColumn - 1;
                const isLastMainCol = mc === mainColumns - 1;
                const showSeparator = isLastSubCol && !isLastMainCol;

                const isOccupied = student !== null;
                const isVisible = forPrint ? true : (isOccupied && visibleExamCodes.has(student!.examCode));
                const isViolation = violations?.violatedCells.has(`${rowIdx}-${colIdx}`);
                const generalGroup: 'A' | 'B' = sc % 2 === 0 ? 'A' : 'B';
                const seatLabel = isGeneral ? generalGroup : getSeatTypeLabel(rowIdx, colIdx, seatsPerColumn);

                let cellContent: React.ReactNode;
                let cellBg: string;
                let cellBorder: string;

                if (!isOccupied) {
                  // Empty seat — colorless cell with small group label (A/B/C/D)
                  const group = isGeneral ? generalGroup : getGroupLabel(rowIdx, colIdx, seatsPerColumn);
                  cellBg = 'hsl(var(--background))';
                  cellBorder = '1px solid hsl(var(--border))';
                  cellContent = (
                    <span className="text-muted-foreground" style={{ fontSize: 11, fontWeight: 600 }}>
                      {group}
                    </span>
                  );
                } else if (!isVisible && showReveal) {
                  // Occupied but hidden — show placeholder with seat label
                  cellBg = 'hsl(var(--muted))';
                  cellBorder = '1px solid hsl(var(--border))';
                  cellContent = (
                    <span className="text-muted-foreground text-xs font-medium">{seatLabel}</span>
                  );
                } else {
                  // Visible — show full student info
                  const color = getDeptColor(student!.department);
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
                  Room {getRoomLabel(room)}: {v} violation{v !== 1 ? 's' : ''}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Room tabs */}
      <div className="no-print flex flex-wrap gap-2 mb-4 justify-center">
        {rooms.map((room, i) => {
          const hasViolation = roomViolations[i].count > 0;
          const label = getRoomLabel(room);
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
              Room {label}
              {hasViolation && <span style={{ color: '#EF4444' }}> •</span>}
            </button>
          );
        })}
      </div>

      {/* Room name editor */}
      <div className="no-print mb-6 flex items-center justify-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Rename room:</span>
        {rooms.map((room, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">#{room.roomNumber} →</span>
            <input
              type="text"
              value={roomLabels[room.roomNumber] ?? ''}
              onChange={e => setRoomLabels(prev => ({ ...prev, [room.roomNumber]: e.target.value }))}
              placeholder={String(room.roomNumber)}
              maxLength={20}
              className="px-2 py-1 text-xs border border-border rounded-md bg-background w-24 focus:outline-none focus:ring-1 focus:ring-foreground"
            />
          </div>
        ))}
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

      {/* Active room grid */}
      <div className="no-print">
        <h3 className="text-xl font-bold text-center mb-4">
          Room {getRoomLabel(rooms[activeRoom])}
          {rooms[activeRoom].isGeneral && (
            <span className="text-xs font-semibold ml-2 px-2 py-0.5 rounded-full" style={{ background: 'hsl(45, 100%, 90%)', color: 'hsl(35, 80%, 35%)' }}>
              GENERAL
            </span>
          )}
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

      {/* Print + Publish buttons */}
      <div className="no-print mt-8 flex flex-wrap gap-3 justify-center">
        <Button onClick={() => triggerPrint('single')} variant="outline" className="px-8 h-12 text-base rounded-xl">
          Print This Room
        </Button>
        <Button onClick={() => triggerPrint('all')} className="px-12 h-12 text-base rounded-xl">
          Print All Rooms
        </Button>
        <button
          onClick={handlePublish}
          disabled={publishing || isPublished}
          style={{
            padding: '0 24px', height: 48, borderRadius: 12,
            border: 'none',
            background: isPublished ? '#2E7D32' : '#1565C0',
            color: '#fff',
            cursor: publishing || isPublished ? 'default' : 'pointer',
            fontSize: 15, fontWeight: 500,
          }}
        >
          {publishing ? 'Publishing...' : isPublished ? '✓ Published to Students' : '📤 Publish to Students'}
        </button>
        {isPublished && (
          <Button variant="outline" onClick={() => setShowQrModal(true)} className="px-6 h-12 text-base rounded-xl">
            Show QR
          </Button>
        )}
      </div>

      {showQrModal && isPublished && (() => {
        const studentPageUrl = `${window.location.origin}/student?session=${publishedSessionId}`;
        return (
          <div className="no-print" style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}>
            <div style={{
              background: '#fff', borderRadius: 16, padding: 32,
              maxWidth: 400, width: '90%', textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Published Successfully</h2>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
                {totalPublished} students · {rooms.length} rooms
              </p>
              <div style={{
                display: 'inline-block', padding: 12,
                border: '1px solid #eee', borderRadius: 8, marginBottom: 16, background: '#fff',
              }}>
                <QRCodeSVG value={studentPageUrl} size={180} level="H" />
              </div>
              <p style={{ fontSize: 11, color: '#888', marginBottom: 16, wordBreak: 'break-all' }}>
                {studentPageUrl}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => navigator.clipboard.writeText(studentPageUrl)}
                  style={{ flex: 1, padding: 10, borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 }}
                >
                  Copy Link
                </button>
                <button
                  onClick={() => setShowQrModal(false)}
                  style={{ flex: 1, padding: 10, borderRadius: 6, border: 'none', background: '#1a1a1a', color: '#fff', cursor: 'pointer', fontSize: 13 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Print-only layout */}
      <div ref={printRef} id="print-area" className="hidden print:block print-root">
        {(printMode === 'single' ? [rooms[activeRoom]] : rooms).map((room, i, arr) => {
          const isLast = i === arr.length - 1;
          return (
            <div key={room.roomNumber} className={!isLast ? 'page-break' : ''}>
              <PrintSeatingLayout room={room} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SeatingResultScreen;
