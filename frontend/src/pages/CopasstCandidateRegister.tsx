import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchCopasstCampaignInfo, registerCopasstCandidatePublic } from '../api';
import { Button } from '../components/ui/Button';

export default function CopasstCandidateRegister() {
  const { token } = useParams<{ token: string }>();
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    name: '', document: '', phone: '', area: '', position: '',
    motivation: '', email: '', acceptedTerms: false,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchCopasstCampaignInfo(token)
      .then(setCampaign)
      .catch((e) => setError(e.message || 'Campaña no encontrada'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.acceptedTerms) { setError('Debe aceptar los términos'); return; }
    if (!token) return;
    setSubmitting(true);
    setError('');
    try {
      await registerCopasstCandidatePublic(token, {
        ...form,
        ipAddress: '',
        device: navigator.userAgent,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Error al registrar');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><p>Cargando...</p></div>;

  if (error && !campaign) return (
    <div className="page auth-wrap">
      <div className="card" style={{ maxWidth: '500px', margin: '2rem auto', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
        <h2>Enlace inválido</h2>
        <p className="muted">{error}</p>
        <p className="muted">El enlace de inscripción puede haber expirado o ser incorrecto.</p>
      </div>
    </div>
  );

  if (success) return (
    <div className="page auth-wrap">
      <div className="card" style={{ maxWidth: '500px', margin: '2rem auto', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
        <h2>¡Postulación exitosa!</h2>
        <p className="muted">Tu candidatura ha sido registrada. El administrador revisará tu postulación y te informará los siguientes pasos.</p>
      </div>
    </div>
  );

  return (
    <div className="page auth-wrap">
      <div className="card" style={{ maxWidth: '600px', margin: '2rem auto', padding: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>📝 Postulación COPASST</h2>
        {campaign && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac' }}>
            <p style={{ margin: 0 }}><strong>{campaign.periodName}</strong></p>
            <p className="muted" style={{ margin: '.25rem 0 0', fontSize: '.85rem' }}>
              Periodo de inscripción: {new Date(campaign.openingDate).toLocaleDateString()} al {new Date(campaign.closingDate).toLocaleDateString()}
            </p>
          </div>
        )}

        {campaign?.requirements?.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <p><strong>Requisitos:</strong></p>
            <ul style={{ fontSize: '.9rem', margin: 0 }}>
              {campaign.requirements.map((r: string, i: number) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-grid">
          <label>Nombre completo *</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre y apellidos" />

          <label>Número de documento *</label>
          <input className="input" required value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} placeholder="Cédula / NIT" />

          <label>Cargo *</label>
          <input className="input" required value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Tu cargo actual" />

          <label>Área / Departamento *</label>
          <input className="input" required value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Área donde trabajas" />

          <label>Teléfono *</label>
          <input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Número de contacto" />

          <label>Correo electrónico</label>
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Opcional" />

          <label>Motivo de postulación *</label>
          <textarea className="input" required rows={3} value={form.motivation} onChange={(e) => setForm({ ...form, motivation: e.target.value })} placeholder="¿Por qué deseas ser representante de los trabajadores ante el COPASST?" />

          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.acceptedTerms} onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })} />
            <span><strong>☑</strong> Me postulo voluntariamente para ser representante de los trabajadores ante el COPASST</span>
          </label>

          {error && <p className="error" style={{ margin: 0 }}>{error}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar postulación'}
          </Button>
        </form>
      </div>
    </div>
  );
}
