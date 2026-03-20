import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
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
  fetchComplianceByCompany,
  fetchEmployees,
  fetchIncidents,
  fetchMembers,
  fetchMyCompanies,
  fetchTrainings,
  fetchUserByFirebaseUid,
  getActiveCompanyId,
  setActiveCompanyId,
  updateAdmin,
  updateCompany,
  updateMember,
} from './api';
import { CompanySelector } from './CompanySelector';
import { Layout } from './components/Layout';
import { FirebaseUser, getIdToken, signInWithEmailAndPassword, signOut } from './firebase';
import { EmployeesPage } from './pages/EmployeesPage';
import { EvaluationsPage } from './pages/evaluations/EvaluationsPage';
import { RisksPage } from './pages/RisksPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { TrainingsPage } from './pages/TrainingsPage';


type CompaniesPageProps = {
  companies: CompanyModel[];
  errorSetter: (message: string) => void;
  handleCreateCompany: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  loading: boolean;
  newCompanyName: string;
  newCompanyNit: string;
  onDeleteCompany: (companyId: string) => Promise<void>;
  onUpdateCompany: (companyId: string, companyName: string) => Promise<void>;
  profileRole?: UserModel['role'];
  setNewCompanyName: (value: string) => void;
  setNewCompanyNit: (value: string) => void;
  sharedHeader: ReactNode;
};

function CompaniesPage({
  companies,
  errorSetter,
  handleCreateCompany,
  loading,
  newCompanyName,
  newCompanyNit,
  onDeleteCompany,
  onUpdateCompany,
  profileRole,
  setNewCompanyName,
  setNewCompanyNit,
  sharedHeader,
}: CompaniesPageProps) {
  return (
    <>
      {sharedHeader}
      {profileRole === 'owner' ? (
        <section style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: '1rem' }}>
          <h2>CRUD Empresas</h2>
          <form onSubmit={handleCreateCompany} style={{ display: 'grid', gap: '0.5rem' }}>
            <input value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} placeholder="Nombre empresa" required />
            <input value={newCompanyNit} onChange={(event) => setNewCompanyNit(event.target.value)} placeholder="NIT" required />
            <button type="submit" disabled={loading}>Guardar Empresa</button>
          </form>
          {companies.map((company) => (
            <div key={company._id} style={{ border: '1px solid #ddd', padding: '0.5rem', marginTop: '0.5rem' }}>
              <p>{company.name} - {company.nit}</p>
              <button onClick={() => onUpdateCompany(company._id, company.name).catch((e) => errorSetter(e.message))}>Editar nombre</button>
              <button onClick={() => onDeleteCompany(company._id).catch((e) => errorSetter(e.message))}>Eliminar</button>
            </div>
          ))}
        </section>
      ) : (
        <p>Este módulo está disponible solo para owner.</p>
      )}
    </>
  );
}

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [idToken, setIdToken] = useState('');
  const [profile, setProfile] = useState<UserModel | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
  const [dashboardStats, setDashboardStats] = useState({
    totalEmployees: 0,
    totalIncidents: 0,
    compliancePercentage: 0,
    totalTrainings: 0,
  });

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
  };

  const loadManagerResources = async (token: string) => {
    const myCompanyData = await fetchMyCompanies(token);
    const companyData: CompanyModel[] = myCompanyData.map((company) => ({
      _id: company.id,
      name: company.name,
      nit: company.nit,
      ownerId: '',
    }));

    setMyCompanies(myCompanyData);
    setCompanies(companyData);
    setAdmins([]);
    setMembers([]);
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

    if (profile?.role === 'manager') {
      await loadManagerResources(token);
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

      if (userProfile.role === 'manager') {
        await loadManagerResources(token);
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

  useEffect(() => {
    if (!idToken || !activeCompanyId) {
      setDashboardStats({
        totalEmployees: 0,
        totalIncidents: 0,
        compliancePercentage: 0,
        totalTrainings: 0,
      });
      return;
    }

    Promise.all([
      fetchEmployees(idToken),
      fetchIncidents(idToken),
      fetchComplianceByCompany(idToken, activeCompanyId).catch(() => ({ total: 0, complies: 0, percentage: 0 })),
      fetchTrainings(idToken),
    ])
      .then(([employeesData, incidentsData, complianceData, trainingsData]) => {
        setDashboardStats({
          totalEmployees: employeesData.length,
          totalIncidents: incidentsData.length,
          compliancePercentage: complianceData.percentage ?? 0,
          totalTrainings: trainingsData.length,
        });
      })
      .catch(() => undefined);
  }, [idToken, activeCompanyId]);

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

  const SharedHeader = () => (
    <section style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: '1rem', marginBottom: '1rem' }}>
      <p>Sesión iniciada con UID: <strong>{currentUser?.uid}</strong></p>
      <p style={{ margin: 0 }}>Rol detectado: <strong>{profile?.role ?? 'sin rol'}</strong></p>
      <CompanySelector companies={myCompanies} activeCompanyId={activeCompanyId} onSelectCompany={handleSelectCompany} />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button onClick={() => refreshOwnerData()} disabled={loading}>Recargar</button>
        <button onClick={handleLogout}>Cerrar sesión</button>
      </div>
      {!activeCompanyId ? <p style={{ color: 'darkorange' }}>Selecciona una empresa para continuar</p> : null}
      {error ? <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre> : null}
    </section>
  );

  const DashboardPage = () => (
    <>
      <SharedHeader />
      <section style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Dashboard</h2>
        <p>Vista general de indicadores clave del SG-SST.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
          <article style={{ border: '1px solid #ddd', borderRadius: 10, padding: '0.75rem' }}>
            <strong>Total empleados</strong>
            <p style={{ fontSize: '1.3rem', margin: '0.5rem 0 0' }}>{dashboardStats.totalEmployees}</p>
          </article>
          <article style={{ border: '1px solid #ddd', borderRadius: 10, padding: '0.75rem' }}>
            <strong>Total incidentes</strong>
            <p style={{ fontSize: '1.3rem', margin: '0.5rem 0 0' }}>{dashboardStats.totalIncidents}</p>
          </article>
          <article style={{ border: '1px solid #ddd', borderRadius: 10, padding: '0.75rem' }}>
            <strong>% cumplimiento</strong>
            <p style={{ fontSize: '1.3rem', margin: '0.5rem 0 0' }}>{dashboardStats.compliancePercentage.toFixed(2)}%</p>
          </article>
          <article style={{ border: '1px solid #ddd', borderRadius: 10, padding: '0.75rem' }}>
            <strong>Total capacitaciones</strong>
            <p style={{ fontSize: '1.3rem', margin: '0.5rem 0 0' }}>{dashboardStats.totalTrainings}</p>
          </article>
        </div>
      </section>
    </>
  );

  const ReportsPage = () => (
    <>
      <SharedHeader />
      <section style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Reports</h2>
        <p>Resumen rápido para seguimiento ejecutivo.</p>
        <ul>
          <li>Incidentes registrados: {dashboardStats.totalIncidents}</li>
          <li>Capacitaciones completadas: {dashboardStats.totalTrainings}</li>
        </ul>
      </section>
    </>
  );

  const IndicatorsPage = () => (
    <>
      <SharedHeader />
      <section style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Indicators</h2>
        <p>KPIs principales de la organización:</p>
        <ul>
          <li>Empleados activos: {dashboardStats.totalEmployees}</li>
          <li>Cumplimiento SG-SST: {dashboardStats.compliancePercentage.toFixed(2)}%</li>
        </ul>
      </section>
    </>
  );

  const UsersPage = () => (
    <>
      <SharedHeader />
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <section style={{ background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: '1rem' }}>
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

          {profile?.role === 'owner' ? (
            <>
              <h3>CRUD Admins</h3>
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
            </>
          ) : null}
        </section>
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );



  const EmployeesRoutePage = () => (
    <>
      <SharedHeader />
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <EmployeesPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  const EvaluationsRoutePage = () => (
    <>
      <SharedHeader />
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <EvaluationsPage token={idToken} companyId={activeCompanyId || profile?.companyId || ''} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );



  const DocumentsRoutePage = () => (
    <>
      <SharedHeader />
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <DocumentsPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  const IncidentsRoutePage = () => (
    <>
      <SharedHeader />
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <IncidentsPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );


  const TrainingsRoutePage = () => (
    <>
      <SharedHeader />
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <TrainingsPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  const RisksRoutePage = () => (
    <>
      <SharedHeader />
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <RisksPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  if (!currentUser) {
    return (
      <main style={{ fontFamily: 'sans-serif', maxWidth: 420, margin: '4rem auto', padding: '1.5rem', border: '1px solid #dbe3ee', borderRadius: 12 }}>
        <h1 style={{ marginTop: 0 }}>SG-SST Frontend Auth</h1>
        <form onSubmit={handleLogin} style={{ display: 'grid', gap: '0.5rem' }}>
          <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button type="submit" disabled={loading}>{loading ? 'Ingresando...' : 'Login'}</button>
        </form>
        {error ? <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre> : null}
      </main>
    );
  }

  return (
    <Routes>
      <Route element={<Layout role={profile?.role} />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/reports" element={profile?.role === 'manager' ? <ReportsPage /> : <Navigate to="/dashboard" replace />} />
        <Route path="/indicators" element={profile?.role === 'manager' ? <IndicatorsPage /> : <Navigate to="/dashboard" replace />} />
        <Route
          path="/companies"
          element={
            <CompaniesPage
              companies={companies}
              errorSetter={setError}
              handleCreateCompany={handleCreateCompany}
              loading={loading}
              newCompanyName={newCompanyName}
              newCompanyNit={newCompanyNit}
              onDeleteCompany={(companyId) => deleteCompany(idToken, companyId).then(() => refreshOwnerData())}
              onUpdateCompany={(companyId, companyName) => updateCompany(idToken, companyId, { name: `${companyName} (editada)` }).then(() => refreshOwnerData())}
              profileRole={profile?.role}
              setNewCompanyName={setNewCompanyName}
              setNewCompanyNit={setNewCompanyNit}
              sharedHeader={<SharedHeader />}
            />
          }
        />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/employees" element={<EmployeesRoutePage />} />
        <Route path="/evaluations" element={<EvaluationsRoutePage />} />
        <Route path="/risks" element={<RisksRoutePage />} />
        <Route path="/documents" element={<DocumentsRoutePage />} />
        <Route path="/incidents" element={<IncidentsRoutePage />} />
        <Route path="/trainings" element={<TrainingsRoutePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
