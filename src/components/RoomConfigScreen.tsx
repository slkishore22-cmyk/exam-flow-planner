import React from 'react';
import { Button } from '@/components/ui/button';
import { RoomConfig } from '@/lib/seating-utils';

interface RoomConfigScreenProps {
  totalStudents: number;
  onGenerate: (config: RoomConfig) => void;
  onBack: () => void;
}

const RoomConfigScreen: React.FC<RoomConfigScreenProps> = ({ totalStudents, onGenerate, onBack }) => {
  const studentsPerRoom = 45;
  const mainColumns = 3;
  const seatsPerColumn = 3;
  const roomStrength = studentsPerRoom;
  const roomsRequired = Math.ceil(totalStudents / roomStrength);
  const rows = 5;

  return (
    <div className="max-w-lg mx-auto px-4">
      <Button variant="outline" onClick={onBack} className="rounded-xl px-6 h-10 text-sm mb-6">
        ← Back
      </Button>
      <h2 className="text-2xl font-bold text-center mb-10">Room Configuration</h2>

      <div className="grid grid-cols-3 gap-4 mb-8 text-center">
        {[
          { label: 'Students per Room', value: studentsPerRoom },
          { label: 'Main Columns', value: mainColumns },
          { label: 'Seats per Column', value: seatsPerColumn },
        ].map(field => (
          <div key={field.label} className="bg-secondary rounded-2xl p-5">
            <p className="text-2xl font-bold">{field.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{field.label}</p>
          </div>
        ))}
      </div>

      {/* Live preview */}
      <div className="mt-10 p-6 bg-secondary rounded-2xl">
        <div className="grid grid-cols-2 gap-4 text-center mb-6">
          <div>
            <p className="text-2xl font-bold">{totalStudents}</p>
            <p className="text-xs text-muted-foreground">Total Students</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{roomStrength}</p>
            <p className="text-xs text-muted-foreground">Room Strength</p>
          </div>
          <div>
            <p className="text-2xl font-bold gold-text">{roomsRequired}</p>
            <p className="text-xs text-muted-foreground">Rooms Required</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{rows} × {mainColumns * seatsPerColumn}</p>
            <p className="text-xs text-muted-foreground">Layout (Rows × Cols)</p>
          </div>
        </div>

        {/* Mini grid preview */}
        <p className="text-xs text-muted-foreground text-center mb-2">Room Layout Preview</p>
        <div className="flex justify-center gap-3">
          {Array.from({ length: mainColumns }).map((_, col) => (
            <div key={col} className="flex flex-col gap-1">
              {Array.from({ length: Math.min(rows, 5) }).map((_, row) => (
                <div key={row} className="flex gap-0.5">
                  {Array.from({ length: seatsPerColumn }).map((_, seat) => (
                    <div
                      key={seat}
                      className="w-3 h-3 rounded-sm bg-border"
                    />
                  ))}
                </div>
              ))}
              {rows > 5 && <p className="text-[8px] text-muted-foreground text-center">+{rows - 5}</p>}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-4">
          Fixed pattern: A/C/B on rows 1, 3, 5 and B/D/A on rows 2, 4.
        </p>
      </div>

      <div className="mt-10 text-center">
        <Button
          onClick={() => onGenerate({ studentsPerRoom, mainColumns, seatsPerColumn, requestedRoomCount: Math.max(1, roomsRequired) })}
          className="px-12 h-12 text-base rounded-xl"
        >
          Generate Seating
        </Button>
      </div>
    </div>
  );
};

export default RoomConfigScreen;
