import { FormEvent, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface EvaluationFormProps {
  onAdd: (payload: { standard: string; description: string }) => Promise<void>;
}

export function EvaluationForm({ onAdd }: EvaluationFormProps) {
  const [standard, setStandard] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!standard.trim() || !description.trim()) {
      return;
    }

    setSaving(true);
    try {
      await onAdd({ standard: standard.trim(), description: description.trim() });
      setStandard('');
      setDescription('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="form-grid" style={{ marginBottom: '1rem' }}>
      <strong>Agregar estándar</strong>
      <div className="grid grid-2">
        <label className="field"><span className="label">Estándar</span><Input value={standard} onChange={(event) => setStandard(event.target.value)} placeholder="Ej. 1.1.1" required /></label>
        <label className="field"><span className="label">Descripción</span><Input value={description} onChange={(event) => setDescription(event.target.value)} required /></label>
      </div>
      <div className="actions"><Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Agregar estándar'}</Button></div>
    </form>
  );
}
