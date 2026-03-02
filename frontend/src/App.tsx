import { FormEvent, useState } from 'react';
import {
  CompanyModel,
  UserModel,
  createAdmin,
  createCompany,
  createMember,
  deleteAdmin,
  deleteCompany,
  deleteMember,
  fetchAdmins,
  fetchCompanies,
  fetchMembers,
  fetchUserByFirebaseUid,
  updateAdmin,
  updateCompany,
  updateMember,
} from './api';
import {
  FirebaseUser,
  getIdToken,
  signInWithEmailAndPassword,
  signOut,
} from './firebase';

type OwnerSection = 'admins' | 'members' | 'companies';

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [idToken, setIdToken] = useState('');
  const [profile, setProfile] = useState<UserModel | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ownerSection, setOwnerSection] = useState<OwnerSection>('admins');

  const [admins, setAdmins] = useState<UserModel[]>([]);
  const [members, setMembers] = useState<UserModel[]>([]);
  const [companies, setCompanies] = useState<CompanyModel[]>([]);

  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminCompanyId, setNewAdminCompanyId] = useState('');

  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberCompanyId, setNewMemberCompanyId] = useState('');

  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyNit, setNewCompanyNit] = useState('');

  const loadOwnerResources = async (token: string) => {
    const [companyData, adminData, memberData] = await Promise.all([
      fetchCompanies(token),
      fetchAdmins(token),
      fetchMembers(token),
    ]);

    setCompanies(companyData);
    setAdmins(adminData);
    setMembers(memberData);

    if (!newAdminCompanyId && companyData[0]) {
      setNewAdminCompanyId(companyData[0]._id);
    }

    if (!newMemberCompanyId && companyData[0]) {
      setNewMemberCompanyId(companyData[0]._id);
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(email, password);
      const token = await getIdToken(credential.user);
      const userProfile = await fetchUserByFirebaseUid(credential.user.uid, token);

      setCurrentUser(credential.user);
      setIdToken(token);
      setProfile(userProfile);

      if (userProfile.role === 'owner') {
        await loadOwnerResources(token);
      }
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

  const handleLogout = async () => {
    await signOut();
    setCurrentUser(null);
    setIdToken('');
    setProfile(null);
    setError('');
    setPassword('');
    setAdmins([]);
    setMembers([]);
    setCompanies([]);
  };

  const refreshOwnerData = async () => {
    if (!idToken) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      await loadOwnerResources(idToken);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible cargar la información del owner.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await createAdmin(idToken, {
        email: newAdminEmail,
        password: newAdminPassword,
        role: 'admin',
        companyId: newAdminCompanyId,
      });
      setNewAdminEmail('');
      setNewAdminPassword('');
      await refreshOwnerData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible crear el admin.');
      setLoading(false);
    }
  };

  const handleCreateMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await createMember(idToken, {
        email: newMemberEmail,
        password: newMemberPassword,
        role: 'member',
        companyId: newMemberCompanyId,
      });
      setNewMemberEmail('');
      setNewMemberPassword('');
      await refreshOwnerData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible crear el usuario.');
      setLoading(false);
    }
  };

  const handleCreateCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await createCompany(idToken, { name: newCompanyName, nit: newCompanyNit });
      setNewCompanyName('');
      setNewCompanyNit('');
      await refreshOwnerData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible crear la empresa.');
      setLoading(false);
    }
  };

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: '2rem auto' }}>
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
            Rol detectado: <strong>{profile?.role ?? 'sin rol'}</strong>
          </p>
          <button onClick={handleLogout}>Cerrar sesión</button>

          {profile?.role === 'owner' ? (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={() => setOwnerSection('admins')}>Crear Admin</button>
                <button onClick={() => setOwnerSection('members')}>Crear Usuario</button>
                <button onClick={() => setOwnerSection('companies')}>Crear Empresa</button>
                <button onClick={refreshOwnerData} disabled={loading}>Recargar</button>
              </div>

              {ownerSection === 'admins' ? (
                <section>
                  <h2>CRUD Admins</h2>
                  <form onSubmit={handleCreateAdmin} style={{ display: 'grid', gap: '0.5rem' }}>
                    <input value={newAdminEmail} onChange={(event) => setNewAdminEmail(event.target.value)} placeholder="Email admin" required />
                    <input type="password" value={newAdminPassword} onChange={(event) => setNewAdminPassword(event.target.value)} placeholder="Password admin" required />
                    <select value={newAdminCompanyId} onChange={(event) => setNewAdminCompanyId(event.target.value)} required>
                      <option value="">Selecciona empresa</option>
                      {companies.map((company) => (
                        <option key={company._id} value={company._id}>{company.name}</option>
                      ))}
                    </select>
                    <button type="submit" disabled={loading}>Guardar Admin</button>
                  </form>
                  {admins.map((admin) => (
                    <div key={admin._id} style={{ border: '1px solid #ddd', padding: '0.5rem', marginTop: '0.5rem' }}>
                      <p>{admin.email}</p>
                      <select
                        defaultValue={admin.companyId}
                        onChange={(event) => updateAdmin(idToken, admin._id, { companyId: event.target.value }).then(refreshOwnerData).catch((e) => setError(e.message))}
                      >
                        {companies.map((company) => (
                          <option key={company._id} value={company._id}>{company.name}</option>
                        ))}
                      </select>
                      <button onClick={() => deleteAdmin(idToken, admin._id).then(refreshOwnerData).catch((e) => setError(e.message))}>Eliminar</button>
                    </div>
                  ))}
                </section>
              ) : null}

              {ownerSection === 'members' ? (
                <section>
                  <h2>CRUD Usuarios</h2>
                  <form onSubmit={handleCreateMember} style={{ display: 'grid', gap: '0.5rem' }}>
                    <input value={newMemberEmail} onChange={(event) => setNewMemberEmail(event.target.value)} placeholder="Email usuario" required />
                    <input type="password" value={newMemberPassword} onChange={(event) => setNewMemberPassword(event.target.value)} placeholder="Password usuario" required />
                    <select value={newMemberCompanyId} onChange={(event) => setNewMemberCompanyId(event.target.value)} required>
                      <option value="">Selecciona empresa</option>
                      {companies.map((company) => (
                        <option key={company._id} value={company._id}>{company.name}</option>
                      ))}
                    </select>
                    <button type="submit" disabled={loading}>Guardar Usuario</button>
                  </form>
                  {members.map((member) => (
                    <div key={member._id} style={{ border: '1px solid #ddd', padding: '0.5rem', marginTop: '0.5rem' }}>
                      <p>{member.email}</p>
                      <select
                        defaultValue={member.companyId}
                        onChange={(event) => updateMember(idToken, member._id, { companyId: event.target.value }).then(refreshOwnerData).catch((e) => setError(e.message))}
                      >
                        {companies.map((company) => (
                          <option key={company._id} value={company._id}>{company.name}</option>
                        ))}
                      </select>
                      <button onClick={() => deleteMember(idToken, member._id).then(refreshOwnerData).catch((e) => setError(e.message))}>Eliminar</button>
                    </div>
                  ))}
                </section>
              ) : null}

              {ownerSection === 'companies' ? (
                <section>
                  <h2>CRUD Empresas</h2>
                  <form onSubmit={handleCreateCompany} style={{ display: 'grid', gap: '0.5rem' }}>
                    <input value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} placeholder="Nombre empresa" required />
                    <input value={newCompanyNit} onChange={(event) => setNewCompanyNit(event.target.value)} placeholder="NIT" required />
                    <button type="submit" disabled={loading}>Guardar Empresa</button>
                  </form>
                  {companies.map((company) => (
                    <div key={company._id} style={{ border: '1px solid #ddd', padding: '0.5rem', marginTop: '0.5rem' }}>
                      <p>{company.name} - {company.nit}</p>
                      <button onClick={() => updateCompany(idToken, company._id, { name: `${company.name} (editada)` }).then(refreshOwnerData).catch((e) => setError(e.message))}>Editar nombre</button>
                      <button onClick={() => deleteCompany(idToken, company._id).then(refreshOwnerData).catch((e) => setError(e.message))}>Eliminar</button>
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          ) : (
            <p>Este dashboard extendido está disponible solo para rol owner.</p>
          )}
        </section>
      )}

      {error ? <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre> : null}
    </main>
  );
}

export default App;
