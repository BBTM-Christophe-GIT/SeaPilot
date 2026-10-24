import { useState } from 'react';
import { formatSeaLatitude, formatSeaLongitude } from './seaOperationCoordinates';

/** Format only the display; focus/blur must never round a recorded position or invalidate its captures. */
export function SeaOperationCoordinateInput({ axis, value, onChange, label }: {
  axis: 'latitude' | 'longitude'; value: string; onChange: (value: string) => void; label: string;
}) {
  const format = axis === 'latitude' ? formatSeaLatitude : formatSeaLongitude;
  const [editing, setEditing] = useState<{ source: string; text: string } | null>(null);
  return <input type="text" aria-label={label} value={editing?.source === value ? editing.text : format(value)}
    placeholder={axis === 'latitude' ? '50° 04.264′ N' : '001° 01.840′ E'}
    onFocus={() => setEditing({ source: value, text: format(value) })}
    onChange={(event) => { const text = event.target.value; setEditing({ source: text, text }); onChange(text); }}
    onBlur={() => setEditing(null)} />;
}
