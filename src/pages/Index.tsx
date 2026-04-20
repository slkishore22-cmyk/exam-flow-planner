import React, { useState } from 'react';
import StepIndicator from '@/components/StepIndicator';
import UploadScreen from '@/components/UploadScreen';
import VerificationScreen from '@/components/VerificationScreen';
import RoomConfigScreen from '@/components/RoomConfigScreen';
import SeatingResultScreen from '@/components/SeatingResultScreen';
import vincLogo from '@/assets/vinc-logo.jpg';
import {
  PdfExtractionResult,
  StudentRecord,
  RoomConfig,
  RoomAllocation,
  PatternDecision,
  deduplicateStudents,
  interleaveStudents,
} from '@/lib/seating-utils';
import { allocateSeating } from '@/lib/seating-algorithm';

const Index = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [pdfResults, setPdfResults] = useState<PdfExtractionResult[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [totalPdfs, setTotalPdfs] = useState(0);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [rooms, setRooms] = useState<RoomAllocation[]>([]);
  const [roomConfig, setRoomConfig] = useState<RoomConfig>({ studentsPerRoom: 45, mainColumns: 3, seatsPerColumn: 3 });
  const [patternDecision, setPatternDecision] = useState<PatternDecision | null>(null);

  const handleUploadComplete = (results: PdfExtractionResult[], files: File[]) => {
    setPdfResults(results);
    setUploadedFiles(files);
    setTotalPdfs(files.length);
    const deduped = deduplicateStudents(results);
    setStudents(deduped);
    setCurrentStep(2);
  };

  const handleVerifyConfirm = (confirmedStudents: StudentRecord[]) => {
    setStudents(confirmedStudents);
    setCurrentStep(3);
  };

  const handleGenerate = (config: RoomConfig) => {
    setRoomConfig(config);
    const result = allocateSeating([...students], config);
    setRooms(result.rooms);
    setPatternDecision(result.patternDecision);
    setCurrentStep(4);
  };

  const handleStepClick = (step: number) => {
    if (step < currentStep) {
      setCurrentStep(step);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="no-print">
        <header className="flex items-center justify-center pt-8">
          <img src={vincLogo} alt="VIN-C logo" className="h-12 w-auto object-contain" />
        </header>
        <StepIndicator currentStep={currentStep} onStepClick={handleStepClick} />
      </div>
      <div className="pb-16">
        {currentStep === 1 && (
          <UploadScreen
            onComplete={handleUploadComplete}
            initialFiles={uploadedFiles}
          />
        )}
        {currentStep === 2 && (
          <VerificationScreen
            students={students}
            pdfResults={pdfResults}
            totalPdfs={totalPdfs}
            onConfirm={handleVerifyConfirm}
            onBack={() => setCurrentStep(1)}
          />
        )}
        {currentStep === 3 && (
          <RoomConfigScreen
            totalStudents={students.length}
            onGenerate={handleGenerate}
            onBack={() => setCurrentStep(2)}
          />
        )}
        {currentStep === 4 && (
          <SeatingResultScreen
            rooms={rooms}
            config={roomConfig}
            patternDecision={patternDecision}
            onBack={() => setCurrentStep(3)}
          />
        )}
      </div>
    </div>
  );
};

export default Index;
