import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  CompanyModel,
  MyCompanyModel,
  UserModel,
  clearActiveCompanyId,
  createAdmin,
  createCompany,
  createUser,
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
import { Layout } from './components/Layout';
import { Button } from './components/ui/Button';
import { Card } from './components/ui/Card';
import { Input } from './components/ui/Input';
import { Select } from './components/ui/Select';
import { FirebaseUser, getIdToken, signInWithEmailAndPassword, signOut } from './firebase';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { RisksPage } from './pages/RisksPage';
import { TrainingsPage } from './pages/TrainingsPage';
import { EvaluationsPage } from './pages/evaluations/EvaluationsPage';
import { PlanPage } from './pages/documents/PlanPage';
import { DoPage } from './pages/documents/DoPage';
import { CheckPage } from './pages/documents/CheckPage';
import { ActPage } from './pages/documents/ActPage';
import { DocumentsEvaluationProvider } from './pages/documents/evaluationState';

type CompaniesPageProps = {
  companies: CompanyModel[];
  errorSetter: (message: string) => void;
  handleCreateCompany: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  loading: boolean;
  newCompanyName: string;
  newCompanyNit: string;
  newCompanyStandardsType: string;
  onDeleteCompany: (companyId: string) => Promise<void>;
  onUpdateCompany: (companyId: string, companyName: string) => Promise<void>;
  profileRole?: UserModel['role'];
  setNewCompanyName: (value: string) => void;
  setNewCompanyNit: (value: string) => void;
  setNewCompanyStandardsType: (value: string) => void;
  sharedHeader: ReactNode;
};

function CompaniesPage({
  companies,
  errorSetter,
  handleCreateCompany,
  loading,
  newCompanyName,
  newCompanyNit,
  newCompanyStandardsType,
  onDeleteCompany,
  onUpdateCompany,
  profileRole,
  setNewCompanyName,
  setNewCompanyNit,
  setNewCompanyStandardsType,
  sharedHeader,
}: CompaniesPageProps) {
  return (
    <>
      {sharedHeader}
      {profileRole === 'owner' ? (
        <Card>
          <h2>CRUD Empresas</h2>
          <form onSubmit={handleCreateCompany} className="form-grid">
            <Input value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} placeholder="Nombre empresa" required />
            <Input value={newCompanyNit} onChange={(event) => setNewCompanyNit(event.target.value)} placeholder="NIT" required />
            <Select value={newCompanyStandardsType} onChange={(event) => setNewCompanyStandardsType(event.target.value)} required>
              <option value="">Selecciona tipo de estándar</option>
              <option value="7">7 Estándares</option>
              <option value="21">21 Estándares</option>
              <option value="60">60 Estándares</option>
            </Select>
            <Button type="submit" disabled={loading}>Guardar Empresa</Button>
          </form>
          {companies.map((company) => (
            <div key={company._id} className="card" style={{ padding: '.75rem', marginTop: '.5rem' }}>
              <p>{company.name} - {company.nit}</p>
              <Button type="button" variant="secondary" onClick={() => onUpdateCompany(company._id, company.name).catch((e) => errorSetter(e.message))}>Editar nombre</Button>
              <Button type="button" variant="danger" onClick={() => onDeleteCompany(company._id).catch((e) => errorSetter(e.message))}>Eliminar</Button>
            </div>
          ))}
        </Card>
      ) : (
        <p>Este módulo está disponible solo para owner.</p>
      )}
    </>
  );
}

function App() {
  type CreatableRole = 'admin' | 'member' | 'manager';

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
  const [newMemberRole, setNewMemberRole] = useState<CreatableRole | ''>('');

  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyNit, setNewCompanyNit] = useState('');
  const [newCompanyStandardsType, setNewCompanyStandardsType] = useState('');

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
      if (!newMemberRole) {
        setError('Debes seleccionar un rol para crear el usuario.');
        return;
      }

      await createUser(idToken, {
        email: newMemberEmail,
        password: newMemberPassword,
        role: newMemberRole,
      });
      setNewMemberEmail('');
      setNewMemberPassword('');
      setNewMemberRole('');
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
      await createCompany(idToken, { name: newCompanyName, nit: newCompanyNit, standardsType: newCompanyStandardsType });
      setNewCompanyName('');
      setNewCompanyNit('');
      setNewCompanyStandardsType('');
      await refreshOwnerData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible crear la empresa.');
    } finally {
      setLoading(false);
    }
  };

  const renderSharedHeader = () => (
    <Card className="grid" style={{ marginBottom: '1rem' }}>
      <p>Sesión iniciada con UID: <strong>{currentUser?.uid}</strong></p>
      <p style={{ margin: 0 }}>Rol detectado: <strong>{profile?.role ?? 'sin rol'}</strong></p>
      <CompanySelector companies={myCompanies} activeCompanyId={activeCompanyId} onSelectCompany={handleSelectCompany} />
      <div className="actions" style={{ marginTop: '.75rem' }}>
        <Button type="button" variant="secondary" onClick={() => refreshOwnerData()} disabled={loading}>Recargar</Button>
        <Button type="button" variant="danger" onClick={handleLogout}>Cerrar sesión</Button>
      </div>
      {!activeCompanyId ? <p className="muted">Selecciona una empresa para continuar</p> : null}
      {error ? <pre className="error">{error}</pre> : null}
    </Card>
  );

  const renderManagerDashboardRoutePage = () => (
    <>
      {renderSharedHeader()}
      {activeCompanyId ? <DashboardPage token={idToken} companyId={activeCompanyId} /> : <p>Selecciona una empresa para ver el dashboard.</p>}
    </>
  );

  const renderUsersPage = () => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <Card>
          <h2>CRUD Usuarios</h2>
          <form onSubmit={handleCreateMember} className="form-grid">
            <Input value={newMemberEmail} onChange={(event) => setNewMemberEmail(event.target.value)} placeholder="Email usuario" required />
            <Input type="password" value={newMemberPassword} onChange={(event) => setNewMemberPassword(event.target.value)} placeholder="Password usuario" required />
            <label htmlFor="member-role">Rol del usuario</label>
            <Select
              id="member-role"
              value={newMemberRole}
              onChange={(event) => setNewMemberRole(event.target.value as CreatableRole | '')}
              required
            >
              <option value="">Selecciona rol</option>
              <option value="admin">Admin (gestiona sistema)</option>
              <option value="member">Member (operativo)</option>
              <option value="manager">Manager (solo visualización)</option>
            </Select>
            {newMemberRole === 'manager' ? (
              <p style={{ margin: 0, color: '#4a5568' }}>
                Este usuario solo podrá ver indicadores y reportes, no podrá editar información.
              </p>
            ) : null}
            <Button type="submit" disabled={loading}>Guardar Usuario</Button>
          </form>
          {members.map((member) => (
            <div key={member._id} className="card" style={{ padding: '.75rem', marginTop: '.5rem' }}>
              <p>{member.email}</p>
              {profile?.role === 'owner' ? (
                <Select defaultValue={member.companyId} onChange={(event) => updateMember(idToken, member._id, { companyId: event.target.value }).then(() => refreshOwnerData()).catch((e) => setError(e.message))}>
                  {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
                </Select>
              ) : null}
              <Button type="button" variant="danger" onClick={() => deleteMember(idToken, member._id).then(() => refreshOwnerData()).catch((e) => setError(e.message))}>Eliminar</Button>
            </div>
          ))}

          {profile?.role === 'owner' ? (
            <>
              <h3>CRUD Admins</h3>
              <form onSubmit={handleCreateAdmin} className="form-grid">
                <Input value={newAdminEmail} onChange={(event) => setNewAdminEmail(event.target.value)} placeholder="Email admin" required />
                <Input type="password" value={newAdminPassword} onChange={(event) => setNewAdminPassword(event.target.value)} placeholder="Password admin" required />
                <Select value={newAdminCompanyId} onChange={(event) => setNewAdminCompanyId(event.target.value)} required>
                  <option value="">Selecciona empresa</option>
                  {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
                </Select>
                <Button type="submit" disabled={loading}>Guardar Admin</Button>
              </form>
              {admins.map((admin) => (
                <div key={admin._id} className="card" style={{ padding: '.75rem', marginTop: '.5rem' }}>
                  <p>{admin.email}</p>
                  <Select defaultValue={admin.companyId} onChange={(event) => updateAdmin(idToken, admin._id, { companyId: event.target.value }).then(() => refreshOwnerData()).catch((e) => setError(e.message))}>
                    {companies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}
                  </Select>
                  <Button type="button" variant="danger" onClick={() => deleteAdmin(idToken, admin._id).then(() => refreshOwnerData()).catch((e) => setError(e.message))}>Eliminar</Button>
                </div>
              ))}
            </>
          ) : null}
        </Card>
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  const renderEmployeesRoutePage = () => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <EmployeesPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  const renderEvaluationsRoutePage = () => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <EvaluationsPage token={idToken} companyId={activeCompanyId || profile?.companyId || ''} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  const renderDocumentsRoutePage = (page: ReactNode) => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <DocumentsEvaluationProvider>{page}</DocumentsEvaluationProvider>
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  const renderIncidentsRoutePage = () => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <IncidentsPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  const renderTrainingsRoutePage = () => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <TrainingsPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  const renderRisksRoutePage = () => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <RisksPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  if (!currentUser) {
    return (
      <main className="auth-wrap"><div className="card">
        <h1 style={{ marginTop: 0 }}>SG-SST Frontend Auth</h1>
        <form onSubmit={handleLogin} className="form-grid">
          <Input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <Button type="submit" disabled={loading}>{loading ? 'Ingresando...' : 'Login'}</Button>
        </form>
        {error ? <pre className="error">{error}</pre> : null}
      </div></main>
    );
  }

  return (
    <Routes>
      <Route element={<Layout role={profile?.role} />}>
        <Route path="/dashboard" element={renderManagerDashboardRoutePage()} />
        <Route
          path="/companies"
          element={
            profile?.role === 'manager' ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <CompaniesPage
                companies={companies}
                errorSetter={setError}
                handleCreateCompany={handleCreateCompany}
                loading={loading}
                newCompanyName={newCompanyName}
                newCompanyNit={newCompanyNit}
                newCompanyStandardsType={newCompanyStandardsType}
                onDeleteCompany={(companyId) => deleteCompany(idToken, companyId).then(() => refreshOwnerData())}
                onUpdateCompany={(companyId, companyName) => updateCompany(idToken, companyId, { name: `${companyName} (editada)` }).then(() => refreshOwnerData())}
                profileRole={profile?.role}
                setNewCompanyName={setNewCompanyName}
                setNewCompanyNit={setNewCompanyNit}
                setNewCompanyStandardsType={setNewCompanyStandardsType}
                sharedHeader={renderSharedHeader()}
              />
            )
          }
        />
        <Route path="/users" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderUsersPage()} />
        <Route path="/employees" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderEmployeesRoutePage()} />
        <Route path="/evaluations" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderEvaluationsRoutePage()} />
        <Route path="/risks" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderRisksRoutePage()} />
        <Route path="/documents" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : <Navigate to="/documents/plan" replace />} />
        <Route path="/documents/plan" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderDocumentsRoutePage(<PlanPage />)} />
        <Route path="/documents/do" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderDocumentsRoutePage(<DoPage />)} />
        <Route path="/documents/check" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderDocumentsRoutePage(<CheckPage />)} />
        <Route path="/documents/act" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderDocumentsRoutePage(<ActPage />)} />
        <Route path="/incidents" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderIncidentsRoutePage()} />
        <Route path="/trainings" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderTrainingsRoutePage()} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
