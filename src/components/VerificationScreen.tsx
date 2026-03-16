import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { StudentRecord, PdfExtractionResult, getDeptColor, detectDepartment } from '@/lib/seating-utils';

interface VerificationScreenProps {
  students: StudentRecord[];
  pdfResults: PdfExtractionResult[];
  totalPdfs: number;
  onConfirm: (students: StudentRecord[]) => void;
  onBack: () => void;
}

const VerificationScreen: React.FC<VerificationScreenProps> = ({
  students: initialStudents,
  pdfResults,
  totalPdfs,
  onConfirm,
  onBack,
}) => {
  const [students, setStudents] = useState<StudentRecord[]>(initialStudents);
  const [newRoll, setNewRoll] = useState('');

  const totalRollNumbers = useMemo(
    () => pdfResults.reduce((sum, r) => sum + r.extractedCount, 0),
    [pdfResults]
  );

  const deptSummary = useMemo(() => {
    const map: Record<string, number> = {};
    students.forEach(s => {
      map[s.department] = (map[s.department] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [students]);

  const mismatches = useMemo(
    () => pdfResults.filter(r => r.declaredCount !== null && r.declaredCount !== r.extractedCount),
    [pdfResults]
  );

  const handleAdd = () => {
    const rn = newRoll.trim().toUpperCase();
    if (!rn) return;
    if (students.some(s => s.rollNumber === rn)) return;
    setStudents(prev => [...prev, { rollNumber: rn, department: detectDepartment(rn), sourcePdf: 'Manual' }]);
    setNewRoll('');
  };

  const handleDelete = (rollNumber: string) => {
    setStudents(prev => prev.filter(s => s.rollNumber !== rollNumber));
  };

  return (
    <div className="max-w-4xl mx-auto px-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {[
          { label: 'Total PDFs', value: totalPdfs },
          { label: 'Total Roll Numbers', value: totalRollNumbers },
          { label: 'Unique Students', value: students.length },
        ].map(stat => (
          <div key={stat.label} className="bg-secondary rounded-2xl p-6 text-center">
            <p className="text-3xl font-bold">{stat.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {mismatches.length > 0 && (
        <div className="mb-6 p-4 rounded-xl border" style={{ backgroundColor: 'hsl(38, 92%, 95%)', borderColor: 'hsl(38, 92%, 70%)' }}>
          <p className="font-semibold text-sm mb-2">⚠ Count Mismatch Detected</p>
          {mismatches.map(m => (
            <p key={m.fileName} className="text-sm">
              <strong>{m.fileName}</strong>: Declared {m.declaredCount}, Extracted {m.extractedCount}
              {' '}(difference: {Math.abs((m.declaredCount || 0) - m.extractedCount)})
            </p>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="border rounded-2xl overflow-hidden mb-6">
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary sticky top-0">
              <tr>
                <th className="text-left p-3 font-medium">S.No</th>
                <th className="text-left p-3 font-medium">Roll Number</th>
                <th className="text-left p-3 font-medium">Department</th>
                <th className="text-left p-3 font-medium">Source PDF</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.rollNumber} className="border-t">
                  <td className="p-3">{i + 1}</td>
                  <td className="p-3 font-mono">{s.rollNumber}</td>
                  <td className="p-3">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                      style={{ backgroundColor: getDeptColor(s.department) }}
                    >
                      {s.department}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground truncate max-w-[200px]">{s.sourcePdf}</td>
                  <td className="p-3">
                    <button
                      onClick={() => handleDelete(s.rollNumber)}
                      className="text-muted-foreground hover:text-destructive text-xs"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Department summary */}
      <div className="mb-6 p-4 bg-secondary rounded-2xl">
        <p className="text-sm font-semibold mb-3">Department Summary</p>
        <div className="flex flex-wrap gap-4">
          {deptSummary.map(([dept, count]) => (
            <div key={dept} className="flex items-center gap-2 text-sm">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: getDeptColor(dept) }}
              />
              <span className="font-medium">{dept}</span>
              <span className="text-muted-foreground">({count})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add roll number */}
      <div className="flex gap-2 mb-8">
        <input
          type="text"
          placeholder="Add a roll number manually"
          value={newRoll}
          onChange={e => setNewRoll(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="flex-1 px-4 py-2 border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button variant="outline" onClick={handleAdd} className="rounded-xl">
          Add
        </Button>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onBack} className="rounded-xl px-8 h-11">
          Edit
        </Button>
        <Button onClick={() => onConfirm(students)} className="rounded-xl px-8 h-11">
          Confirm and Continue
        </Button>
      </div>
    </div>
  );
};

export default VerificationScreen;
