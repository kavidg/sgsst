import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchConvivenciaCampaignInfo, registerConvivenciaCandidatePublic } from '../api';

export default function ConvivenciaCandidateRegister() {
  const { token } = useParams<{ token: string }>();
  const [campaign, setCampaign] = useState<{
    periodName: string; openingDate: string; closingDate: string;
    includedDepartments: string[]; requirements: string[];
  } | null>(null);
  const [form, setForm] = useState({
    name: '', document: '', position: '', area: '',
    phone: '', email: '', motivation: '', acceptedTerms: false,
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetchConvivenciaCampaignInfo(token)
      .then(setCampaign)
      .catch(() => setError('El enlace de postulación no es válido o ha expirado.'));
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      await registerConvivenciaCandidatePublic(token, {
        ...form,
        ipAddress: '',
        device: navigator.userAgent,
        acceptedTerms: form.acceptedTerms,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Error al registrar candidatura');
    }
    setLoading(false);
  };

  if (error && !campaign) {
    return (
      <main className="auth-wrap">
        <div className="card" style={{ maxWidth: '500px', margin: '2rem auto', textAlign: 'center' }}>
          <h2>❌ Enlace inválido</h2>
          <p className="muted">{error}</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="auth-wrap">
        <div className="card" style={{ maxWidth: '500px', margin: '2rem auto', textAlign: 'center' }}>
          <h2>✅ Postulación enviada</h2>
          <p>Gracias por postularte al Comité de Convivencia Laboral.</p>
          <p className="muted">El administrador revisará tu solicitud y te notificará el resultado.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-wrap">
      <div className="card" style={{ maxWidth: '550px', margin: '2rem auto' }}>
        <h2 style={{ marginTop: 0 }}>📝 Postulación Comité de Convivencia</h2>
        {campaign && (
          <div style={{ marginBottom: '1rem', padding: '.75rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac', fontSize: '.85rem' }}>
            <p><strong>{campaign.periodName}</strong></p>
            <p className="muted">Inscripciones: {new Date(campaign.openingDate).toLocaleDateString()} al {new Date(campaign.closingDate).toLocaleDateString()}</p>
            {campaign.requirements?.length > 0 && (
              <><p><strong>Requisitos:</strong></p><ul>{campaign.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul></>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit} className="form-grid">
          <label className="field">
            <span className="label">Nombre completo *</span>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Número de identificación *</span>
            <input className="input" required value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Cargo *</span>
            <input className="input" required value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Departamento / Área *</span>
            <input className="input" required value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Teléfono *</span>
            <input className="input" required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Correo electrónico</span>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="label">Motivo de postulación *</span>
            <textarea className="input" required rows={4} value={form.motivation} onChange={(e) => setForm({ ...form, motivation: e.target.value })} placeholder="¿Por qué deseas postularte al Comité de Convivencia Laboral?" />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', gap: '.5rem' }}>
            <input type="checkbox" checked={form.acceptedTerms} onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })} style={{ marginTop: '.25rem' }} />
            <span>Me postulo voluntariamente como representante de los trabajadores ante el Comité de Convivencia Laboral. *</span>
          </label>
          {error && <p className="error" style={{ gridColumn: '1 / -1' }}>{error}</p>}
          <button type="submit" className="button button--primary" disabled={loading || !form.acceptedTerms} style={{ gridColumn: '1 / -1' }}>
            {loading ? 'Enviando...' : 'Enviar postulación'}
          </button>
        </form>
      </div>
    </main>
  );
}
