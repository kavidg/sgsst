import { FormEvent, useEffect, useState } from 'react';
import {
  CompanyModel,
  MyCompanyModel,
  UserModel,
  clearActiveCompanyId,
  createAdmin,
  createCompany,
  createMember,
  deleteAdmin,
  deleteCompany,
  deleteMember,
  fetchAdmins,
  fetchCompanies,
  fetchMembers,
  fetchMyCompanies,
  fetchUserByFirebaseUid,
  getActiveCompanyId,
  setActiveCompanyId,
  updateAdmin,
  updateCompany,
  updateMember,
} from './api';
import { CompanySelector } from './CompanySelector';
import { FirebaseUser, getIdToken, signInWithEmailAndPassword, signOut } from './firebase';
import { EmployeesPage } from './pages/EmployeesPage';
import { EvaluationsPage } from './pages/evaluations/EvaluationsPage';

type OwnerSection = 'admins' | 'members' | 'companies' | 'employees' | 'evaluations';

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
  const [myCompanies, setMyCompanies] = useState<MyCompanyModel[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState('');

  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminCompanyId, setNewAdminCompanyId] = useState('');

  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');

  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyNit, setNewCompanyNit] = useState('');

  const handleSelectCompany = async (companyId: string) => {
    setActiveCompanyId(companyId);
    setActiveCompanyIdState(companyId);
    if (idToken) {
      await refreshOwnerData(idToken, companyId);
    }
  };

  const hydrateActiveCompany = (availableCompanies: MyCompanyModel[]): string => {
    const stored = getActiveCompanyId();

    if (stored && availableCompanies.some((company) => company.id === stored)) {
      setActiveCompanyIdState(stored);
      return stored;
    }

    if (availableCompanies.length === 1) {
      setActiveCompanyId(availableCompanies[0].id);
      setActiveCompanyIdState(availableCompanies[0].id);
      return availableCompanies[0].id;
    }

    setActiveCompanyIdState('');
    clearActiveCompanyId();
    return '';
  };

  const loadOwnerResources = async (token: string, selectedCompanyId: string) => {
    const [myCompanyData, companyData, adminData, memberData] = await Promise.all([
      fetchMyCompanies(token),
      fetchCompanies(token),
      fetchAdmins(token),
      selectedCompanyId ? fetchMembers(token) : Promise.resolve([]),
    ]);

    setMyCompanies(myCompanyData);
    setCompanies(companyData);
    setAdmins(adminData);
    setMembers(memberData);

    if (!newAdminCompanyId && companyData[0]) {
      setNewAdminCompanyId(companyData[0]._id);
    }
  };

  const loadAdminResources = async (token: string, selectedCompanyId: string) => {
    const [myCompanyData, memberData] = await Promise.all([
      fetchMyCompanies(token),
      selectedCompanyId ? fetchMembers(token) : Promise.resolve([]),
    ]);

    const companyData: CompanyModel[] = myCompanyData.map((company) => ({
      _id: company.id,
      name: company.name,
      nit: company.nit,
      ownerId: '',
    }));

    setMyCompanies(myCompanyData);
    setCompanies(companyData);
    setMembers(memberData);
    setAdmins([]);
    setOwnerSection('members');
  };

  const refreshOwnerData = async (token: string = idToken, selectedCompanyId: string = activeCompanyId) => {
    if (!token) {
      return;
    }

    if ((profile?.role === 'owner' || profile?.role === 'admin') && !selectedCompanyId) {
      setMembers([]);
      return;
    }

    if (profile?.role === 'owner') {
      await loadOwnerResources(token, selectedCompanyId);
    }

    if (profile?.role === 'admin') {
      await loadAdminResources(token, selectedCompanyId);
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
      const availableCompanies = await fetchMyCompanies(token);
      const selectedCompany = hydrateActiveCompany(availableCompanies);

      setCurrentUser(credential.user);
      setIdToken(token);
      setProfile(userProfile);
      setMyCompanies(availableCompanies);

      if (userProfile.role === 'owner') {
        await loadOwnerResources(token, selectedCompany);
      }

      if (userProfile.role === 'admin') {
        await loadAdminResources(token, selectedCompany);
      }
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : 'No fue posible iniciar sesión con Firebase.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    clearActiveCompanyId();
    setCurrentUser(null);
    setIdToken('');
    setProfile(null);
    setError('');
    setPassword('');
    setAdmins([]);
    setMembers([]);
    setCompanies([]);
    setMyCompanies([]);
    setActiveCompanyIdState('');
  };

  useEffect(() => {
    if (!idToken) {
      return;
    }

    fetchMyCompanies(idToken)
      .then((companyData) => {
        setMyCompanies(companyData);
        if (!activeCompanyId) {
          hydrateActiveCompany(companyData);
        }
      })
      .catch(() => undefined);
  }, [idToken]);

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
    } finally {
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
      });
      setNewMemberEmail('');
      setNewMemberPassword('');
      await refreshOwnerData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible crear el usuario.');
    } finally {
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: '2rem auto' }}>
      <h1>SG-SST Frontend Auth</h1>

      {!currentUser ? (
        <form onSubmit={handleLogin} style={{ display: 'grid', gap: '0.5rem' }}>
          <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button type="submit" disabled={loading}>{loading ? 'Ingresando...' : 'Login'}</button>
        </form>
      ) : (
        <section style={{ display: 'grid', gap: '0.75rem' }}>
          <p>Sesión iniciada con UID: <strong>{currentUser.uid}</strong></p>
          <p style={{ margin: 0 }}>Rol detectado: <strong>{profile?.role ?? 'sin rol'}</strong></p>
          <CompanySelector companies={myCompanies} activeCompanyId={activeCompanyId} onSelectCompany={handleSelectCompany} />
          <button onClick={handleLogout}>Cerrar sesión</button>

          {!activeCompanyId ? (
            <p style={{ color: 'darkorange' }}>Selecciona una empresa para continuar</p>
          ) : null}

          {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {profile?.role === 'owner' ? <button onClick={() => setOwnerSection('admins')}>Crear Admin</button> : null}
                <button onClick={() => setOwnerSection('members')}>Crear Usuario</button>
                {profile?.role === 'owner' ? <button onClick={() => setOwnerSection('companies')}>Crear Empresa</button> : null}
                <button onClick={() => setOwnerSection('employees')}>Empleados</button>
                <button onClick={() => setOwnerSection('evaluations')}>Evaluación SG-SST</button>
                <button onClick={() => refreshOwnerData()} disabled={loading}>Recargar</button>
              </div>

              {ownerSection === 'admins' && profile?.role === 'owner' ? (
                <section>
                  <h2>CRUD Admins</h2>
                  <form onSubmit={handleCreateAdmin} style={{ display: 'grid', gap: '0.5rem' }}>
                    <input value={newAdminEmail} onChange={(event) => setNewAdminEmail(event.target.value)} placeholder="Email admin" required />
                    <input type="password" value={newAdminPassword} onChange={(event) => setNewAdminPassword(event.target.value)} placeholder="Password admin" required />
                    <select value={newAdminCompanyId} onChange={(event) => setNewAdminCompanyId(event.target.value)} required>
                      <option value="">Selecciona empresa</option>
                      {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
                    </select>
                    <button type="submit" disabled={loading}>Guardar Admin</button>
                  </form>
                  {admins.map((admin) => (
                    <div key={admin._id} style={{ border: '1px solid #ddd', padding: '0.5rem', marginTop: '0.5rem' }}>
                      <p>{admin.email}</p>
                      <select defaultValue={admin.companyId} onChange={(event) => updateAdmin(idToken, admin._id, { companyId: event.target.value }).then(() => refreshOwnerData()).catch((e) => setError(e.message))}>
                        {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
                      </select>
                      <button onClick={() => deleteAdmin(idToken, admin._id).then(() => refreshOwnerData()).catch((e) => setError(e.message))}>Eliminar</button>
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
                    <button type="submit" disabled={loading}>Guardar Usuario</button>
                  </form>
                  {members.map((member) => (
                    <div key={member._id} style={{ border: '1px solid #ddd', padding: '0.5rem', marginTop: '0.5rem' }}>
                      <p>{member.email}</p>
                      {profile?.role === 'owner' ? (
                        <select defaultValue={member.companyId} onChange={(event) => updateMember(idToken, member._id, { companyId: event.target.value }).then(() => refreshOwnerData()).catch((e) => setError(e.message))}>
                          {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
                        </select>
                      ) : null}
                      <button onClick={() => deleteMember(idToken, member._id).then(() => refreshOwnerData()).catch((e) => setError(e.message))}>Eliminar</button>
                    </div>
                  ))}
                </section>
              ) : null}



              {ownerSection === 'employees' ? (
                <EmployeesPage token={idToken} />
              ) : null}

              {ownerSection === 'evaluations' ? (
                <EvaluationsPage token={idToken} companyId={activeCompanyId || profile?.companyId || ''} />
              ) : null}

              {ownerSection === 'companies' && profile?.role === 'owner' ? (
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
                      <button onClick={() => updateCompany(idToken, company._id, { name: `${company.name} (editada)` }).then(() => refreshOwnerData()).catch((e) => setError(e.message))}>Editar nombre</button>
                      <button onClick={() => deleteCompany(idToken, company._id).then(() => refreshOwnerData()).catch((e) => setError(e.message))}>Eliminar</button>
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          ) : (
            <p>Este dashboard extendido está disponible para owner o admin.</p>
          )}
        </section>
      )}

      {error ? <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre> : null}
    </main>
  );
}

export default App;
