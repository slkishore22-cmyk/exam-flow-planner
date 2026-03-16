import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { RoomAllocation, RoomConfig, getDeptColor } from '@/lib/seating-utils';

interface SeatingResultScreenProps {
  rooms: RoomAllocation[];
  config: RoomConfig;
}

const SeatingResultScreen: React.FC<SeatingResultScreenProps> = ({ rooms, config }) => {
  const [activeRoom, setActiveRoom] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

  const totalCols = config.mainColumns * config.seatsPerColumn;
  const rows = Math.ceil(config.studentsPerRoom / totalCols);

  const handlePrint = () => {
    window.print();
  };

  const renderRoomGrid = (room: RoomAllocation, forPrint = false) => {
    const gridRows: React.ReactNode[] = [];

    for (let r = 0; r < rows; r++) {
      const cells: React.ReactNode[] = [];
      for (let mc = 0; mc < config.mainColumns; mc++) {
        for (let sc = 0; sc < config.seatsPerColumn; sc++) {
          const idx = r * totalCols + mc * config.seatsPerColumn + sc;
          const student = room.students[idx];

          cells.push(
            <td
              key={`${r}-${mc}-${sc}`}
              className={`border px-2 py-1.5 text-xs font-mono text-center ${
                forPrint ? '' : ''
              }`}
              style={
                student && !forPrint
                  ? { backgroundColor: getDeptColor(student.department) }
                  : student && forPrint
                  ? { backgroundColor: '#f0f0f0' }
                  : { backgroundColor: forPrint ? '#fff' : 'hsl(0, 0%, 95%)' }
              }
            >
              {student ? student.rollNumber : '—'}
            </td>
          );
        }
        // Column separator
        if (mc < config.mainColumns - 1) {
          cells.push(
            <td key={`sep-${r}-${mc}`} className="w-3" />
          );
        }
      }
      gridRows.push(<tr key={r}>{cells}</tr>);
    }

    return (
      <table className="border-collapse mx-auto">
        <thead>
          <tr>
            {Array.from({ length: config.mainColumns }).map((_, mc) => (
              <React.Fragment key={mc}>
                {Array.from({ length: config.seatsPerColumn }).map((_, sc) => (
                  <th key={`${mc}-${sc}`} className="border px-2 py-1 text-xs font-medium bg-secondary">
                    {mc * config.seatsPerColumn + sc + 1}
                  </th>
                ))}
                {mc < config.mainColumns - 1 && <th className="w-3" />}
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>{gridRows}</tbody>
      </table>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4">
      {/* Room tabs - no-print */}
      <div className="no-print flex flex-wrap gap-2 mb-6 justify-center">
        {rooms.map((room, i) => (
          <button
            key={i}
            onClick={() => setActiveRoom(i)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              i === activeRoom
                ? 'bg-foreground text-background'
                : 'bg-secondary text-foreground hover:bg-border'
            }`}
          >
            Room {room.roomNumber}
          </button>
        ))}
      </div>

      {/* Active room grid - no-print */}
      <div className="no-print">
        <h3 className="text-xl font-bold text-center mb-4">
          Room {rooms[activeRoom].roomNumber}
          <span className="text-sm font-normal text-muted-foreground ml-2">
            ({rooms[activeRoom].students.length} students)
          </span>
        </h3>
        <div className="overflow-x-auto">
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
