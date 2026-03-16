import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RoomConfig } from '@/lib/seating-utils';

interface RoomConfigScreenProps {
  totalStudents: number;
  onGenerate: (config: RoomConfig) => void;
  onBack: () => void;
}

const RoomConfigScreen: React.FC<RoomConfigScreenProps> = ({ totalStudents, onGenerate, onBack }) => {
  const [studentsPerRoom, setStudentsPerRoom] = useState(45);
  const [mainColumns, setMainColumns] = useState(3);
  const [seatsPerColumn, setSeatsPerColumn] = useState(3);

  const roomStrength = studentsPerRoom;
  const roomsRequired = Math.ceil(totalStudents / roomStrength);
  const rows = Math.ceil(roomStrength / (mainColumns * seatsPerColumn));

  return (
    <div className="max-w-lg mx-auto px-4">
      <h2 className="text-2xl font-bold text-center mb-10">Room Configuration</h2>

      <div className="space-y-8">
        {[
          { label: 'Students per Room', value: studentsPerRoom, setter: setStudentsPerRoom, min: 1 },
          { label: 'Main Columns', value: mainColumns, setter: setMainColumns, min: 1 },
          { label: 'Seats per Column', value: seatsPerColumn, setter: setSeatsPerColumn, min: 1 },
        ].map(field => (
          <div key={field.label} className="text-center">
            <label className="block text-lg font-medium mb-3">{field.label}</label>
            <input
              type="number"
              min={field.min}
              value={field.value}
              onChange={e => field.setter(Math.max(field.min, parseInt(e.target.value) || field.min))}
              className="w-32 text-center text-2xl font-semibold border-2 rounded-xl px-4 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
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
      </div>

      <div className="mt-10 text-center">
        <Button
          onClick={() => onGenerate({ studentsPerRoom, mainColumns, seatsPerColumn })}
          className="px-12 h-12 text-base rounded-xl"
        >
          Generate Seating
        </Button>
      </div>
    </div>
  );
};

export default RoomConfigScreen;
