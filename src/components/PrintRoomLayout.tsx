import React, { useMemo } from 'react';
import { RoomAllocation, RoomConfig } from '@/lib/seating-utils';

const DEPT_SHAPES = ['■', '●', '▲', '◆', '★'];

export function getDeptShape(groupIndex: number): string {
  return DEPT_SHAPES[Math.min(groupIndex, DEPT_SHAPES.length - 1)];
}

interface PrintRoomLayoutProps {
  room: RoomAllocation;
  config: RoomConfig;
  /** Global department-shape map shared across all printed rooms */
  deptShapeMap: Record<string, string>;
}

const PrintRoomLayout: React.FC<PrintRoomLayoutProps> = ({ room, config, deptShapeMap }) => {
  const mainColumns = room.mainColumns ?? config.mainColumns;
  const seatsPerColumn = room.seatsPerColumn ?? config.seatsPerColumn;

  // Per-room department counts (by examCode, since that's what users see in summaries)
  const deptCounts = useMemo(() => {
    const map = new Map<string, { count: number; department: string }>();
    room.students.forEach(s => {
      const existing = map.get(s.examCode);
      if (existing) existing.count++;
      else map.set(s.examCode, { count: 1, department: s.department });
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([examCode, v]) => ({
        examCode,
        department: v.department,
        count: v.count,
        shape: deptShapeMap[examCode] ?? '★',
      }));
  }, [room, deptShapeMap]);

  const totalStudents = room.students.length;

  return (
    <div className="print-room">
      {/* SECTION 1 — HEADER */}
      <div className="print-header">
        <div className="print-header-left">
          <div className="print-college">College Name</div>
          <div className="print-subtitle">Exam Seating Arrangement</div>
        </div>
        <div className="print-header-right">
          <div>Room No: {room.roomNumber} ________</div>
          <div>Exam Date: ________________</div>
          <div>Exam / Subject: ____________________</div>
        </div>
      </div>
      <div className="print-hr" />

      {/* SECTION 2 — DEPARTMENT SUMMARY BAR */}
      <div className="print-summary-bar">
        <span className="print-summary-item"><strong>Total Students: {totalStudents}</strong></span>
        {deptCounts.map(d => (
          <span key={d.examCode} className="print-summary-item">
            <span className="print-shape">{d.shape}</span> {d.examCode}: {d.count} students
          </span>
        ))}
      </div>

      {/* SECTION 3 — SEAT TABLE */}
      <table className="print-seat-table">
        <thead>
          <tr>
            {Array.from({ length: mainColumns }).map((_, mc) => (
              <React.Fragment key={mc}>
                <th colSpan={seatsPerColumn * 2} className="print-col-label">
                  COLUMN {mc + 1}
                </th>
                {mc < mainColumns - 1 && <th className="print-col-divider" />}
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
                const showRowLabel = colIdx === 0;
                const shape = student ? deptShapeMap[student.examCode] ?? '★' : '';

                return (
                  <React.Fragment key={`${rowIdx}-${colIdx}`}>
                    {showRowLabel && (
                      <td className="print-row-label">R{rowIdx + 1}</td>
                    )}
                    <td className="print-seat-cell">
                      {student ? (
                        <div className="print-seat-card">
                          <span className="print-seat-shape">{shape}</span>
                          <span className="print-seat-roll">{student.rollNumber}</span>
                        </div>
                      ) : (
                        <div className="print-seat-card print-seat-empty">&nbsp;</div>
                      )}
                    </td>
                    <td className="print-checkbox-cell">
                      <span className="print-checkbox" />
                    </td>
                    {showSeparator && <td className="print-col-divider" />}
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* SECTION 4 — ATTENDANCE SUMMARY TABLE */}
      <table className="print-attendance-table">
        <thead>
          <tr>
            <th>Department</th>
            <th>Total Students</th>
            <th>Present</th>
            <th>Absent</th>
          </tr>
        </thead>
        <tbody>
          {deptCounts.map(d => (
            <tr key={d.examCode}>
              <td><span className="print-shape">{d.shape}</span> {d.examCode}</td>
              <td className="print-num">{d.count}</td>
              <td className="print-blank-cell" />
              <td className="print-blank-cell" />
            </tr>
          ))}
          <tr className="print-total-row">
            <td><strong>TOTAL</strong></td>
            <td className="print-num"><strong>{totalStudents}</strong></td>
            <td className="print-blank-cell" />
            <td className="print-blank-cell" />
          </tr>
        </tbody>
      </table>

      {/* SECTION 5 — INVIGILATOR SIGN-OFF */}
      <div className="print-signoff">
        <div className="print-signoff-left">
          <div>Invigilator Name: _______________________________</div>
          <div>Date: _______________</div>
          <div>Time In: ____________ &nbsp;&nbsp; Time Out: ____________</div>
        </div>
        <div className="print-signoff-right">
          <div>Signature:</div>
          <div className="print-signature-box" />
        </div>
      </div>
      <div className="print-hr-thin" />
      <div className="print-remarks">
        <div>Remarks: _____________________________________________</div>
        <div>____________________________________________</div>
      </div>
    </div>
  );
};

export default PrintRoomLayout;
