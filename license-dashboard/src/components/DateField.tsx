'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

const MONTHS = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
];

/**
 * Date picker split into Day (dropdown) + Month (dropdown) + Year (text),
 * friendlier on mobile than a native <input type="date">.
 * Emits an ISO date string "YYYY-MM-DD" (or '' when incomplete).
 */
export function DateField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  // Sync local fields when the parent value changes (e.g. reset / preset).
  useEffect(() => {
    const composed = day && month && year.length === 4 ? `${year}-${month}-${day}` : '';
    if (value === composed) return;
    if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const [yy, mm, dd] = value.slice(0, 10).split('-');
      setYear(yy); setMonth(mm); setDay(dd);
    } else if (!value) {
      setYear(''); setMonth(''); setDay('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit(d: string, m: string, y: string) {
    onChange(d && m && y.length === 4 ? `${y}-${m}-${d.padStart(2, '0')}` : '');
  }

  return (
    <div className={clsx('grid grid-cols-3 gap-2', className)}>
      <select
        className="input"
        value={day}
        onChange={(e) => { setDay(e.target.value); emit(e.target.value, month, year); }}
      >
        <option value="">Ngày</option>
        {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => (
          <option key={d} value={d}>{Number(d)}</option>
        ))}
      </select>

      <select
        className="input"
        value={month}
        onChange={(e) => { setMonth(e.target.value); emit(day, e.target.value, year); }}
      >
        <option value="">Tháng</option>
        {MONTHS.map((m) => (
          <option key={m} value={m}>Tháng {Number(m)}</option>
        ))}
      </select>

      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        className="input"
        placeholder="Năm"
        value={year}
        onChange={(e) => {
          const y = e.target.value.replace(/\D/g, '').slice(0, 4);
          setYear(y);
          emit(day, month, y);
        }}
      />
    </div>
  );
}
