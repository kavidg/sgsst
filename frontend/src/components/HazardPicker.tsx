import { useMemo, useState } from 'react';
import type { RiskModel } from '../api';
import { Input } from './ui/Input';

/**
 * Selector de peligros/riesgos de la matriz Risk existente (3.1.3).
 *
 * NO duplica registros: solo referencia los `_id` de riesgos del tenant actual
 * que el backend devuelve vía GET /risks. Nunca se escriben IDs manualmente.
 */
export function HazardPicker({ risks, selected, onToggle, disabled }: {
  risks: RiskModel[];
  selected: string[];
  onToggle: (riskId: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return risks;
    return risks.filter((risk) =>
      `${risk.process} ${risk.activity} ${risk.hazard} ${risk.risk}`.toLowerCase().includes(q),
    );
  }, [risks, query]);

  if (risks.length === 0) {
    return (
      <div style={{ fontSize: '.85rem', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: 8, padding: '.6rem .75rem', border: '1px solid #e2e8f0' }}>
        No hay riesgos registrados en la matriz de peligros. Crea riesgos en el módulo <strong>Riesgos</strong> para poder asociarlos.
      </div>
    );
  }

  return (
    <div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar peligro por proceso, actividad o peligro…"
        style={{ marginBottom: '.35rem' }}
      />
      <div style={{
        maxHeight: 180,
        overflowY: 'auto',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '.35rem',
        backgroundColor: '#fff',
      }}>
        {filtered.length === 0 ? (
          <p style={{ margin: '.25rem', fontSize: '.8rem', color: '#94a3b8' }}>Sin resultados para la búsqueda.</p>
        ) : (
          filtered.map((risk) => {
            const checked = selected.includes(risk._id);
            return (
              <label key={risk._id} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '.45rem',
                padding: '.3rem .4rem',
                borderRadius: 6,
                cursor: disabled ? 'not-allowed' : 'pointer',
                backgroundColor: checked ? '#eff6ff' : 'transparent',
              }}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(risk._id)}
                  style={{ marginTop: '.2rem' }}
                />
                <span style={{ fontSize: '.8rem', lineHeight: 1.3 }}>
                  <strong>{risk.hazard}</strong>
                  <span style={{ color: '#64748b' }}>
                    {' '}— {risk.process} · {risk.activity}
                    {risk.risk ? ` (${risk.risk})` : ''}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>
      <p style={{ fontSize: '.72rem', color: '#64748b', margin: '.25rem 0 0' }}>
        {selected.length} peligro(s) seleccionado(s) — referencias a la matriz de riesgos de la empresa (no se duplican registros).
      </p>
    </div>
  );
}
