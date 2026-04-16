import React, { useState, useEffect } from 'react';
import StepIndicator from '@/components/StepIndicator';
import UploadScreen from '@/components/UploadScreen';
import VerificationScreen from '@/components/VerificationScreen';
import RoomConfigScreen from '@/components/RoomConfigScreen';
import SeatingResultScreen from '@/components/SeatingResultScreen';
import {
  PdfExtractionResult,
  StudentRecord,
  RoomConfig,
  RoomAllocation,
  GroupRanking,
  deduplicateStudents,
  allocateRooms,
  generateGeneralExamRooms,
  GENERAL_EXAM_THRESHOLD,
} from '@/lib/seating-utils';

const Index = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [pdfResults, setPdfResults] = useState<PdfExtractionResult[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [totalPdfs, setTotalPdfs] = useState(0);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [rooms, setRooms] = useState<RoomAllocation[]>([]);
  const [roomConfig, setRoomConfig] = useState<RoomConfig>({ studentsPerRoom: 45, mainColumns: 3, seatsPerColumn: 3 });
  const [groupRankings, setGroupRankings] = useState<GroupRanking[]>([]);
  const [violations, setViolations] = useState(0);

  const [isGeneralExam, setIsGeneralExam] = useState(false);
  const [showGeneralExamDialog, setShowGeneralExamDialog] = useState(false);

  const handleUploadComplete = (results: PdfExtractionResult[], files: File[]) => {
    setPdfResults(results);
    setUploadedFiles(files);
    setTotalPdfs(files.length);
    const deduped = deduplicateStudents(results);
    setStudents(deduped);
    setCurrentStep(2);
  };

  // Check threshold after students change
  useEffect(() => {
    if (students.length > GENERAL_EXAM_THRESHOLD) {
      setShowGeneralExamDialog(true);
    } else {
      setIsGeneralExam(false);
    }
  }, [students]);

  const handleVerifyConfirm = (confirmedStudents: StudentRecord[]) => {
    setStudents(confirmedStudents);
    setCurrentStep(3);
  };

  const handleGenerate = (config: RoomConfig) => {
    setRoomConfig(config);
    if (isGeneralExam) {
      const result = generateGeneralExamRooms([...students], config);
      setRooms(result.rooms);
      setGroupRankings(result.groupRankings);
      setViolations(result.violations);
    } else {
      const result = allocateRooms([...students], config);
      setRooms(result.rooms);
      setGroupRankings(result.groupRankings);
      setViolations(result.violations);
    }
    setCurrentStep(4);
  };

  const handleAddRoom = () => {
    const currentRooms = Math.ceil(students.length / roomConfig.studentsPerRoom);
    const newRoomCount = currentRooms + 1;
    const newStudentsPerRoom = Math.ceil(students.length / newRoomCount);
    const newConfig = { ...roomConfig, studentsPerRoom: newStudentsPerRoom };
    setRoomConfig(newConfig);
    if (isGeneralExam) {
      const result = generateGeneralExamRooms([...students], newConfig);
      setRooms(result.rooms);
      setGroupRankings(result.groupRankings);
      setViolations(result.violations);
    } else {
      const result = allocateRooms([...students], newConfig);
      setRooms(result.rooms);
      setGroupRankings(result.groupRankings);
      setViolations(result.violations);
    }
  };

  const handleStepClick = (step: number) => {
    if (step < currentStep) setCurrentStep(step);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* General Exam Confirmation Dialog */}
      {showGeneralExamDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-background rounded-2xl p-8 max-w-[440px] w-[90%] shadow-2xl border border-border">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-[22px] mb-4" style={{ background: 'hsl(var(--amber-warning-light))' }}>
              ⚠️
            </div>

            <h2 className="text-lg font-semibold mb-2 text-foreground">General Exam Detected</h2>

            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              <strong className="text-foreground">{students.length} students</strong> have been uploaded.
              This exceeds {GENERAL_EXAM_THRESHOLD} students.
            </p>

            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Is this a <strong className="text-foreground">General Exam</strong> where all students
              write the same paper? If yes, the system will use a simplified
              two-column layout with no middle separation.
            </p>

            <div className="bg-secondary rounded-lg p-3 mb-6 font-mono text-xs text-muted-foreground leading-8">
              General layout:
              <br />
              A | A ‖ A | A ‖ A | A
              <br />
              A | A ‖ A | A ‖ A | A
              <br />
              A | A ‖ A | A ‖ A | A
              <br />
              A | A ‖ A | A ‖ A | A
              <br />
              A | A ‖ A | A ‖ A | A
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setIsGeneralExam(false); setShowGeneralExamDialog(false); }}
                className="flex-1 py-3 border border-border rounded-lg bg-background text-foreground text-sm cursor-pointer hover:bg-secondary transition-colors"
              >
                No — Use Normal Seating
              </button>
              <button
                onClick={() => { setIsGeneralExam(true); setShowGeneralExamDialog(false); }}
                className="flex-1 py-3 border-none rounded-lg bg-foreground text-background text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity"
              >
                Yes — General Exam
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="no-print">
        <StepIndicator currentStep={currentStep} onStepClick={handleStepClick} />
      </div>
      <div className="pb-16">
        {currentStep === 1 && <UploadScreen onComplete={handleUploadComplete} initialFiles={uploadedFiles} />}
        {currentStep === 2 && (
          <VerificationScreen students={students} pdfResults={pdfResults} totalPdfs={totalPdfs} onConfirm={handleVerifyConfirm} onBack={() => setCurrentStep(1)} />
        )}
        {currentStep === 3 && (
          <RoomConfigScreen
            totalStudents={students.length}
            onGenerate={handleGenerate}
            onBack={() => setCurrentStep(2)}
            isGeneralExam={isGeneralExam}
            onChangeMode={() => setShowGeneralExamDialog(true)}
          />
        )}
        {currentStep === 4 && (
          <SeatingResultScreen
            rooms={rooms}
            config={roomConfig}
            groupRankings={groupRankings}
            violations={violations}
            onBack={() => setCurrentStep(3)}
            onAddRoom={handleAddRoom}
          />
        )}
      </div>
    </div>
  );
};

export default Index;
