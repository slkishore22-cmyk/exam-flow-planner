import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { StudentRecord, PdfExtractionResult, getDeptColor, getExamCodeColor } from '@/lib/seating-utils';

interface VerificationScreenProps {
  students: StudentRecord[];
  pdfResults: PdfExtractionResult[];
  totalPdfs: number;
  onConfirm: (students: StudentRecord[]) => void;
  onBack: () => void;
}

const GENERAL_EXAM_THRESHOLD = 500;

const VerificationScreen: React.FC<VerificationScreenProps> = ({
  students: initialStudents,
  pdfResults,
  totalPdfs,
  onConfirm,
  onBack,
}) => {
  const [students, setStudents] = useState<StudentRecord[]>(initialStudents);
  const [newRoll, setNewRoll] = useState('');
  const [generalExamCode, setGeneralExamCode] = useState<string | null>(null);
  const [dismissedGeneralPrompt, setDismissedGeneralPrompt] = useState<string | null>(null);

  const totalRollNumbers = useMemo(
    () => pdfResults.reduce((sum, r) => sum + r.extractedCount, 0),
    [pdfResults]
  );

  // Group by exam code → list departments writing that exam
  const examCodeSummary = useMemo(() => {
    const map: Record<string, { examCode: string; depts: Record<string, number>; total: number }> = {};
    students.forEach(s => {
      if (!map[s.examCode]) map[s.examCode] = { examCode: s.examCode, depts: {}, total: 0 };
      map[s.examCode].depts[s.department] = (map[s.examCode].depts[s.department] || 0) + 1;
      map[s.examCode].total++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [students]);

  // Largest exam code candidate for "general exam" prompt
  const generalCandidate = useMemo(() => {
    const top = examCodeSummary[0];
    if (!top) return null;
    if (top.total < GENERAL_EXAM_THRESHOLD) return null;
    return top;
  }, [examCodeSummary]);

  const showGeneralPrompt =
    generalCandidate &&
    generalCandidate.examCode !== generalExamCode &&
    generalCandidate.examCode !== dismissedGeneralPrompt;

  const markGeneral = (examCode: string) => {
    setGeneralExamCode(examCode);
    setStudents(prev => prev.map(s => ({ ...s, isGeneral: s.examCode === examCode })));
  };

  const unmarkGeneral = () => {
    setGeneralExamCode(null);
    setStudents(prev => prev.map(s => ({ ...s, isGeneral: false })));
  };

  const mismatches = useMemo(
    () => pdfResults.filter(r => r.declaredCount !== null && r.declaredCount !== r.extractedCount),
    [pdfResults]
  );

  const handleAdd = () => {
    const rn = newRoll.trim().toUpperCase();
    if (!rn) return;
    if (students.some(s => s.rollNumber === rn)) return;
    setStudents(prev => [...prev, { rollNumber: rn, department: 'UNKNOWN', examCode: 'UNKNOWN', sourcePdf: 'Manual' }]);
    setNewRoll('');
  };

  const handleDelete = (rollNumber: string) => {
    setStudents(prev => prev.filter(s => s.rollNumber !== rollNumber));
  };

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

      {/* General-exam prompt — appears when largest exam code crosses threshold */}
      {showGeneralPrompt && generalCandidate && (
        <div
          className="mb-6 p-5 rounded-2xl border-2"
          style={{ backgroundColor: 'hsl(45, 100%, 96%)', borderColor: 'hsl(45, 90%, 55%)' }}
        >
          <p className="font-semibold text-sm mb-1">
            Is <span className="font-mono">{generalCandidate.examCode}</span> a general exam?
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            <span className="font-mono font-semibold">{generalCandidate.examCode}</span> has{' '}
            <strong>{generalCandidate.total}</strong> students — unusually high. If this is a general exam,
            those students will be seated in dedicated 30-seat rooms (
            <strong>{Math.ceil(generalCandidate.total / 30)} rooms</strong> required), and the rest will follow normal seating.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => markGeneral(generalCandidate.examCode)}
              className="rounded-xl px-6 h-9 text-sm"
            >
              Yes, it's a general exam
            </Button>
            <Button
              variant="outline"
              onClick={() => setDismissedGeneralPrompt(generalCandidate.examCode)}
              className="rounded-xl px-6 h-9 text-sm"
            >
              No, treat normally
            </Button>
          </div>
        </div>
      )}

      {/* Active general-exam banner */}
      {generalExamCode && (
        <div
          className="mb-6 p-4 rounded-2xl border flex items-center justify-between"
          style={{ backgroundColor: 'hsl(142, 50%, 95%)', borderColor: 'hsl(142, 50%, 60%)' }}
        >
          <p className="text-sm">
            ✓ <span className="font-mono font-semibold">{generalExamCode}</span> marked as general exam —{' '}
            <strong>{students.filter(s => s.isGeneral).length}</strong> students will be allocated to{' '}
            <strong>{Math.ceil(students.filter(s => s.isGeneral).length / 30)}</strong> dedicated 30-seat rooms first.
          </p>
          <Button variant="ghost" size="sm" onClick={unmarkGeneral} className="text-xs">
            Undo
          </Button>
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
                const color = getDeptColor(s.department);
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

      {/* Exam code summary — grouped by exam code, colored by exam code */}
      <div className="mb-6 p-4 bg-secondary rounded-2xl">
        <p className="text-sm font-semibold mb-3">Exam Code Summary</p>
        <div className="flex flex-col gap-3">
          {examCodeSummary.map((entry) => {
            const color = getExamCodeColor(entry.examCode);
            return (
              <div key={entry.examCode} className="flex items-start gap-3 text-sm">
                <span
                  className="px-2.5 py-1 rounded font-mono font-semibold text-xs flex-shrink-0"
                  style={{ backgroundColor: color.bg, color: color.text }}
                >
                  {entry.examCode}
                </span>
                <div className="flex-1 flex flex-wrap gap-x-3 gap-y-1">
                  {Object.entries(entry.depts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([dept, count]) => (
                      <span key={dept} className="text-foreground">
                        <span className="font-medium">{dept}</span>
                        <span className="text-muted-foreground"> ({count})</span>
                      </span>
                    ))}
                </div>
                <span className="text-muted-foreground font-medium flex-shrink-0">
                  {entry.total} students
                </span>
              </div>
            );
          })}
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
        <Button onClick={() => onConfirm(students)} className="rounded-xl px-8 h-11">
          Confirm and Continue
        </Button>
      </div>
    </div>
  );
};

export default VerificationScreen;
