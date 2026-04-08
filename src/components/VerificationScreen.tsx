import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { StudentRecord, PdfExtractionResult, getExamCodeColor } from '@/lib/seating-utils';

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
  const [selectedExamCode, setSelectedExamCode] = useState<string | null>(null);

  const totalRollNumbers = useMemo(
    () => pdfResults.reduce((sum, r) => sum + r.extractedCount, 0),
    [pdfResults]
  );

  // Group by department + examCode
  const deptSummary = useMemo(() => {
    const map: Record<string, { dept: string; examCode: string; count: number }> = {};
    students.forEach(s => {
      const key = `${s.department}||${s.examCode}`;
      if (!map[key]) map[key] = { dept: s.department, examCode: s.examCode, count: 0 };
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [students]);

  const mismatches = useMemo(
    () => pdfResults.filter(r => r.declaredCount !== null && r.declaredCount !== r.extractedCount),
    [pdfResults]
  );

  const handleAdd = () => {
    const rn = newRoll.trim().toUpperCase();
    if (!rn) return;
    if (students.some(s => s.rollNumber === rn)) return;

    // Use selected exam code if available, otherwise UNKNOWN
    const dept = selectedExamCode
      ? (deptSummary.find(d => d.examCode === selectedExamCode)?.dept || 'UNKNOWN')
      : 'UNKNOWN';
    const examCode = selectedExamCode || 'UNKNOWN';

    setStudents(prev => [...prev, { rollNumber: rn, department: dept, examCode, sourcePdf: 'Manual' }]);
    setNewRoll('');
  };

  const handleDelete = (rollNumber: string) => {
    setStudents(prev => prev.filter(s => s.rollNumber !== rollNumber));
  };

  // Get unique exam codes for click-to-fill
  const uniqueExamCodes = useMemo(() => {
    const codes = new Set(students.map(s => s.examCode));
    return Array.from(codes).filter(c => c !== 'UNKNOWN').sort();
  }, [students]);

  return (
    <div className="max-w-5xl mx-auto px-4">
      <Button variant="outline" onClick={onBack} className="rounded-xl px-6 h-10 text-sm mb-6 border-foreground text-foreground bg-background hover:bg-secondary">
        ← Back
      </Button>

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
                <th className="text-left p-3 font-medium">Exam Code</th>
                <th className="text-left p-3 font-medium">Source PDF</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => {
                const color = getExamCodeColor(s.examCode);
                return (
                  <tr key={s.rollNumber} className="border-t">
                    <td className="p-3">{i + 1}</td>
                    <td className="p-3 font-mono">{s.rollNumber}</td>
                    <td className="p-3">
                      <span
                        className="inline-block px-2.5 py-1 rounded text-xs font-semibold"
                        style={{ backgroundColor: color.bg, color: color.text }}
                      >
                        {s.department}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-semibold" style={{ color: '#D4AF37' }}>{s.examCode}</td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Department summary — grouped by dept + examCode */}
      <div className="mb-6 p-4 bg-secondary rounded-2xl">
        <p className="text-sm font-semibold mb-3">Department Summary</p>
        <div className="flex flex-col gap-2">
          {deptSummary.map((entry) => {
            const color = getExamCodeColor(entry.examCode);
            return (
              <div key={`${entry.dept}-${entry.examCode}`} className="flex items-center gap-3 text-sm">
                <span
                  className="w-5 h-5 rounded inline-block flex-shrink-0"
                  style={{ backgroundColor: color.bg }}
                />
                <span className="font-medium w-24">{entry.dept}</span>
                <span className="font-mono font-semibold w-20" style={{ color: '#D4AF37' }}>{entry.examCode}</span>
                <span className="text-muted-foreground">{entry.count} students</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Click-to-fill exam code selector */}
      {uniqueExamCodes.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-semibold mb-2">Select Exam Code for Manual Entry</p>
          <div className="flex flex-wrap gap-2">
            {uniqueExamCodes.map(code => {
              const color = getExamCodeColor(code);
              const isSelected = selectedExamCode === code;
              return (
                <button
                  key={code}
                  onClick={() => setSelectedExamCode(isSelected ? null : code)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border-2 ${
                    isSelected ? 'ring-2 ring-ring ring-offset-2' : ''
                  }`}
                  style={{
                    backgroundColor: isSelected ? color.bg : 'transparent',
                    color: isSelected ? color.text : color.bg,
                    borderColor: color.bg,
                  }}
                >
                  {code}
                </button>
              );
            })}
            {selectedExamCode && (
              <button
                onClick={() => setSelectedExamCode(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground border border-border hover:bg-secondary"
              >
                Clear
              </button>
            )}
          </div>
          {selectedExamCode && (
            <p className="text-xs text-muted-foreground mt-1">
              New roll numbers will be added under <strong>{selectedExamCode}</strong>
            </p>
          )}
        </div>
      )}

      {/* Add roll number */}
      <div className="flex gap-2 mb-8">
        <input
          type="text"
          placeholder={selectedExamCode ? `Add roll number for ${selectedExamCode}` : "Add a roll number manually"}
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
        <Button onClick={() => onConfirm(students)} className="rounded-xl px-8 h-11">
          Confirm and Continue
        </Button>
      </div>
    </div>
  );
};

export default VerificationScreen;
