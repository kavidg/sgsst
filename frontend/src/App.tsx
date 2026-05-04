import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  CompanyModel,
  MyCompanyModel,
  UserModel,
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
  updateAdmin,
  updateCompany,
  updateMember,
} from './api';
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
import { InspectionsPage } from './pages/InspectionsPage';
import { AbsenteeismPage } from './pages/AbsenteeismPage';
import { AlertsPage } from './pages/AlertsPage';
import { EvaluationsPage } from './pages/evaluations/EvaluationsPage';
import { PlanPage } from './pages/documents/PlanPage';
import { DoPage } from './pages/documents/DoPage';
import { CheckPage } from './pages/documents/CheckPage';
import { ActPage } from './pages/documents/ActPage';
import { DocumentsEvaluationProvider } from './pages/documents/evaluationState';
import { useCompanyContext } from './context/CompanyContext';
import { DocumentsPage } from './pages/DocumentsPage';
import { ProfilePage } from './pages/ProfilePage';

type CompaniesPageProps = {
  companies: CompanyModel[];
  errorSetter: (message: string) => void;
  handleCreateCompany: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  loading: boolean;
  newCompanyName: string;
  newCompanyNit: string;
  newCompanyStandardsType: string;
  onDeleteCompany: (companyId: string) => Promise<void>;
  onUpdateCompany: (company: CompanyModel) => Promise<void>;
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
              <p>{company.name} - {company.nit} - {company.standardsType ?? 'Sin estándar'}</p>
              <Button type="button" variant="secondary" onClick={() => onUpdateCompany(company).catch((e) => errorSetter(e.message))}>Editar empresa</Button>
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
  const { companyId: activeCompanyId, setCompanyId } = useCompanyContext();

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
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminConfirmPassword, setNewAdminConfirmPassword] = useState('');
  const [newAdminCompanyId, setNewAdminCompanyId] = useState('');

  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberConfirmPassword, setNewMemberConfirmPassword] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<CreatableRole | ''>('');

  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyNit, setNewCompanyNit] = useState('');
  const [newCompanyStandardsType, setNewCompanyStandardsType] = useState('');
  const [userFirstName, setUserFirstName] = useState('User');
  const [userLastName, setUserLastName] = useState('');
  const [userProfileImage, setUserProfileImage] = useState('');
  const companySelectorOptions: MyCompanyModel[] = profile?.role === 'owner'
    ? companies.map((company) => ({
      id: company._id,
      name: company.name,
      nit: company.nit,
    }))
    : myCompanies;

  useEffect(() => {
    const savedFirstName = localStorage.getItem('profile:firstName');
    const savedLastName = localStorage.getItem('profile:lastName');
    const savedProfileImage = localStorage.getItem('profile:image');

    if (savedFirstName) setUserFirstName(savedFirstName);
    if (savedLastName) setUserLastName(savedLastName);
    if (savedProfileImage) setUserProfileImage(savedProfileImage);
  }, []);

  const handleSelectCompany = async (companyId: string) => {
    setCompanyId(companyId);
    if (idToken) {
      await refreshOwnerData(idToken, companyId);
    }
  };

  const hydrateActiveCompany = (availableCompanies: MyCompanyModel[]): string => {
    const stored = activeCompanyId;

    if (stored && availableCompanies.some((company) => company.id === stored)) {
      return stored;
    }

    if (availableCompanies.length === 1) {
      setCompanyId(availableCompanies[0].id);
      return availableCompanies[0].id;
    }

    setCompanyId('');
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
    setCompanyId('');
    setCurrentUser(null);
    setIdToken('');
    setProfile(null);
    setError('');
    setPassword('');
    setAdmins([]);
    setMembers([]);
    setCompanies([]);
    setMyCompanies([]);
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
  }, [activeCompanyId, idToken]);

  const handleCreateAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (newAdminPassword.length < 6) {
        setError('La contraseña del admin debe tener al menos 6 caracteres.');
        return;
      }

      if (newAdminPassword !== newAdminConfirmPassword) {
        setError('La confirmación de contraseña del admin no coincide.');
        return;
      }

      await createAdmin(idToken, {
        email: newAdminEmail,
        password: newAdminPassword,
        role: 'admin',
        companyId: newAdminCompanyId,
      });
      setNewAdminEmail('');
      setNewAdminPassword('');
      setNewAdminConfirmPassword('');
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

      if (newMemberPassword.length < 6) {
        setError('La contraseña del usuario debe tener al menos 6 caracteres.');
        return;
      }

      if (newMemberPassword !== newMemberConfirmPassword) {
        setError('La confirmación de contraseña del usuario no coincide.');
        return;
      }

      await createUser(idToken, {
        email: newMemberEmail,
        password: newMemberPassword,
        role: newMemberRole,
      });
      setNewMemberEmail('');
      setNewMemberPassword('');
      setNewMemberConfirmPassword('');
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

  const renderSharedHeader = (showDetectedRole = false) => {
    const showRole = showDetectedRole;
    const showCompanyWarning = !activeCompanyId;
    const showError = Boolean(error);

    if (!showRole && !showCompanyWarning && !showError) {
      return null;
    }

    return (
      <Card className="grid" style={{ marginBottom: '1rem' }}>
        {showRole ? <p style={{ margin: 0 }}>Rol detectado: <strong>{profile?.role ?? 'sin rol'}</strong></p> : null}
        {showCompanyWarning ? <p className="muted">Selecciona una empresa para continuar</p> : null}
        {showError ? <pre className="error">{error}</pre> : null}
      </Card>
    );
  };

  const renderManagerDashboardRoutePage = () => (
      <>
      {renderSharedHeader(true)}
      {activeCompanyId ? <DashboardPage token={idToken} /> : <p>Selecciona una empresa para ver el dashboard.</p>}
    </>
  );

  const renderUsersPage = () => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <Card>
          <h2>Creación de usuarios</h2>
          <form onSubmit={handleCreateMember} className="form-grid" autoComplete="off">
            <Input type="email" value={newMemberEmail} onChange={(event) => setNewMemberEmail(event.target.value)} placeholder="Digita el correo electrónico del usuario (ej: usuario@empresa.com)" autoComplete="off" required />
            <Input type="password" value={newMemberPassword} onChange={(event) => setNewMemberPassword(event.target.value)} placeholder="Digita la contraseña del usuario (mínimo 6 caracteres)" autoComplete="new-password" minLength={6} required />
            <Input type="password" value={newMemberConfirmPassword} onChange={(event) => setNewMemberConfirmPassword(event.target.value)} placeholder="Confirma la contraseña del usuario" autoComplete="new-password" minLength={6} required />
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
          <h3>Listado usuarios</h3>
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
              <form onSubmit={handleCreateAdmin} className="form-grid" autoComplete="off">
                <Input type="email" value={newAdminEmail} onChange={(event) => setNewAdminEmail(event.target.value)} placeholder="Digita el correo electrónico del admin (ej: admin@empresa.com)" autoComplete="off" required />
                <Input type="password" value={newAdminPassword} onChange={(event) => setNewAdminPassword(event.target.value)} placeholder="Digita la contraseña del admin (mínimo 6 caracteres)" autoComplete="new-password" minLength={6} required />
                <Input type="password" value={newAdminConfirmPassword} onChange={(event) => setNewAdminConfirmPassword(event.target.value)} placeholder="Confirma la contraseña del admin" autoComplete="new-password" minLength={6} required />
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
        <EvaluationsPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  const renderDocumentsRoutePage = (page: ReactNode) => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'manager') && activeCompanyId ? (
        <DocumentsEvaluationProvider>{page}</DocumentsEvaluationProvider>
      ) : (
        <p>Este módulo está disponible para owner, admin o manager con empresa activa.</p>
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

  const renderAbsenteeismRoutePage = () => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <AbsenteeismPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );

  const renderAlertsRoutePage = () => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <AlertsPage token={idToken} />
      ) : (
        <p>Este módulo está disponible para owner o admin con empresa activa.</p>
      )}
    </>
  );


  const renderInspectionsRoutePage = () => (
    <>
      {renderSharedHeader()}
      {(profile?.role === 'owner' || profile?.role === 'admin') && activeCompanyId ? (
        <InspectionsPage />
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
        <h1 style={{ marginTop: 0 }}>Sistema SG-SST</h1>
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
      <Route
        element={
          <Layout
            token={idToken}
            role={profile?.role}
            companies={companySelectorOptions}
            activeCompanyId={activeCompanyId}
            onSelectCompany={handleSelectCompany}
            onRefresh={() => void refreshOwnerData()}
            onLogout={() => void handleLogout()}
            loading={loading}
            userName={userFirstName}
            userProfileImage={userProfileImage}
          />
        }
      >
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
                onUpdateCompany={async (company) => {
                  const nextName = window.prompt('Nombre de la empresa', company.name)?.trim();
                  if (!nextName) {
                    return;
                  }
                  const nextNit = window.prompt('NIT de la empresa', company.nit)?.trim();
                  if (!nextNit) {
                    return;
                  }
                  const nextStandardsType = window.prompt(
                    'Tipo de estándar (7, 21 o 60)',
                    company.standardsType ?? '',
                  )?.trim();
                  if (!nextStandardsType) {
                    return;
                  }
                  if (!['7', '21', '60'].includes(nextStandardsType)) {
                    throw new Error('El tipo de estándar debe ser 7, 21 o 60.');
                  }

                  await updateCompany(idToken, company._id, {
                    name: nextName,
                    nit: nextNit,
                    standardsType: nextStandardsType,
                  });
                  await refreshOwnerData();
                }}
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
        <Route path="/documents" element={renderDocumentsRoutePage(<DocumentsPage token={idToken} />)} />
        <Route path="/documents/plan" element={renderDocumentsRoutePage(<PlanPage readOnly={profile?.role === 'manager'} />)} />
        <Route path="/documents/do" element={renderDocumentsRoutePage(<DoPage readOnly={profile?.role === 'manager'} />)} />
        <Route path="/documents/check" element={renderDocumentsRoutePage(<CheckPage readOnly={profile?.role === 'manager'} />)} />
        <Route path="/documents/act" element={renderDocumentsRoutePage(<ActPage readOnly={profile?.role === 'manager'} />)} />
        <Route path="/incidents" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderIncidentsRoutePage()} />
        <Route path="/alerts" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderAlertsRoutePage()} />
        <Route path="/absenteeism" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderAbsenteeismRoutePage()} />
        <Route path="/trainings" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderTrainingsRoutePage()} />
        <Route path="/inspections" element={profile?.role === 'manager' ? <Navigate to="/dashboard" replace /> : renderInspectionsRoutePage()} />
        <Route
          path="/profile"
          element={
            <ProfilePage
              firstName={userFirstName}
              lastName={userLastName}
              profileImage={userProfileImage}
              onSave={(firstName, lastName, profileImage) => {
                setUserFirstName(firstName);
                setUserLastName(lastName);
                setUserProfileImage(profileImage);
                localStorage.setItem('profile:firstName', firstName);
                localStorage.setItem('profile:lastName', lastName);
                localStorage.setItem('profile:image', profileImage);
              }}
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
