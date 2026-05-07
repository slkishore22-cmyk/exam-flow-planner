import React, { useEffect, useState } from 'react';
import { publicSupabase } from '@/integrations/supabase/public-client';

interface SeatResult {
  roll_number: string;
  room_number: number;
  seat_number: number;
  exam_code: string | null;
  dept: string | null;
}

export default function StudentPage() {
  const [rollInput, setRollInput] = useState('');
  const [result, setResult] = useState<SeatResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    if (sid) setSessionId(sid);
  }, []);

  async function handleSearch() {
    if (!rollInput.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);

    let query = supabase
      .from('exam_seating_lookup')
      .select('*')
      .eq('roll_number', rollInput.trim().toUpperCase());

    if (sessionId) query = query.eq('session_id', sessionId);
    else query = query.order('published_at', { ascending: false }).limit(1);

    const { data, error: dbError } = await query.maybeSingle();
    setLoading(false);

    if (dbError || !data) {
      setError('Roll number not found. Please check and try again.');
      return;
    }
    setResult(data as SeatResult);
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#f5f5f5',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎓</div>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: '#1a1a1a', marginBottom: '4px' }}>
          Exam Hall Finder
        </h1>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Enter your roll number to find your seat
        </p>
      </div>

      <div style={{
        background: '#fff', borderRadius: '12px', padding: '24px',
        width: '100%', maxWidth: '380px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}>
        <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '6px' }}>
          ROLL NUMBER
        </label>
        <input
          type="text"
          value={rollInput}
          onChange={e => setRollInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="e.g. 21BBA001"
          style={{
            width: '100%', padding: '12px 14px',
            border: '1.5px solid #e0e0e0', borderRadius: '8px',
            fontSize: '16px', fontFamily: 'monospace',
            outline: 'none', boxSizing: 'border-box',
            marginBottom: '12px', textTransform: 'uppercase',
          }}
          autoFocus
        />
        <button
          onClick={handleSearch}
          disabled={loading || !rollInput.trim()}
          style={{
            width: '100%', padding: '13px',
            border: 'none', borderRadius: '8px',
            background: loading ? '#ccc' : '#1a1a1a',
            color: '#fff', fontSize: '15px', fontWeight: 500,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Searching...' : 'Find My Seat'}
        </button>

        {error && (
          <div style={{
            marginTop: '12px', padding: '10px 14px',
            background: '#fff3f3', border: '1px solid #ffcccc',
            borderRadius: '6px', fontSize: '13px', color: '#cc0000',
          }}>
            {error}
          </div>
        )}
      </div>

      {result && (
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '24px',
          width: '100%', maxWidth: '380px', marginTop: '16px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          border: '2px solid #2E7D32',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '40px', marginBottom: '4px' }}>✅</div>
            <div style={{ fontSize: '13px', color: '#666' }}>Seat found</div>
          </div>

          <div style={{
            background: '#f0f7f0', borderRadius: '10px',
            padding: '16px', textAlign: 'center', marginBottom: '12px',
          }}>
            <div style={{ fontSize: '12px', color: '#666', letterSpacing: '0.1em', marginBottom: '4px' }}>
              ROOM NUMBER
            </div>
            <div style={{ fontSize: '48px', fontWeight: 700, color: '#2E7D32', lineHeight: 1 }}>
              {result.room_number}
            </div>
          </div>

          <div style={{
            background: '#f5f5f5', borderRadius: '10px',
            padding: '16px', textAlign: 'center', marginBottom: '12px',
          }}>
            <div style={{ fontSize: '12px', color: '#666', letterSpacing: '0.1em', marginBottom: '4px' }}>
              SEAT NUMBER
            </div>
            <div style={{ fontSize: '48px', fontWeight: 700, color: '#1565C0', lineHeight: 1 }}>
              {result.seat_number}
            </div>
          </div>

          <Row label="Roll Number" value={result.roll_number} mono />
          <Row label="Exam Code" value={result.exam_code || '—'} mono />
          <Row label="Department" value={result.dept || '—'} />

          <button
            onClick={() => { setResult(null); setRollInput(''); }}
            style={{
              width: '100%', marginTop: '16px', padding: '10px',
              border: '1px solid #ddd', borderRadius: '8px',
              background: '#fff', cursor: 'pointer',
              fontSize: '13px', color: '#666',
            }}
          >
            Search another roll number
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '10px 0', borderTop: '1px solid #eee',
      fontSize: '13px', color: '#666',
    }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600, color: '#1a1a1a', fontFamily: mono ? 'monospace' : undefined }}>
        {value}
      </span>
    </div>
  );
}
