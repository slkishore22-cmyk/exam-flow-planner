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
  GroupRanking,
  deduplicateStudents,
  allocateRooms,
} from '@/lib/seating-utils';

const FIXED_ROOM_CONFIG: RoomConfig = {
  studentsPerRoom: 45,
  mainColumns: 3,
  seatsPerColumn: 3,
};

const Index = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [pdfResults, setPdfResults] = useState<PdfExtractionResult[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [totalPdfs, setTotalPdfs] = useState(0);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [rooms, setRooms] = useState<RoomAllocation[]>([]);
  const [roomConfig, setRoomConfig] = useState<RoomConfig>(FIXED_ROOM_CONFIG);
  const [groupRankings, setGroupRankings] = useState<GroupRanking[]>([]);
  const [violations, setViolations] = useState(0);

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
    const normalizedConfig: RoomConfig = {
      ...FIXED_ROOM_CONFIG,
      requestedRoomCount: config.requestedRoomCount ?? Math.max(1, Math.ceil(students.length / FIXED_ROOM_CONFIG.studentsPerRoom)),
    };

    setRoomConfig(normalizedConfig);
    const result = allocateRooms([...students], normalizedConfig);
    setRooms(result.rooms);
    setGroupRankings(result.groupRankings);
    setViolations(result.violations);
    setCurrentStep(4);
  };

  const handleAddRoom = () => {
    const newConfig: RoomConfig = {
      ...FIXED_ROOM_CONFIG,
      requestedRoomCount: Math.max(rooms.length + 1, (roomConfig.requestedRoomCount ?? 0) + 1),
    };

    setRoomConfig(newConfig);
    const result = allocateRooms([...students], newConfig);
    setRooms(result.rooms);
    setGroupRankings(result.groupRankings);
    setViolations(result.violations);
  };

  const handleStepClick = (step: number) => {
    if (step < currentStep) setCurrentStep(step);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="no-print">
        <StepIndicator currentStep={currentStep} onStepClick={handleStepClick} />
      </div>
      <div className="pb-16">
        {currentStep === 1 && <UploadScreen onComplete={handleUploadComplete} initialFiles={uploadedFiles} />}
        {currentStep === 2 && (
          <VerificationScreen students={students} pdfResults={pdfResults} totalPdfs={totalPdfs} onConfirm={handleVerifyConfirm} onBack={() => setCurrentStep(1)} />
        )}
        {currentStep === 3 && (
          <RoomConfigScreen totalStudents={students.length} onGenerate={handleGenerate} onBack={() => setCurrentStep(2)} />
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
