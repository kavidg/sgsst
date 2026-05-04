import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

type ProfilePageProps = {
  firstName: string;
  lastName: string;
  profileImage: string;
  onSave: (firstName: string, lastName: string, profileImage: string) => Promise<void> | void;
};

export function ProfilePage({ firstName, lastName, profileImage, onSave }: ProfilePageProps) {
  const defaultAvatar = `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#eef2ff"/><circle cx="60" cy="46" r="22" fill="#9ca3af"/><path d="M22 100c8-18 24-28 38-28s30 10 38 28" fill="#9ca3af"/></svg>',
  )}`;
  const [name, setName] = useState(firstName || 'User');
  const [surname, setSurname] = useState(lastName || '');
  const [image, setImage] = useState<string>(profileImage || defaultAvatar);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    setName(firstName || 'User');
    setSurname(lastName || '');
    setImage(profileImage || defaultAvatar);
  }, [firstName, lastName, profileImage, defaultAvatar]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setSaveMessage('');
    await onSave(name.trim() || 'User', surname.trim(), image);
    setSaveMessage('✅ Perfil guardado correctamente');
    setIsSaving(false);
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Card>
      <h2>Perfil de usuario</h2>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '.75rem',
            padding: '.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '.75rem',
          }}
        >
          <img
            src={image}
            alt="Foto de perfil"
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '999px',
              objectFit: 'cover',
              border: '2px solid #cbd5e1',
            }}
          />
          <div>
            <label htmlFor="profile-image-upload" style={{ display: 'block', marginBottom: '.35rem', fontWeight: 600 }}>
              Foto de perfil
            </label>
            <label htmlFor="profile-image-upload" style={{ cursor: 'pointer' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '.35rem',
                  padding: '.45rem .7rem',
                  borderRadius: '.5rem',
                  border: '1px solid #cbd5e1',
                }}
              >
                📷 Cambiar foto
              </span>
            </label>
            <input id="profile-image-upload" type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
          </div>
        </div>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" required />
        <Input value={surname} onChange={(event) => setSurname(event.target.value)} placeholder="Apellido" />
        <Button type="submit" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Guardar'}</Button>
        {saveMessage ? <p style={{ margin: 0, color: '#166534', fontWeight: 600 }}>{saveMessage}</p> : null}
      </form>
    </Card>
  );
}
