import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RoomAllocation } from '@/lib/seating-utils';
import { deptFromExamCode } from '@/lib/dept-mapping';

interface PrintSheetProps {
  rooms: RoomAllocation[];
}

interface PrintForm {
  institution: string;
  date: string;
  session: string;
  block: string;
  floor: string;
  invigilator: string;
}

const PrintSheet: React.FC<PrintSheetProps> = ({ rooms }) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [form, setForm] = useState<PrintForm>({
    institution: '',
    date: '',
    session: '',
    block: '',
    floor: '',
    invigilator: '',
  });

  const room = rooms[selectedIdx];

  // Build flat 45-seat list (seat 1..45) for this room from its grid in row-major order.
  const seatList = useMemo(() => {
    if (!room) return [];
    const list: { seatNo: number; examCode: string }[] = [];
    let idx = 0;
    for (let r = 0; r < room.grid.length; r++) {
      for (let c = 0; c < room.grid[r].length; c++) {
        idx++;
        const s = room.grid[r][c];
        list.push({ seatNo: idx, examCode: s ? s.examCode : '' });
      }
    }
    // Pad/truncate to 45
    while (list.length < 45) list.push({ seatNo: list.length + 1, examCode: '' });
    return list.slice(0, 45);
  }, [room]);

  const examCodeSummary = useMemo(() => {
    if (!room) return [];
    const map = new Map<string, number>();
    room.students.forEach(s => map.set(s.examCode, (map.get(s.examCode) || 0) + 1));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, dept: deptFromExamCode(code), count }));
  }, [room]);

  const totalSeated = room?.students.length || 0;

  // Split 45 seats into 3 columns of 15
  const col1 = seatList.slice(0, 15);
  const col2 = seatList.slice(15, 30);
  const col3 = seatList.slice(30, 45);

  const handlePrint = () => window.print();

  if (!room) return null;

  const blank = (val: string) => val.trim() ? val : '\u00A0';

  return (
    <div className="max-w-6xl mx-auto px-4">
      {/* Form (screen-only) */}
      <div className="no-print bg-secondary rounded-2xl p-6 mb-6">
        <h3 className="text-lg font-bold mb-4">Print Sheet Details</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <Label htmlFor="institution">Institution Name</Label>
            <Input id="institution" value={form.institution}
              onChange={e => setForm({ ...form, institution: e.target.value })}
              placeholder="e.g. ABC College" />
          </div>
          <div>
            <Label htmlFor="date">Date</Label>
            <Input id="date" value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
              placeholder="e.g. 25/04/2026" />
          </div>
          <div>
            <Label htmlFor="session">Session</Label>
            <Input id="session" value={form.session}
              onChange={e => setForm({ ...form, session: e.target.value })}
              placeholder="e.g. FN / AN" />
          </div>
          <div>
            <Label htmlFor="block">Block / Building</Label>
            <Input id="block" value={form.block}
              onChange={e => setForm({ ...form, block: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="floor">Floor</Label>
            <Input id="floor" value={form.floor}
              onChange={e => setForm({ ...form, floor: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="invigilator">Invigilator Name</Label>
            <Input id="invigilator" value={form.invigilator}
              onChange={e => setForm({ ...form, invigilator: e.target.value })} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[220px]">
            <Label htmlFor="room-select">Select Room to Print</Label>
            <select
              id="room-select"
              value={selectedIdx}
              onChange={e => setSelectedIdx(Number(e.target.value))}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {rooms.map((r, i) => (
                <option key={i} value={i}>
                  Room {r.roomNumber} — {r.students.length} students
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handlePrint} className="h-10 px-8 rounded-xl">
            Print this Room
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Total seated in Room {room.roomNumber}: <strong>{totalSeated} / 45</strong>
        </p>
      </div>

      {/* Print Sheet (printable) */}
      <div className="print-sheet bg-white text-black border border-border rounded-xl p-6">
        {/* Header */}
        <div className="text-center font-bold" style={{ fontSize: '13pt' }}>
          {blank(form.institution) === '\u00A0' ? '__________________________' : form.institution}
        </div>
        <hr className="my-2" style={{ borderTop: '1px solid #000' }} />

        <table className="w-full mb-3" style={{ fontSize: '10pt' }}>
          <tbody>
            <tr>
              <td className="py-1"><strong>Date:</strong> <span className="hand-fill">{blank(form.date)}</span></td>
              <td className="py-1"><strong>Session:</strong> <span className="hand-fill">{blank(form.session)}</span></td>
              <td className="py-1"><strong>Room No:</strong> <span className="hand-fill">{room.roomNumber}</span></td>
            </tr>
            <tr>
              <td className="py-1"><strong>Block/Building:</strong> <span className="hand-fill">{blank(form.block)}</span></td>
              <td className="py-1"><strong>Floor:</strong> <span className="hand-fill">{blank(form.floor)}</span></td>
              <td className="py-1"><strong>Total Seats:</strong> {totalSeated} / 45</td>
            </tr>
          </tbody>
        </table>

        {/* Exam codes info box */}
        <div className="exam-info-box" style={{ border: '1px solid #000', padding: '6px 10px', marginBottom: '10px' }}>
          <div style={{ fontWeight: 700, fontSize: '10pt', marginBottom: 4 }}>Exam codes in this room:</div>
          <table style={{ width: '100%', fontSize: '9pt', borderCollapse: 'collapse' }}>
            <tbody>
              {examCodeSummary.map(ec => (
                <tr key={ec.code}>
                  <td style={{ padding: '2px 6px', width: '25%' }}><strong>{ec.code}</strong></td>
                  <td style={{ padding: '2px 6px', width: '50%' }}>— {ec.dept || '—'}</td>
                  <td style={{ padding: '2px 6px', width: '25%', textAlign: 'right' }}>{ec.count} seats</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 3-column seat table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr>
              {[col1, col2, col3].map((_, i) => (
                <React.Fragment key={i}>
                  <th style={thStyle()}>S.No</th>
                  <th style={thStyle()}>Roll Number</th>
                  <th style={thStyle()}>Exam Code</th>
                  {i < 2 && <th style={{ width: 8, border: 'none' }}></th>}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 15 }).map((_, rowIdx) => {
              const a = col1[rowIdx];
              const b = col2[rowIdx];
              const c = col3[rowIdx];
              return (
                <tr key={rowIdx}>
                  <td style={tdStyle({ width: '5%', textAlign: 'center' })}>{a.seatNo}</td>
                  <td style={tdStyle({ width: '22%' })}>&nbsp;</td>
                  <td style={tdStyle({ width: '6%', textAlign: 'center' })}>{a.examCode}</td>
                  <td style={{ width: 8, border: 'none' }}></td>
                  <td style={tdStyle({ width: '5%', textAlign: 'center' })}>{b.seatNo}</td>
                  <td style={tdStyle({ width: '22%' })}>&nbsp;</td>
                  <td style={tdStyle({ width: '6%', textAlign: 'center' })}>{b.examCode}</td>
                  <td style={{ width: 8, border: 'none' }}></td>
                  <td style={tdStyle({ width: '5%', textAlign: 'center' })}>{c.seatNo}</td>
                  <td style={tdStyle({ width: '22%' })}>&nbsp;</td>
                  <td style={tdStyle({ width: '6%', textAlign: 'center' })}>{c.examCode}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer signatures */}
        <table style={{ width: '100%', marginTop: '24px', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <tbody>
            <tr>
              <td style={sigCellStyle()}>
                <div style={{ height: 36, borderBottom: '1px solid #000', marginBottom: 4 }}>
                  <div style={{ paddingTop: 18, paddingLeft: 4, fontStyle: 'italic' }}>{form.invigilator}</div>
                </div>
                <div style={{ textAlign: 'center', fontWeight: 600 }}>Invigilator Signature &amp; Name</div>
              </td>
              <td style={sigCellStyle()}>
                <div style={{ height: 36, borderBottom: '1px solid #000', marginBottom: 4 }}></div>
                <div style={{ textAlign: 'center', fontWeight: 600 }}>Chief Superintendent</div>
              </td>
              <td style={sigCellStyle()}>
                <div style={{ height: 36, borderBottom: '1px solid #000', marginBottom: 4 }}></div>
                <div style={{ textAlign: 'center', fontWeight: 600 }}>Controller of Examinations</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

function thStyle(): React.CSSProperties {
  return {
    border: '1px solid #000',
    padding: '4px 6px',
    fontWeight: 700,
    background: '#fff',
    textAlign: 'center',
  };
}

function tdStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    border: '1px solid #000',
    padding: '4px 6px',
    height: 22,
    ...extra,
  };
}

function sigCellStyle(): React.CSSProperties {
  return {
    border: '1px solid #000',
    padding: '6px 10px',
    width: '33.33%',
    verticalAlign: 'top',
  };
}

export default PrintSheet;
