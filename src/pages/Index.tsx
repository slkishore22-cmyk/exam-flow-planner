import React, { useState } from 'react';
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
  deduplicateStudents,
  interleaveStudents,
  allocateRooms,
} from '@/lib/seating-utils';

const Index = () => {
  const [step, setStep] = useState(1);
  const [pdfResults, setPdfResults] = useState<PdfExtractionResult[]>([]);
  const [totalPdfs, setTotalPdfs] = useState(0);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [rooms, setRooms] = useState<RoomAllocation[]>([]);
  const [roomConfig, setRoomConfig] = useState<RoomConfig>({ studentsPerRoom: 45, mainColumns: 3, seatsPerColumn: 3 });

  const handleUploadComplete = (results: PdfExtractionResult[], files: File[]) => {
    setPdfResults(results);
    setTotalPdfs(files.length);
    const deduped = deduplicateStudents(results);
    setStudents(deduped);
    setStep(2);
  };

  const handleVerifyConfirm = (confirmedStudents: StudentRecord[]) => {
    setStudents(confirmedStudents);
    setStep(3);
  };

  const handleGenerate = (config: RoomConfig) => {
    setRoomConfig(config);
    const interleaved = interleaveStudents([...students]);
    const allocated = allocateRooms(interleaved, config.studentsPerRoom);
    setRooms(allocated);
    setStep(4);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="no-print">
        <StepIndicator currentStep={step} />
      </div>
      <div className="pb-16">
        {step === 1 && <UploadScreen onComplete={handleUploadComplete} />}
        {step === 2 && (
          <VerificationScreen
            students={students}
            pdfResults={pdfResults}
            totalPdfs={totalPdfs}
            onConfirm={handleVerifyConfirm}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <RoomConfigScreen
            totalStudents={students.length}
            onGenerate={handleGenerate}
          />
        )}
        {step === 4 && <SeatingResultScreen rooms={rooms} config={roomConfig} />}
      </div>
    </div>
  );
};

export default Index;
