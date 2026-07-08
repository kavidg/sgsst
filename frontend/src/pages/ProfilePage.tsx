import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { fetchMyProfile, updateMyProfile, uploadAvatar, uploadSignature, UserModel } from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

function getInitials(firstName: string, lastName: string): string {
  const first = firstName?.charAt(0)?.toUpperCase() || '';
  const last = lastName?.charAt(0)?.toUpperCase() || '';
  return first + last || '?';
}

function AvatarDisplay({ url, firstName, lastName, size = 80 }: { url?: string; firstName: string; lastName: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt="Foto de perfil"
        style={{
          width: size,
          height: size,
          borderRadius: '999px',
          objectFit: 'cover',
          border: '2px solid #e2e8f0',
        }}
      />
    );
  }

  const initials = getInitials(firstName, lastName);
  const fontSize = size * 0.4;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 700,
        border: '2px solid #bfdbfe',
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  );
}

type ProfilePageProps = {
  token: string;
};

export function ProfilePage({ token }: ProfilePageProps) {
  const [profile, setProfile] = useState<UserModel | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchMyProfile(token)
      .then((user) => {
        setProfile(user);
        setFirstName(user.firstName || '');
        setLastName(user.lastName || '');
        setPhone(user.phone || '');
        setJobTitle(user.jobTitle || '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const updated = await updateMyProfile(token, { firstName, lastName, phone, jobTitle });
      setProfile(updated);
      setMessage('✅ Perfil guardado correctamente');
    } catch (e: any) {
      setError(e.message || 'Error al guardar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;

    // Show local preview
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setAvatarPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);

    // Upload to backend
    setSaving(true);
    setError('');
    try {
      const updated = await uploadAvatar(token, file);
      setProfile(updated);
      setAvatarPreview(null);
      setMessage('✅ Foto de perfil actualizada');
    } catch (e: any) {
      setError(e.message || 'Error al subir foto');
      setAvatarPreview(null);
    } finally {
      setSaving(false);
    }
  };

  const handleSignatureChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;

    // Show local preview
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setSignaturePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);

    // Upload to backend
    setSaving(true);
    setError('');
    try {
      const updated = await uploadSignature(token, file);
      setProfile(updated);
      setSignaturePreview(null);
      setMessage('✅ Firma digital actualizada');
    } catch (e: any) {
      setError(e.message || 'Error al subir firma');
      setSignaturePreview(null);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !profile) {
    return (
      <Card>
        <p className="muted">Cargando perfil...</p>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'center' }}>
            <AvatarDisplay
              url={avatarPreview || profile?.avatarUrl}
              firstName={firstName}
              lastName={lastName}
              size={88}
            />
            <div style={{ marginTop: '.5rem' }}>
              <label htmlFor="avatar-upload" style={{ cursor: 'pointer', fontSize: '.85rem', color: '#2563eb', fontWeight: 600 }}>
                Cambiar foto
              </label>
              <input
                ref={avatarInputRef}
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>
          <div>
            <h2 style={{ margin: '0 0 .25rem', fontSize: '1.25rem' }}>
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : profile?.email || 'Usuario'}
            </h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '.9rem' }}>
              {profile?.email} {profile?.role ? `· ${profile.role}` : ''}
            </p>
            {profile?.jobTitle && (
              <p style={{ margin: '.15rem 0 0', color: '#94a3b8', fontSize: '.85rem' }}>{profile.jobTitle}</p>
            )}
          </div>
        </div>

        {error && (
          <div style={{ padding: '.65rem .75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '.75rem', color: '#b91c1c', fontSize: '.9rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ padding: '.65rem .75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '.75rem', color: '#166534', fontSize: '.9rem', marginBottom: '1rem' }}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-grid" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <span className="label">Nombre</span>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Nombre" />
          </div>
          <div className="field">
            <span className="label">Apellido</span>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Apellido" />
          </div>
          <div className="field">
            <span className="label">Teléfono</span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono" />
          </div>
          <div className="field">
            <span className="label">Cargo</span>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Cargo" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Digital Signature Section */}
      <Card style={{ marginTop: '1rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Firma Digital</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            {signaturePreview || profile?.signatureUrl ? (
              <img
                src={signaturePreview || profile!.signatureUrl}
                alt="Firma digital"
                style={{
                  maxWidth: 240,
                  maxHeight: 80,
                  border: '1px solid #e2e8f0',
                  borderRadius: '.5rem',
                  padding: '.5rem',
                  background: '#fff',
                }}
              />
            ) : (
              <div
                style={{
                  width: 240,
                  height: 80,
                  border: '1px dashed #cbd5e1',
                  borderRadius: '.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                  fontSize: '.85rem',
                }}
              >
                Sin firma
              </div>
            )}
          </div>
          <div>
            <label htmlFor="signature-upload" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '.35rem', padding: '.5rem .75rem', border: '1px solid #cbd5e1', borderRadius: '.65rem', fontSize: '.88rem', fontWeight: 600, color: '#475569', background: '#fff' }}>
              📝 Subir firma
            </label>
            <input
              ref={signatureInputRef}
              id="signature-upload"
              type="file"
              accept="image/*"
              onChange={handleSignatureChange}
              style={{ display: 'none' }}
            />
            <p style={{ margin: '.5rem 0 0', fontSize: '.78rem', color: '#94a3b8' }}>
              Formatos: PNG, JPG. Máximo 5MB.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
