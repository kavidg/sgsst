import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  bulkCreateEmployees,
  BulkEmployeesResponse,
  CreateEmployeePayload,
  EmployeeModel,
  createEmployee,
  deleteEmployee,
  fetchEmployees,
  updateEmployee,
  fetchOccupationalExams,
  createOccupationalExam,
  updateOccupationalExam,
  deleteOccupationalExam,
  type OccupationalExam,
  type ExamType,
  type ExamStatusType,
  type FitnessStatusType,
  type CreateOccupationalExamPayload,
} from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Table } from '../components/ui/Table';
import { useCompanyContext } from '../context/CompanyContext';

interface EmployeesPageProps {
  token: string;
}

interface EmployeeFormState {
  name: string;
  document: string;
  position: string;
  area: string;
  contractType: string;
  status: string;
  // Sociodemographic (3.1.1)
  birthDate: string;
  gender: string;
  maritalStatus: string;
  educationLevel: string;
  dependents: string;
  socioeconomicStratum: string;
  housingType: string;
  ethnicGroup: string;
  disability: string;
  workSchedule: string;
  admissionDate: string;
  workCenter: string;
}

interface BulkPreviewItem {
  row: number;
  data: CreateEmployeePayload;
  error?: string;
}

const emptyEmployee: EmployeeFormState = {
  name: '',
  document: '',
  position: '',
  area: '',
  contractType: '',
  status: 'Activo',
  birthDate: '',
  gender: '',
  maritalStatus: '',
  educationLevel: '',
  dependents: '',
  socioeconomicStratum: '',
  housingType: '',
  ethnicGroup: '',
  disability: '',
  workSchedule: '',
  admissionDate: '',
  workCenter: '',
};

const BULK_ALLOWED_STATUS = new Set(['Activo', 'No activo']);

// ── Sociodemographic enums ──

const GENDER_OPTIONS = [
  { value: 'MASCULINO', label: 'Masculino' },
  { value: 'FEMENINO', label: 'Femenino' },
  { value: 'OTRO', label: 'Otro' },
];

const MARITAL_STATUS_OPTIONS = [
  { value: 'SOLTERO', label: 'Soltero(a)' },
  { value: 'CASADO', label: 'Casado(a)' },
  { value: 'DIVORCIADO', label: 'Divorciado(a)' },
  { value: 'VIUDO', label: 'Viudo(a)' },
  { value: 'UNION_LIBRE', label: 'Unión libre' },
];

const EDUCATION_LEVEL_OPTIONS = [
  { value: 'PRIMARIA', label: 'Primaria' },
  { value: 'SECUNDARIA', label: 'Secundaria' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'TECNOLOGO', label: 'Tecnólogo' },
  { value: 'PROFESIONAL', label: 'Profesional' },
  { value: 'POSGRADO', label: 'Posgrado' },
];

const HOUSING_TYPE_OPTIONS = [
  { value: 'PROPIA', label: 'Propia' },
  { value: 'ARRENDADA', label: 'Arrendada' },
  { value: 'FAMILIAR', label: 'Familiar' },
  { value: 'OTRO', label: 'Otro' },
];

const ETHNIC_GROUP_OPTIONS = [
  { value: 'INDIGENA', label: 'Indígena' },
  { value: 'ROM', label: 'Rom' },
  { value: 'RAIZAL', label: 'Raizal' },
  { value: 'PALENQUERO', label: 'Palenquero' },
  { value: 'AFROCOLOMBIANO', label: 'Afrocolombiano' },
  { value: 'NINGUNO', label: 'Ninguno' },
  { value: 'OTRO', label: 'Otro' },
];

const WORK_SCHEDULE_OPTIONS = [
  { value: 'DIURNA', label: 'Diurna' },
  { value: 'NOCTURNA', label: 'Nocturna' },
  { value: 'MIXTA', label: 'Mixta' },
  { value: 'ROTATIVA', label: 'Rotativa' },
];

const STRATUM_OPTIONS = [1, 2, 3, 4, 5, 6];

// ── Occupational Exam enums (3.1.2) ──

const EXAM_TYPE_OPTIONS: { value: ExamType; label: string }[] = [
  { value: 'ENTRY', label: 'Ingreso' },
  { value: 'PERIODIC', label: 'Periódico' },
  { value: 'EXIT', label: 'Egreso' },
  { value: 'POST_INCAPACITY', label: 'Post-incapacidad' },
  { value: 'CHANGE_OF_OCCUPATION', label: 'Cambio de ocupación' },
  { value: 'OTHER', label: 'Otro' },
];

const EXAM_STATUS_OPTIONS: { value: ExamStatusType; label: string }[] = [
  { value: 'SCHEDULED', label: 'Programado' },
  { value: 'COMPLETED', label: 'Completado' },
  { value: 'EXPIRED', label: 'Vencido' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

const FITNESS_STATUS_OPTIONS: { value: FitnessStatusType; label: string }[] = [
  { value: 'FIT', label: 'Apto' },
  { value: 'FIT_WITH_RESTRICTIONS', label: 'Apto con restricciones' },
  { value: 'UNFIT', label: 'No apto' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'NOT_REPORTED', label: 'No reportado' },
];

const EXAM_TYPE_BADGE: Record<string, { color: string; bg: string }> = {
  ENTRY: { color: '#15803d', bg: '#f0fdf4' },
  PERIODIC: { color: '#2563eb', bg: '#eff6ff' },
  EXIT: { color: '#9333ea', bg: '#faf5ff' },
  POST_INCAPACITY: { color: '#d97706', bg: '#fffbeb' },
  CHANGE_OF_OCCUPATION: { color: '#0891b2', bg: '#ecfeff' },
  OTHER: { color: '#64748b', bg: '#f1f5f9' },
};

const EXAM_STATUS_BADGE: Record<string, { color: string; bg: string }> = {
  SCHEDULED: { color: '#2563eb', bg: '#eff6ff' },
  COMPLETED: { color: '#15803d', bg: '#f0fdf4' },
  EXPIRED: { color: '#dc2626', bg: '#fef2f2' },
  CANCELLED: { color: '#64748b', bg: '#f1f5f9' },
};

const FITNESS_BADGE: Record<string, { color: string; bg: string }> = {
  FIT: { color: '#15803d', bg: '#f0fdf4' },
  FIT_WITH_RESTRICTIONS: { color: '#d97706', bg: '#fffbeb' },
  UNFIT: { color: '#dc2626', bg: '#fef2f2' },
  PENDING: { color: '#64748b', bg: '#f1f5f9' },
  NOT_REPORTED: { color: '#94a3b8', bg: '#f8fafc' },
};

interface ExamFormState {
  examType: string;
  examDate: string;
  status: string;
  nextDueDate: string;
  fitnessStatus: string;
  followUpRequired: string;
  followUpDate: string;
}

const emptyExamForm: ExamFormState = {
  examType: 'ENTRY',
  examDate: '',
  status: 'SCHEDULED',
  nextDueDate: '',
  fitnessStatus: '',
  followUpRequired: 'false',
  followUpDate: ''
};

// ── Profile indicator helpers ──

function countCompletedProfileFields(form: EmployeeFormState): number {
  let count = 0;
  if (form.birthDate) count++;
  if (form.gender) count++;
  if (form.maritalStatus) count++;
  if (form.educationLevel) count++;
  return count;
}

function getProfileStatus(completed: number): { label: string; color: string; icon: string } {
  if (completed === 4) return { label: 'Completo', color: '#16a34a', icon: '✓' };
  if (completed >= 2) return { label: 'Incompleto', color: '#d97706', icon: '⚠' };
  return { label: 'Incompleto', color: '#dc2626', icon: '⚠' };
}

function ProfileBadge({ employee }: { employee: EmployeeModel }) {
  let completed = 0;
  if (employee.birthDate) completed++;
  if (employee.gender) completed++;
  if (employee.maritalStatus) completed++;
  if (employee.educationLevel) completed++;
  const status = getProfileStatus(completed);
  return (
    <span style={{ fontSize: '.8rem', color: status.color, fontWeight: 600 }}>
      {status.icon} {completed}/4
    </span>
  );
}

// ── Today's date for max date inputs ──
const TODAY = new Date().toISOString().slice(0, 10);

export function EmployeesPage({ token }: EmployeesPageProps) {
  const { companyId } = useCompanyContext();
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(emptyEmployee);
  const [formTab, setFormTab] = useState<'laboral' | 'sociodemografico' | 'complementario'>('laboral');

  const [bulkPreview, setBulkPreview] = useState<BulkPreviewItem[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkEmployeesResponse | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // ── Occupational Exam state (3.1.2) ──
  const [examEmployee, setExamEmployee] = useState<EmployeeModel | null>(null);
  const [exams, setExams] = useState<OccupationalExam[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examsError, setExamsError] = useState('');
  const [examForm, setExamForm] = useState<ExamFormState>(emptyExamForm);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [examFormLoading, setExamFormLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadEmployees = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await fetchEmployees(token);
      setEmployees(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar empleados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, [companyId, token]);

  const resetForm = () => {
    setForm(emptyEmployee);
    setEditingEmployeeId(null);
    setFormTab('laboral');
  };

  const buildPayload = (): CreateEmployeePayload => {
    const payload: CreateEmployeePayload = {
      name: form.name,
      document: form.document,
      position: form.position,
      area: form.area,
      contractType: form.contractType,
      status: form.status,
    };
    // Sociodemographic — only include non-empty values
    if (form.birthDate) payload.birthDate = form.birthDate;
    if (form.gender) payload.gender = form.gender as CreateEmployeePayload['gender'];
    if (form.maritalStatus) payload.maritalStatus = form.maritalStatus as CreateEmployeePayload['maritalStatus'];
    if (form.educationLevel) payload.educationLevel = form.educationLevel as CreateEmployeePayload['educationLevel'];
    if (form.dependents !== '') payload.dependents = parseInt(form.dependents, 10);
    if (form.socioeconomicStratum) payload.socioeconomicStratum = parseInt(form.socioeconomicStratum, 10);
    if (form.housingType) payload.housingType = form.housingType as CreateEmployeePayload['housingType'];
    if (form.ethnicGroup) payload.ethnicGroup = form.ethnicGroup as CreateEmployeePayload['ethnicGroup'];
    if (form.disability !== '') payload.disability = form.disability === 'true';
    if (form.workSchedule) payload.workSchedule = form.workSchedule as CreateEmployeePayload['workSchedule'];
    if (form.admissionDate) payload.admissionDate = form.admissionDate;
    if (form.workCenter) payload.workCenter = form.workCenter;
    return payload;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = buildPayload();
      if (editingEmployeeId) {
        await updateEmployee(token, editingEmployeeId, payload);
      } else {
        await createEmployee(token, payload);
      }

      resetForm();
      await loadEmployees();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible guardar empleado.');
      setLoading(false);
    }
  };

  const handleEdit = (employee: EmployeeModel) => {
    setEditingEmployeeId(employee._id);
    setFormTab('laboral');
    setForm({
      name: employee.name,
      document: employee.document,
      position: employee.position,
      area: employee.area,
      contractType: employee.contractType,
      status: employee.status,
      birthDate: employee.birthDate ? employee.birthDate.slice(0, 10) : '',
      gender: employee.gender ?? '',
      maritalStatus: employee.maritalStatus ?? '',
      educationLevel: employee.educationLevel ?? '',
      dependents: employee.dependents !== undefined && employee.dependents !== null ? String(employee.dependents) : '',
      socioeconomicStratum: employee.socioeconomicStratum !== undefined && employee.socioeconomicStratum !== null ? String(employee.socioeconomicStratum) : '',
      housingType: employee.housingType ?? '',
      ethnicGroup: employee.ethnicGroup ?? '',
      disability: employee.disability !== undefined && employee.disability !== null ? String(employee.disability) : '',
      workSchedule: employee.workSchedule ?? '',
      admissionDate: employee.admissionDate ? employee.admissionDate.slice(0, 10) : '',
      workCenter: employee.workCenter ?? '',
    });
  };

  const handleDelete = async (employeeId: string) => {
    setLoading(true);
    setError('');

    try {
      await deleteEmployee(token, employeeId);
      if (editingEmployeeId === employeeId) {
        resetForm();
      }
      await loadEmployees();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible eliminar empleado.');
      setLoading(false);
    }
  };

  // ── Bulk upload handlers ──

  const parseBulkEmployee = (value: unknown): string => {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value).trim();
    return '';
  };

  const handleBulkFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setBulkResult(null);
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!worksheet) {
        setError('El archivo no contiene una hoja válida.');
        setBulkPreview([]);
        return;
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

      const preview = rows.map((row: Record<string, unknown>, index: number) => {
        const data: CreateEmployeePayload = {
          name: parseBulkEmployee(row['nombre']),
          document: parseBulkEmployee(row['documento']),
          position: parseBulkEmployee(row['cargo']),
          area: parseBulkEmployee(row['area']),
          contractType: parseBulkEmployee(row['tipo de contrato']),
          status: parseBulkEmployee(row['estado']),
        };

        const missingRequired = Object.values(data).some((field) => !field);
        if (missingRequired) return { row: index + 2, data, error: 'Todos los campos son obligatorios.' };
        if (!BULK_ALLOWED_STATUS.has(data.status)) return { row: index + 2, data, error: 'El estado debe ser "Activo" o "No activo".' };
        return { row: index + 2, data };
      });

      setBulkPreview(preview);
    } catch {
      setError('No fue posible leer el archivo Excel. Verifica el formato.');
      setBulkPreview([]);
    } finally {
      event.target.value = '';
    }
  };

  const handleBulkUpload = async () => {
    const validEmployees = bulkPreview.filter((item) => !item.error).map((item) => item.data);
    if (!validEmployees.length) { setError('No hay registros válidos para cargar.'); return; }

    setBulkLoading(true);
    setError('');
    try {
      const response = await bulkCreateEmployees(token, { employees: validEmployees });
      setBulkResult(response);
      await loadEmployees();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible realizar la carga masiva.');
    } finally {
      setBulkLoading(false);
    }
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet([{
      nombre: 'Juan Pérez', documento: '123456789', cargo: 'Analista SST',
      area: 'Talento humano', 'tipo de contrato': 'Indefinido', estado: 'Activo',
    }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Empleados');
    XLSX.writeFile(workbook, 'plantilla-empleados.xlsx');
  };

  const updateField = (field: keyof EmployeeFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const profileCompleted = countCompletedProfileFields(form);

  // ── Occupational Exam handlers (3.1.2) ──

  const openExams = useCallback(async (employee: EmployeeModel) => {
    setExamEmployee(employee);
    setEditingExamId(null);
    setExamForm(emptyExamForm);
    setExamsError('');
    setExamsLoading(true);
    try {
      const data = await fetchOccupationalExams(token, { employeeId: employee._id });
      setExams(data);
    } catch (err) {
      setExamsError(err instanceof Error ? err.message : 'No fue posible cargar exámenes.');
    } finally {
      setExamsLoading(false);
    }
  }, [token]);

  const closeExams = () => {
    setExamEmployee(null);
    setExams([]);
    setEditingExamId(null);
    setExamForm(emptyExamForm);
    setExamsError('');
  };

  const updateExamField = (field: keyof ExamFormState, value: string) => {
    setExamForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleExamSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!examEmployee) return;

    // Frontend validation for consistency
    if (examForm.status === 'COMPLETED' && !examForm.examDate) {
      setExamsError('La fecha del examen es requerida cuando el estado es Completado.');
      return;
    }
    if (examForm.followUpRequired === 'true' && !examForm.followUpDate) {
      setExamsError('La fecha de seguimiento es requerida cuando se requiere seguimiento.');
      return;
    }

    setExamFormLoading(true);
    setExamsError('');

    try {
      const payload: CreateOccupationalExamPayload = {
        employeeId: examEmployee._id,
        examType: examForm.examType as ExamType,
        status: examForm.status as ExamStatusType,
      };
      if (examForm.examDate) payload.examDate = examForm.examDate;
      if (examForm.nextDueDate) payload.nextDueDate = examForm.nextDueDate;
      if (examForm.fitnessStatus) payload.fitnessStatus = examForm.fitnessStatus as FitnessStatusType;
      payload.followUpRequired = examForm.followUpRequired === 'true';
      if (examForm.followUpDate) payload.followUpDate = examForm.followUpDate;

      if (editingExamId) {
        await updateOccupationalExam(token, editingExamId, payload);
      } else {
        await createOccupationalExam(token, payload);
      }

      setEditingExamId(null);
      setExamForm(emptyExamForm);
      const data = await fetchOccupationalExams(token, { employeeId: examEmployee._id });
      setExams(data);
    } catch (err) {
      setExamsError(err instanceof Error ? err.message : 'No fue posible guardar examen.');
    } finally {
      setExamFormLoading(false);
    }
  };

  const handleEditExam = (exam: OccupationalExam) => {
    setEditingExamId(exam._id);
    setExamForm({
      examType: exam.examType,
      examDate: exam.examDate ? exam.examDate.slice(0, 10) : '',
      status: exam.status,
      nextDueDate: exam.nextDueDate ? exam.nextDueDate.slice(0, 10) : '',
      fitnessStatus: exam.fitnessStatus ?? '',
      followUpRequired: String(exam.followUpRequired),
      followUpDate: exam.followUpDate ? exam.followUpDate.slice(0, 10) : '',
    });
  };

  const handleDeleteExam = async (examId: string) => {
    if (!examEmployee) return;
    setExamsLoading(true);
    setExamsError('');
    try {
      await deleteOccupationalExam(token, examId);
      const data = await fetchOccupationalExams(token, { employeeId: examEmployee._id });
      setExams(data);
    } catch (err) {
      setExamsError(err instanceof Error ? err.message : 'No fue posible eliminar examen.');
    } finally {
      setExamsLoading(false);
    }
  };

  const cancelExamEdit = () => {
    setEditingExamId(null);
    setExamForm(emptyExamForm);
  };

  return (
    <section className="grid">
      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FORMULARIO EMPLEADO */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Card title={editingEmployeeId ? 'Editar empleado' : 'Crear empleado'}>
        {/* Profile indicator */}
        <div style={{ padding: '.5rem .75rem', marginBottom: '.75rem', background: profileCompleted === 4 ? '#f0fdf4' : '#fffbeb', border: `1px solid ${profileCompleted === 4 ? '#bbf7d0' : '#fde68a'}`, borderRadius: '.375rem', fontSize: '.85rem' }}>
          <strong>Perfil sociodemográfico:</strong>{' '}
          <span style={{ color: profileCompleted === 4 ? '#15803d' : '#92400e' }}>
            {profileCompleted}/4 datos principales completos
          </span>
          {profileCompleted === 4 ? ' ✓' : ''}
        </div>

        {/* Form tabs */}
        <div style={{ display: 'flex', gap: '.25rem', marginBottom: '.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '.5rem' }}>
          {([
            { id: 'laboral' as const, label: '📋 Información laboral' },
            { id: 'sociodemografico' as const, label: '👤 Datos sociodemográficos' },
            { id: 'complementario' as const, label: '🏢 Info laboral complementaria' },
          ]).map((tab) => (
            <button key={tab.id} type="button" onClick={() => setFormTab(tab.id)}
              style={{ padding: '.375rem .75rem', border: '1px solid #e2e8f0', borderRadius: '.375rem', background: formTab === tab.id ? '#2563eb' : '#fff', color: formTab === tab.id ? '#fff' : '#475569', cursor: 'pointer', fontSize: '.8rem', fontWeight: 600, transition: 'all .15s' }}>
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          {/* ── SECTION 1: Información laboral ── */}
          {formTab === 'laboral' && (
            <div className="grid grid-2">
              <label className="field"><span className="label">Nombre *</span><Input value={form.name} onChange={(e) => updateField('name', e.target.value)} required /></label>
              <label className="field"><span className="label">Documento *</span><Input value={form.document} onChange={(e) => updateField('document', e.target.value)} required /></label>
              <label className="field"><span className="label">Cargo *</span><Input value={form.position} onChange={(e) => updateField('position', e.target.value)} required /></label>
              <label className="field"><span className="label">Área *</span><Input value={form.area} onChange={(e) => updateField('area', e.target.value)} required /></label>
              <label className="field"><span className="label">Tipo de contrato *</span><Input value={form.contractType} onChange={(e) => updateField('contractType', e.target.value)} required /></label>
              <label className="field">
                <span className="label">Estado *</span>
                <Select value={form.status} onChange={(e) => updateField('status', e.target.value)} required>
                  <option value="Activo">Activo</option>
                  <option value="No activo">No activo</option>
                </Select>
              </label>
            </div>
          )}

          {/* ── SECTION 2: Datos sociodemográficos ── */}
          {formTab === 'sociodemografico' && (
            <div className="grid grid-2">
              <label className="field">
                <span className="label">Fecha de nacimiento</span>
                <Input type="date" max={TODAY} value={form.birthDate} onChange={(e) => updateField('birthDate', e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Género</span>
                <Select value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>
                  <option value="">Sin registrar</option>
                  {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Estado civil</span>
                <Select value={form.maritalStatus} onChange={(e) => updateField('maritalStatus', e.target.value)}>
                  <option value="">Sin registrar</option>
                  {MARITAL_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Nivel educativo</span>
                <Select value={form.educationLevel} onChange={(e) => updateField('educationLevel', e.target.value)}>
                  <option value="">Sin registrar</option>
                  {EDUCATION_LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Personas a cargo</span>
                <Input type="number" min={0} step={1} value={form.dependents} onChange={(e) => updateField('dependents', e.target.value)} placeholder="0" />
              </label>
              <label className="field">
                <span className="label">Estrato socioeconómico</span>
                <Select value={form.socioeconomicStratum} onChange={(e) => updateField('socioeconomicStratum', e.target.value)}>
                  <option value="">Sin registrar</option>
                  {STRATUM_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Tipo de vivienda</span>
                <Select value={form.housingType} onChange={(e) => updateField('housingType', e.target.value)}>
                  <option value="">Sin registrar</option>
                  {HOUSING_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Grupo étnico</span>
                <Select value={form.ethnicGroup} onChange={(e) => updateField('ethnicGroup', e.target.value)}>
                  <option value="">Sin registrar</option>
                  {ETHNIC_GROUP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Discapacidad</span>
                <Select value={form.disability} onChange={(e) => updateField('disability', e.target.value)}>
                  <option value="">Sin registrar</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </Select>
              </label>
            </div>
          )}

          {/* ── SECTION 3: Información laboral complementaria ── */}
          {formTab === 'complementario' && (
            <div className="grid grid-2">
              <label className="field">
                <span className="label">Jornada laboral</span>
                <Select value={form.workSchedule} onChange={(e) => updateField('workSchedule', e.target.value)}>
                  <option value="">Sin registrar</option>
                  {WORK_SCHEDULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </label>
              <label className="field">
                <span className="label">Fecha de ingreso</span>
                <Input type="date" max={TODAY} value={form.admissionDate} onChange={(e) => updateField('admissionDate', e.target.value)} />
              </label>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="label">Centro de trabajo</span>
                <Input value={form.workCenter} onChange={(e) => updateField('workCenter', e.target.value)} placeholder="Ej: Sede principal, Planta 2" />
              </label>
            </div>
          )}

          <div className="actions">
            <Button type="submit" disabled={loading}>{editingEmployeeId ? 'Guardar cambios' : 'Crear empleado'}</Button>
            {editingEmployeeId ? <Button type="button" variant="secondary" onClick={resetForm}>Cancelar edición</Button> : null}
          </div>
        </form>
      </Card>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* CARGA MASIVA */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Card title="Carga masiva de empleados">
        <div className="actions">
          <Button type="button" variant="secondary" onClick={downloadTemplate}>Descargar plantilla Excel</Button>
          <Button type="button" onClick={handleBulkUpload} disabled={bulkLoading || !bulkPreview.length}>
            {bulkLoading ? 'Cargando...' : 'Enviar cargue'}
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleBulkFile} />
        {bulkPreview.length ? (
          <Table>
            <thead><tr>
              <th className="border border-black p-3">Fila</th><th className="border border-black p-3">Nombre</th><th className="border border-black p-3">Documento</th><th className="border border-black p-3">Cargo</th><th className="border border-black p-3">Área</th><th className="border border-black p-3">Tipo de contrato</th><th className="border border-black p-3">Estado</th><th className="border border-black p-3">Validación</th>
            </tr></thead>
            <tbody>
              {bulkPreview.map((item) => (
                <tr key={`${item.row}-${item.data.document}`}>
                  <td className="border border-black p-3">{item.row}</td>
                  <td className="border border-black p-3">{item.data.name}</td>
                  <td className="border border-black p-3">{item.data.document}</td>
                  <td className="border border-black p-3">{item.data.position}</td>
                  <td className="border border-black p-3">{item.data.area}</td>
                  <td className="border border-black p-3">{item.data.contractType}</td>
                  <td className="border border-black p-3">{item.data.status}</td>
                  <td className="border border-black p-3">{item.error ?? 'Válido'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      {bulkResult ? (
        <Card title="Resultado de carga masiva">
          <p>Insertados: {bulkResult.inserted}</p>
          <p>Fallidos: {bulkResult.failed}</p>
          {bulkResult.errors.length ? (
            <ul>{bulkResult.errors.map((e) => <li key={`${e.row}-${e.message}`}>Fila {e.row}: {e.message}</li>)}</ul>
          ) : null}
        </Card>
      ) : null}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* TABLA EMPLEADOS */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Table>
        <thead>
          <tr>
            <th className="border border-black p-3">Nombre</th>
            <th className="border border-black p-3">Documento</th>
            <th className="border border-black p-3">Cargo</th>
            <th className="border border-black p-3">Área</th>
            <th className="border border-black p-3">Estado</th>
            <th className="border border-black p-3">Perfil</th>
            <th className="border border-black p-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee._id}>
              <td className="border border-black p-3">{employee.name}</td>
              <td className="border border-black p-3">{employee.document}</td>
              <td className="border border-black p-3">{employee.position}</td>
              <td className="border border-black p-3">{employee.area}</td>
              <td className="border border-black p-3">{employee.status}</td>
              <td className="border border-black p-3"><ProfileBadge employee={employee} /></td>
              <td className="border border-black p-3">                  <div className="actions">
                  <Button type="button" variant="secondary" onClick={() => handleEdit(employee)}>Editar</Button>
                  <Button type="button" onClick={() => void openExams(employee)} style={{ fontSize: '.75rem' }}>📋 Exámenes</Button>
                  <Button type="button" variant="danger" onClick={() => handleDelete(employee._id)}>Eliminar</Button>
                </div>
              </td>
            </tr>
          ))}
          {!employees.length ? <tr><td className="border border-black p-3" colSpan={7}>No hay empleados registrados.</td></tr> : null}
        </tbody>
      </Table>

      {error ? <pre className="error">{error}</pre> : null}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* PANEL DE EXÁMENES MÉDICOS OCUPACIONALES (3.1.2) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {examEmployee && (
        <Card title={`📋 Exámenes médicos — ${examEmployee.name}`}>
          <div style={{ marginBottom: '.75rem' }}>
            <Button type="button" variant="secondary" onClick={closeExams}>Cerrar</Button>
          </div>

          {/* Formulario de examen */}
          <div style={{ marginBottom: '1rem', padding: '.75rem', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 .5rem', fontSize: '.9rem', fontWeight: 600, color: '#1e293b' }}>
              {editingExamId ? 'Editar examen' : 'Nuevo examen'}
            </h4>
            <form onSubmit={(e) => void handleExamSubmit(e)} className="form-grid">
              <div className="grid grid-2">
                <label className="field">
                  <span className="label">Tipo de examen *</span>
                  <Select value={examForm.examType} onChange={(e) => updateExamField('examType', e.target.value)} required>
                    {EXAM_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </label>
                <label className="field">
                  <span className="label">Estado</span>
                  <Select value={examForm.status} onChange={(e) => updateExamField('status', e.target.value)}>
                    {EXAM_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </label>
                <label className="field">
                  <span className="label">Fecha del examen</span>
                  <Input type="date" max={TODAY} value={examForm.examDate} onChange={(e) => updateExamField('examDate', e.target.value)} />
                </label>
                <label className="field">
                  <span className="label">Próxima fecha</span>
                  <Input type="date" value={examForm.nextDueDate} onChange={(e) => updateExamField('nextDueDate', e.target.value)} />
                </label>
                <label className="field">
                  <span className="label">Aptitud</span>
                  <Select value={examForm.fitnessStatus} onChange={(e) => updateExamField('fitnessStatus', e.target.value)}>
                    <option value="">Sin reportar</option>
                    {FITNESS_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </label>
                <label className="field">
                  <span className="label">Requiere seguimiento</span>
                  <Select value={examForm.followUpRequired} onChange={(e) => updateExamField('followUpRequired', e.target.value)}>
                    <option value="false">No</option>
                    <option value="true">Sí</option>
                  </Select>
                </label>
                {examForm.followUpRequired === 'true' && (
                  <label className="field">
                    <span className="label">Fecha de seguimiento *</span>
                    <Input type="date" value={examForm.followUpDate} onChange={(e) => updateExamField('followUpDate', e.target.value)} required />
                  </label>
                )}
              </div>
              <div className="actions">
                <Button type="submit" disabled={examFormLoading}>{editingExamId ? 'Actualizar' : 'Crear examen'}</Button>
                {editingExamId ? <Button type="button" variant="secondary" onClick={cancelExamEdit}>Cancelar</Button> : null}
              </div>
            </form>
          </div>

          {/* Error */}
          {examsError && <pre className="error" style={{ marginBottom: '.75rem' }}>{examsError}</pre>}

          {/* Listado de exámenes */}
          {examsLoading ? (
            <p style={{ color: '#64748b', fontSize: '.9rem' }}>Cargando exámenes…</p>
          ) : exams.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
              <p style={{ margin: 0, fontSize: '.9rem' }}>No hay exámenes médicos registrados</p>
              <p style={{ margin: '.25rem 0 0', fontSize: '.8rem' }}>Crea el primer examen usando el formulario de arriba.</p>
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th className="border border-black p-3">Tipo</th>
                  <th className="border border-black p-3">Fecha</th>
                  <th className="border border-black p-3">Estado</th>
                  <th className="border border-black p-3">Próxima</th>
                  <th className="border border-black p-3">Aptitud</th>
                  <th className="border border-black p-3">Seguimiento</th>
                  <th className="border border-black p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => {
                  const typeBadge = EXAM_TYPE_BADGE[exam.examType] ?? EXAM_TYPE_BADGE.OTHER;
                  const statusBadge = EXAM_STATUS_BADGE[exam.status] ?? EXAM_STATUS_BADGE.SCHEDULED;
                  const fitnessBadge = exam.fitnessStatus ? (FITNESS_BADGE[exam.fitnessStatus] ?? null) : null;
                  return (
                    <tr key={exam._id}>
                      <td className="border border-black p-3">
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.75rem', fontWeight: 600, color: typeBadge.color, backgroundColor: typeBadge.bg }}>
                          {EXAM_TYPE_OPTIONS.find((o) => o.value === exam.examType)?.label ?? exam.examType}
                        </span>
                      </td>
                      <td className="border border-black p-3" style={{ fontSize: '.85rem' }}>
                        {exam.examDate ? new Date(exam.examDate).toLocaleDateString('es-CO') : '—'}
                      </td>
                      <td className="border border-black p-3">
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.75rem', fontWeight: 600, color: statusBadge.color, backgroundColor: statusBadge.bg }}>
                          {EXAM_STATUS_OPTIONS.find((o) => o.value === exam.status)?.label ?? exam.status}
                        </span>
                      </td>
                      <td className="border border-black p-3" style={{ fontSize: '.85rem' }}>
                        {exam.nextDueDate ? new Date(exam.nextDueDate).toLocaleDateString('es-CO') : '—'}
                      </td>
                      <td className="border border-black p-3">
                        {fitnessBadge ? (
                          <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.75rem', fontWeight: 600, color: fitnessBadge.color, backgroundColor: fitnessBadge.bg }}>
                            {FITNESS_STATUS_OPTIONS.find((o) => o.value === exam.fitnessStatus)?.label ?? exam.fitnessStatus}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="border border-black p-3" style={{ fontSize: '.85rem' }}>
                        {exam.followUpRequired ? (
                          <span style={{ color: '#d97706' }}>
                            {exam.followUpDate ? `📅 ${new Date(exam.followUpDate).toLocaleDateString('es-CO')}` : '⚠ Pendiente'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="border border-black p-3">
                        <div className="actions">
                          <Button type="button" variant="secondary" onClick={() => handleEditExam(exam)} style={{ fontSize: '.75rem' }}>Editar</Button>
                          <Button type="button" variant="danger" onClick={() => { if (window.confirm('¿Deseas eliminar este examen médico?')) void handleDeleteExam(exam._id); }} style={{ fontSize: '.75rem' }}>Eliminar</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </section>
  );
}
