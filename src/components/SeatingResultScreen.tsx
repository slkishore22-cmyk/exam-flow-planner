import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { RoomAllocation, RoomConfig, getDeptColor } from '@/lib/seating-utils';

interface SeatingResultScreenProps {
  rooms: RoomAllocation[];
  config: RoomConfig;
  onBack: () => void;
}

const SeatingResultScreen: React.FC<SeatingResultScreenProps> = ({ rooms, config, onBack }) => {
  const [activeRoom, setActiveRoom] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

  if (!rooms || rooms.length === 0) {
    return <div className="text-center py-20 text-muted-foreground">No rooms to display.</div>;
  }

  const handlePrint = () => {
    window.print();
  };

  const renderRoomGrid = (room: RoomAllocation, forPrint = false) => {
    return (
      <table className="border-collapse mx-auto" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            {Array.from({ length: config.mainColumns }).map((_, mc) => (
              <React.Fragment key={mc}>
                {Array.from({ length: config.seatsPerColumn }).map((_, sc) => (
                  <th
                    key={`${mc}-${sc}`}
                    className="border border-border px-2 py-2 text-xs font-semibold bg-secondary text-secondary-foreground"
                    style={{ minWidth: 80 }}
                  >
                    {mc * config.seatsPerColumn + sc + 1}
                  </th>
                ))}
                {mc < config.mainColumns - 1 && (
                  <th className="w-4 border-none" style={{ minWidth: 16 }} />
                )}
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {room.grid.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map((student, colIdx) => {
                const mc = Math.floor(colIdx / config.seatsPerColumn);
                const sc = colIdx % config.seatsPerColumn;
                const isLastSubCol = sc === config.seatsPerColumn - 1;
                const isLastMainCol = mc === config.mainColumns - 1;
                const showSeparator = isLastSubCol && !isLastMainCol;

                const color = student ? getDeptColor(student.department) : null;

                const cell = (
                  <td
                    key={`${rowIdx}-${colIdx}`}
                    className={`border text-center align-middle ${
                      forPrint
                        ? 'border-black'
                        : 'border-border'
                    }`}
                    style={{
                      minWidth: 80,
                      height: 50,
                      backgroundColor: forPrint
                        ? '#FFFFFF'
                        : student
                        ? color!.bg
                        : 'hsl(var(--muted))',
                      padding: '4px 6px',
                    }}
                  >
                    {student ? (
                      <div className="flex flex-col items-center justify-center gap-0">
                        <span
                          style={{
                            fontSize: 9,
                            opacity: forPrint ? 1 : 0.8,
                            color: forPrint ? '#000' : color!.text,
                            fontWeight: 500,
                          }}
                        >
                          {student.department}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: forPrint ? '#555' : '#D4AF37',
                          }}
                        >
                          {student.examCode}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: forPrint ? '#000' : color!.text,
                            fontFamily: 'monospace',
                          }}
                        >
                          {student.rollNumber}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                );

                if (showSeparator) {
                  return (
                    <React.Fragment key={`${rowIdx}-${colIdx}`}>
                      {cell}
                      <td className="border-none" style={{ minWidth: 16 }} />
                    </React.Fragment>
                  );
                }

                return cell;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="no-print">
        <Button variant="outline" onClick={onBack} className="rounded-xl px-6 h-10 text-sm mb-6 border-foreground text-foreground bg-background hover:bg-secondary">
          ← Back
        </Button>
      </div>

      {/* Room tabs */}
      <div className="no-print flex flex-wrap gap-2 mb-6 justify-center">
        {rooms.map((room, i) => (
          <button
            key={i}
            onClick={() => setActiveRoom(i)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all border ${
              i === activeRoom
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-border hover:border-foreground'
            }`}
          >
            Room {room.roomNumber}
          </button>
        ))}
      </div>

      {/* Active room grid */}
      <div className="no-print">
        <h3 className="text-xl font-bold text-center mb-4">
          Room {rooms[activeRoom].roomNumber}
          <span className="text-sm font-normal text-muted-foreground ml-2">
            ({rooms[activeRoom].students.length} students)
          </span>
        </h3>
        <div className="overflow-x-auto pb-4">
          {renderRoomGrid(rooms[activeRoom])}
        </div>
      </div>

      {/* Print button */}
      <div className="no-print mt-8 text-center">
        <Button onClick={handlePrint} className="px-12 h-12 text-base rounded-xl">
          Print All Rooms
        </Button>
      </div>

      {/* Print-only: all rooms */}
      <div ref={printRef} className="hidden print:block">
        {rooms.map((room, i) => (
          <div key={i} className={i < rooms.length - 1 ? 'print-page-break' : ''}>
            <h2 className="text-xl font-bold text-center mb-4 mt-4">
              Room {room.roomNumber} — {room.students.length} students
            </h2>
            {renderRoomGrid(room, true)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SeatingResultScreen;
