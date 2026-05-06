import React, { useMemo } from 'react';
import { RoomAllocation } from '@/lib/seating-utils';

interface PrintSeatingLayoutProps {
  room: RoomAllocation;
}

interface SeatEntry {
  seatNumber: number;
  rollNumber: string;
  examCode: string;
  department: string;
}

const PrintSeatingLayout: React.FC<PrintSeatingLayoutProps> = ({ room }) => {
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

  // Single combined table: each row holds 3 (roll|seat) pairs side-by-side.
  // Fill DOWN each panel column first (column-major) so reading top-to-bottom
  // in column 1, then column 2, then column 3 gives the seat sequence.
  const PANELS = 3;
  const rowsPerPanel = Math.ceil(seats.length / PANELS);
  const tableRows: (SeatEntry | null)[][] = [];
  for (let r = 0; r < rowsPerPanel; r++) {
    const row: (SeatEntry | null)[] = [];
    for (let p = 0; p < PANELS; p++) {
      row.push(seats[p * rowsPerPanel + r] || null);
    }
    tableRows.push(row);
  }

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
        <div>ROOM NO: {room.roomNumber}</div>
      </div>

      {/* SEATING TABLE — 3 panels side by side */}
      <div className="ps-panels">
        {panels.map((panel, pi) => (
          <table key={pi} className="ps-seat-table">
            <thead>
              <tr>
                <th>ROLL NUMBER</th>
                <th>SEAT</th>
              </tr>
            </thead>
            <tbody>
              {panel.map(s => (
                <tr key={s.seatNumber}>
                  <td className="ps-roll">{s.rollNumber}</td>
                  <td className="ps-seat">{s.seatNumber}</td>
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
