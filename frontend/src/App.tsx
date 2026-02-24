import { FormEvent, useState } from 'react';
import { auth, FirebaseUserCredential } from './firebase';
import { fetchUserByFirebaseUid } from './api';

type AuthenticatedUser = FirebaseUserCredential['user'];

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [idToken, setIdToken] = useState('');
  const [apiResponse, setApiResponse] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setApiResponse('');
    setLoading(true);

    try {
      const credential = await auth.signInWithEmailAndPassword(email, password);
      const token = await credential.user.getIdToken();
      setCurrentUser(credential.user);
      setIdToken(token);
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : 'No fue posible iniciar sesión con Firebase.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleBackendCall = async () => {
    if (!currentUser || !idToken) {
      return;
    }

    setError('');
    setApiResponse('');
    setLoading(true);

    try {
      const result = await fetchUserByFirebaseUid(currentUser.uid, idToken);
      setApiResponse(JSON.stringify(result, null, 2));
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible llamar al backend.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    setCurrentUser(null);
    setIdToken('');
    setApiResponse('');
    setError('');
    setPassword('');
  };

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 640, margin: '2rem auto' }}>
      <h1>SG-SST Frontend Auth</h1>

      {!currentUser ? (
        <form onSubmit={handleLogin} style={{ display: 'grid', gap: '0.5rem' }}>
          <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Login'}
          </button>
        </form>
      ) : (
        <section style={{ display: 'grid', gap: '0.75rem' }}>
          <p>
            Sesión iniciada con UID: <strong>{currentUser.uid}</strong>
          </p>
          <p style={{ margin: 0 }}>
            ID Token (primeros 20 chars): <code>{idToken.slice(0, 20)}...</code>
          </p>
          <button onClick={handleBackendCall} disabled={loading}>
            Probar GET /users/by-firebase/:uid
          </button>
          <button onClick={handleLogout}>Cerrar sesión</button>
        </section>
      )}

      {error ? <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre> : null}

      {apiResponse ? (
        <>
          <h2>Respuesta backend</h2>
          <pre style={{ background: '#f7f7f7', padding: '1rem' }}>{apiResponse}</pre>
        </>
      ) : null}
    </main>
  );
}

export default App;
