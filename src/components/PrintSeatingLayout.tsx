import React, { useMemo } from 'react';
import { RoomAllocation } from '@/lib/seating-utils';

interface PrintSeatingLayoutProps {
  room: RoomAllocation;
  roomLabel?: string;
}

interface SeatEntry {
  seatNumber: number;
  rollNumber: string;
  examCode: string;
  department: string;
}

const PrintSeatingLayout: React.FC<PrintSeatingLayoutProps> = ({ room, roomLabel }) => {
  const seats: SeatEntry[] = useMemo(() => {
    const list: SeatEntry[] = [];
    let seatNo = 0;
    for (let r = 0; r < room.grid.length; r++) {
      for (let c = 0; c < (room.grid[r]?.length || 0); c++) {
        const s = room.grid[r][c];
        if (!s) continue;
        seatNo++;
        list.push({
          seatNumber: seatNo,
          rollNumber: s.rollNumber,
          examCode: s.examCode,
          department: s.department,
        });
      }
    }
    return list;
  }, [room]);

  // Fixed grid: 3 MAIN tables × (3 SUB-cols of roll+seat) × 5 ROWS.
  // Fill order: within a main, fill column-by-column (sub) top-to-bottom,
  // then move to next main. Total 45 per sheet.
  const ROWS = 5;
  const SUBS = 3;
  const MAINS = 3;
  const PER_MAIN = SUBS * ROWS; // 15

  // Subject summary
  const subjectSummary = useMemo(() => {
    const map = new Map<string, { department: string; examCode: string; count: number }>();
    seats.forEach(s => {
      const key = `${s.department}|${s.examCode}`;
      const existing = map.get(key);
      if (existing) existing.count++;
      else map.set(key, { department: s.department, examCode: s.examCode, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) =>
      a.department.localeCompare(b.department) || a.examCode.localeCompare(b.examCode)
    );
  }, [seats]);

  const total = seats.length;

  return (
    <div className="print-seating-sheet">
      {/* HEADER */}
      <div className="ps-header">
        <div className="ps-h1">UNIVERSITY EXAMINATION – APRIL / MAY 2026</div>
        <div className="ps-h2">SEATING MATRIX</div>
        <div className="ps-h3">MAIN BUILDING</div>
      </div>

      {/* META */}
      <div className="ps-meta">
        <div>DATE: ____________</div>
        <div>SESSION: ________</div>
        <div>ROOM NO: {roomLabel ?? room.roomNumber}</div>
      </div>

      {/* SEATING TABLES — 3 main tables side by side, each 3 sub-cols × 5 rows */}
      <div className="ps-panels">
        {Array.from({ length: MAINS }).map((_, m) => (
          <table key={m} className="ps-seat-table">
            <tbody>
              {Array.from({ length: ROWS }).map((_, r) => (
                <tr key={r}>
                  {Array.from({ length: SUBS }).map((_, s) => {
                    const idx = m * PER_MAIN + s * ROWS + r;
                    const entry = seats[idx] || null;
                    return (
                      <React.Fragment key={s}>
                        <td className="ps-roll">{entry ? entry.rollNumber : ''}</td>
                        <td className="ps-seat">{entry ? entry.seatNumber : ''}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      {/* BOTTOM SECTION */}
      <div className="ps-bottom">
        <div className="ps-bottom-left">
          <table className="ps-summary-table">
            <thead>
              <tr>
                <th>DEGREE</th>
                <th>SUB. CODE</th>
                <th>COUNT</th>
              </tr>
            </thead>
            <tbody>
              {subjectSummary.map((row, i) => (
                <tr key={i}>
                  <td>{row.department}</td>
                  <td>{row.examCode}</td>
                  <td className="ps-num">{row.count}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}><strong>TOTAL</strong></td>
                <td className="ps-num"><strong>{total}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="ps-bottom-right">
          <table className="ps-count-table">
            <tbody>
              <tr><td>NO. OF PRESENT</td><td className="ps-blank" /></tr>
              <tr><td>NO. OF ABSENT</td><td className="ps-blank" /></tr>
              <tr><td><strong>TOTAL</strong></td><td className="ps-num"><strong>{total}</strong></td></tr>
            </tbody>
          </table>

          <table className="ps-malpractice-table">
            <thead>
              <tr>
                <th colSpan={2}>MALPRACTICES DETAILS</th>
              </tr>
              <tr>
                <th>S.NO.</th>
                <th>REGISTER NUMBER</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map(n => (
                <tr key={n}>
                  <td className="ps-num">{n}</td>
                  <td className="ps-blank" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FOOTER */}
      <div className="ps-footer">
        NAME AND SIGN OF INVIGILATOR: ______________________________________
      </div>
    </div>
  );
};

export default PrintSeatingLayout;
