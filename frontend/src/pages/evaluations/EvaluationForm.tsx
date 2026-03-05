import { FormEvent, useState } from 'react';

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
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.4rem', marginBottom: '1rem' }}>
      <strong>Agregar estándar</strong>
      <input value={standard} onChange={(event) => setStandard(event.target.value)} placeholder="Estándar (ej. 1.1.1)" required />
      <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripción" required />
      <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Agregar estándar'}</button>
    </form>
  );
}
