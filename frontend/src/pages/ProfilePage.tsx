import { FormEvent, useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

type ProfilePageProps = {
  firstName: string;
  onSave: (firstName: string, lastName: string) => void;
};

export function ProfilePage({ firstName, onSave }: ProfilePageProps) {
  const [name, setName] = useState(firstName || 'User');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    setName(firstName || 'User');
  }, [firstName]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(name.trim() || 'User', lastName.trim());
  };

  return (
    <Card>
      <h2>Perfil de usuario</h2>
      <form className="form-grid" onSubmit={handleSubmit}>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" required />
        <Input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Apellido" />
        <Button type="submit">Guardar</Button>
      </form>
    </Card>
  );
}
