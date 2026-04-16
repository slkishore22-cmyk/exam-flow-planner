import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RoomConfig } from '@/lib/seating-utils';

interface RoomConfigScreenProps {
  totalStudents: number;
  onGenerate: (config: RoomConfig) => void;
  onBack: () => void;
  isGeneralExam?: boolean;
  onChangeMode?: () => void;
}

const RoomConfigScreen: React.FC<RoomConfigScreenProps> = ({ totalStudents, onGenerate, onBack, isGeneralExam, onChangeMode }) => {
  const [studentsPerRoom, setStudentsPerRoom] = useState(45);
  const [mainColumns, setMainColumns] = useState(3);
  const [seatsPerColumn, setSeatsPerColumn] = useState(3);

  const effectiveSeatsPerCol = isGeneralExam ? 2 : seatsPerColumn;
  const roomStrength = studentsPerRoom;
  const roomsRequired = Math.ceil(totalStudents / roomStrength);
  const rows = Math.ceil(roomStrength / (mainColumns * effectiveSeatsPerCol));

  return (
    <div className="max-w-lg mx-auto px-4">
      <Button variant="outline" onClick={onBack} className="rounded-xl px-6 h-10 text-sm mb-6">
        ← Back
      </Button>
      <h2 className="text-2xl font-bold text-center mb-4">Room Configuration</h2>

      {/* General Exam Badge */}
      {isGeneralExam && (
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm border" style={{ background: 'hsl(var(--amber-warning-light))', borderColor: 'hsl(var(--amber-warning))', color: '#856404' }}>
            ⚠️ General Exam Mode
            {onChangeMode && (
              <button onClick={onChangeMode} className="text-xs underline bg-transparent border-none cursor-pointer p-0" style={{ color: '#856404' }}>
                Change
              </button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-8">
        {[
          { label: 'Students per Room', value: studentsPerRoom, setter: setStudentsPerRoom, min: 1, show: true },
          { label: 'Main Columns', value: mainColumns, setter: setMainColumns, min: 1, show: true },
          { label: 'Seats per Column', value: seatsPerColumn, setter: setSeatsPerColumn, min: 1, show: !isGeneralExam },
        ].filter(f => f.show).map(field => (
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

        {isGeneralExam && (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Seats per Column: <strong>2</strong> (fixed for General Exam)</p>
          </div>
        )}
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
            <p className="text-2xl font-bold">{rows} × {mainColumns * effectiveSeatsPerCol}</p>
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
                  {Array.from({ length: effectiveSeatsPerCol }).map((_, seat) => (
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
          onClick={() => onGenerate({ studentsPerRoom, mainColumns, seatsPerColumn: effectiveSeatsPerCol })}
          className="px-12 h-12 text-base rounded-xl"
        >
          Generate Seating
        </Button>
      </div>
    </div>
  );
};

export default RoomConfigScreen;
