import type { ReactNode } from 'react';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EmployeeModel,
  ComplianceCredentialAlertModel,
  ComplianceCredentialCourseType,
  ComplianceCredentialDetailModel,
  ComplianceCredentialDocumentModel,
  ComplianceCredentialHistoryModel,
  ComplianceCredentialModel,
  ComplianceCredentialResponsibleModel,
  ComplianceResponsibleType,
  ResponsableSstAdvancedModel,
  ResponsableSstComplianceStatus,
  ResponsableSstDocumentType,
  addComplianceResponsible,
  attachComplianceCredentialDocument,
  createComplianceCredential,
  deactivateComplianceResponsible,
  fetchComplianceCredential,
  fetchComplianceCredentials,
  fetchEmployees,
  listComplianceResponsibles,
  removeComplianceResponsible,
  updateComplianceCredential,
  updateComplianceCredentialOcrDate,
  updateComplianceResponsible,
  fetchResponsableSstAdvanced,
  fetchResponsibilitiesAdvanced,
  fetchResourceAssignmentAdvanced,
  fetchArlAffiliationsAdvanced,
  fetchSpecialPensionAdvanced,
  updateResponsableSstAdvanced,
  updateResponsibilitiesAdvanced,
  updateResourceAssignmentAdvanced,
  updateArlAffiliationsAdvanced,
  updateSpecialPensionAdvanced,
  uploadResponsableSstDocument,
  fetchCommitteeCurrent,
  addCommitteeMember,
  fetchCommitteeResults,
  fetchTrainingManagementAdvanced,
  updateTrainingManagementAdvanced,
  approveTrainingManagementAdvanced,
  SstPolicyAdvancedModel,
  PolicyMasterListRowModel,
  fetchSstPolicyAdvanced,
  generateSstPolicyAdvanced,
  updateSstPolicyAdvanced,
  createSstPolicyVersionAdvanced,
  archiveSstPolicyVersionAdvanced,
  updateSstPolicySignatureAdvanced,
  approveSstPolicyAdvanced,
  assignSstPolicySocializationAdvanced,
  updateSstPolicySocializationAdvanced,
  fetchSstPolicyMasterListAdvanced,
  SstObjectivesAdvancedModel,
  SstObjectiveItemModel,
  SstObjectiveActivityModel,
  SstObjectiveTaskModel,
  fetchSstObjectivesAdvanced,
  updateSstObjectivesAdvanced,
  updateSstObjectiveActivitiesAdvanced,
  fetchAnnualWorkPlanAdvanced,
  updateAnnualWorkPlanAdvanced,
  InitialEvaluationModel,
  InitialEvaluationStandardModel,
  InitialEvaluationFindingModel,
  InitialEvaluationActionModel,
  fetchInitialEvaluationAdvanced,
  runInitialEvaluationAutoDiagnostic,
  updateInitialEvaluationStandard,
  upsertInitialEvaluationFinding,
  upsertInitialEvaluationAction,
  generateInitialEvaluationActions,
  submitInitialEvaluationApproval,
  signInitialEvaluationApproval,
} from '../../api';
import { EvaluationItem } from '../../components/EvaluationItem';
import { ComplianceProgress } from '../../components/ComplianceProgress';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Sheet } from '../../components/ui/Sheet';
import { useDocumentsEvaluation } from './evaluationState';

const financialResourcesItems = [
  {
    code: '1.1.1',
    title: 'Responsable del SG-SST',
    weight: 0.5,
    modeReview:
      'Solicitar el documento en el que consta la asignación del responsable del Sistema de Gestión de Seguridad y Salud en el Trabajo, verificando que se encuentren definidas sus responsabilidades.\nAdicionalmente, validar la hoja de vida con los respectivos soportes académicos y experiencia relacionada con Seguridad y Salud en el Trabajo.',
    criteria:
      'Asignar una persona que cumpla con el siguiente perfil:\n- Profesional en Seguridad y Salud en el Trabajo, o profesional con posgrado en SST\n- Licencia vigente en Seguridad y Salud en el Trabajo\n- Certificado del curso de capacitación virtual de 50 horas en SG-SST',
  },
  {
    code: '1.1.2',
    title: 'Responsabilidades en SG-SST',
    weight: 0.5,
    modeReview:
      'Revisar la matriz o acto administrativo donde se asignan las responsabilidades en SG-SST para todos los niveles de la organización.\nConfirmar que las funciones estén alineadas con el tamaño, la actividad económica y la estructura organizacional de la empresa.',
    criteria:
      'La organización debe evidenciar por escrito la asignación de responsabilidades en SG-SST para dirección, mandos medios, trabajadores y contratistas, con divulgación y aceptación documentada.',
  },
  {
    code: '1.1.3',
    title: 'Asignación de recursos',
    weight: 0.5,
    modeReview:
      'Solicitar el presupuesto anual o plan de inversión del SG-SST y verificar la disponibilidad de recursos financieros, técnicos y humanos.\nCorroborar que el presupuesto incluya actividades de prevención, capacitación, vigilancia epidemiológica y mejora continua.',
    criteria:
      'La empresa debe demostrar asignación formal y suficiente de recursos para implementar, mantener y mejorar el SG-SST, con trazabilidad de ejecución y seguimiento periódico.',
  },
  {
    code: '1.1.4',
    title: 'Afiliación a riesgos laborales',
    weight: 0.5,
    modeReview:
      'Validar certificados de afiliación a la ARL y confirmar que todo el personal dependiente, independiente y en misión esté cubierto conforme al nivel de riesgo.\nVerificar consistencia entre nómina, contratos y base de afiliación reportada.',
    criteria:
      'Todos los trabajadores vinculados a la organización deben encontrarse afiliados al Sistema General de Riesgos Laborales de manera oportuna y conforme a la normatividad vigente.',
  },
  {
    code: '1.1.5',
    title: 'Trabajadores alto riesgo',
    weight: 0.5,
    modeReview:
      'Examinar el inventario de cargos y tareas críticas para identificar trabajadores expuestos a peligros de alto riesgo.\nVerificar soportes de controles implementados, exámenes ocupacionales y seguimiento a condiciones de salud asociadas al riesgo.',
    criteria:
      'La empresa debe contar con identificación documentada de trabajadores expuestos a alto riesgo y demostrar medidas de intervención, control y vigilancia en salud ocupacional.',
  },
  {
    code: '1.1.6',
    title: 'Conformación COPASST',
    weight: 0.5,
    modeReview:
      'Solicitar actas de convocatoria, elección y conformación del COPASST, verificando representación paritaria y período de vigencia.\nConfirmar evidencias de instalación formal, cronograma de reuniones y seguimiento a compromisos.',
    criteria:
      'Debe existir COPASST conformado de acuerdo con la normatividad aplicable, con integrantes elegidos, actas firmadas y funcionamiento documentado.',
  },
  {
    code: '1.1.7',
    title: 'Capacitación COPASST',
    weight: 0.5,
    modeReview:
      'Revisar certificados y registros de asistencia de las capacitaciones impartidas a integrantes del COPASST.\nValidar que los contenidos aborden identificación de peligros, investigación de incidentes, inspecciones y promoción de la cultura preventiva.',
    criteria:
      'Los miembros del COPASST deben recibir formación pertinente y periódica para cumplir sus funciones, con evidencia de evaluación de la efectividad de la capacitación.',
  },
  {
    code: '1.1.8',
    title: 'Comité de Convivencia',
    weight: 0.5,
    modeReview:
      'Verificar acta de conformación del Comité de Convivencia Laboral, reglamento interno y mecanismos de recepción y gestión de casos.\nCorroborar registro de reuniones, planes de acción y actividades de prevención del acoso laboral.',
    criteria:
      'El Comité de Convivencia Laboral debe estar conformado y operando conforme a la normativa, con trazabilidad de actuaciones y garantías de confidencialidad.',
  },
];

const trainingItems = [
  {
    code: '1.2.1',
    title: 'Programa Capacitación PyP',
    weight: 2,
    modeReview:
      'Solicitar el programa anual de capacitación en promoción y prevención (PyP) y verificar su aprobación, cronograma, responsables y cobertura por procesos.\nComprobar evidencias de ejecución (listas de asistencia, evaluaciones, materiales y actas) y seguimiento a indicadores de cumplimiento.',
    criteria:
      'La organización cuenta con un programa de capacitación PyP estructurado, actualizado y ejecutado, orientado al control de riesgos prioritarios y al fortalecimiento de la cultura de prevención.',
  },
  {
    code: '1.2.2',
    title: 'Inducción y Reinducción SG-SST',
    weight: 2,
    modeReview:
      'Revisar el procedimiento de inducción y reinducción en SG-SST para trabajadores directos, contratistas y personal temporal.\nValidar registros de asistencia, evaluación de aprendizaje y periodicidad de reinducciones según cambios de proceso, cargo o normatividad.',
    criteria:
      'Se evidencia que todo el personal recibe inducción inicial y reinducción periódica en SG-SST con contenidos mínimos obligatorios, evaluación de comprensión y trazabilidad documental.',
  },
  {
    code: '1.2.3',
    title: 'Curso 50 horas SG-SST',
    weight: 2,
    modeReview:
      'Verificar certificados vigentes del curso de 50 horas en SG-SST del responsable del sistema y de los perfiles que la organización haya definido como críticos para su implementación.\nCorroborar la autenticidad de los soportes y la actualización cuando aplique.',
    criteria:
      'La empresa demuestra que los roles obligados cuentan con certificación del curso virtual de 50 horas en SG-SST, conforme a los requisitos normativos y a las responsabilidades asignadas.',
  },
];

const integralManagementItems = [
  {
    code: '2.1.1',
    title: 'Política SST',
    weight: 1,
    modeReview:
      'Solicitar la política de SST firmada por la alta dirección y verificar su divulgación, actualización y coherencia con los peligros y riesgos priorizados.',
    criteria:
      'La organización cuenta con política de SST vigente, aprobada, comunicada a todos los niveles y alineada con los objetivos del SG-SST.',
  },
  {
    code: '2.2.1',
    title: 'Objetivos SST',
    weight: 1,
    modeReview:
      'Revisar los objetivos de SST y validar que sean medibles, con metas, responsables, recursos e indicadores de seguimiento.',
    criteria:
      'Existen objetivos de SST documentados, medibles y monitoreados periódicamente para asegurar su cumplimiento.',
  },
  {
    code: '2.3.1',
    title: 'Evaluación inicial',
    weight: 1,
    modeReview:
      'Verificar el diagnóstico inicial del SG-SST, su metodología, alcance y plan de intervención derivado de los hallazgos.',
    criteria:
      'La empresa evidencia evaluación inicial del SG-SST con resultados documentados y plan de cierre de brechas.',
  },
  {
    code: '2.4.1',
    title: 'Plan anual de trabajo',
    weight: 2,
    modeReview:
      'Solicitar el plan anual de trabajo y validar actividades, cronograma, responsables, presupuesto e indicadores de ejecución.',
    criteria:
      'La organización cuenta con plan anual de trabajo del SG-SST aprobado, ejecutado y con seguimiento documentado.',
  },
  {
    code: '2.5.1',
    title: 'Conservación documental',
    weight: 2,
    modeReview:
      'Revisar el procedimiento de gestión documental del SG-SST, tiempos de retención, trazabilidad y controles de acceso.',
    criteria:
      'Se garantiza la conservación y disponibilidad de los documentos y registros del SG-SST conforme a la normatividad.',
  },
  {
    code: '2.6.1',
    title: 'Rendición de cuentas',
    weight: 1,
    modeReview:
      'Validar evidencias de rendición de cuentas sobre resultados del SG-SST a trabajadores y partes interesadas internas.',
    criteria:
      'La empresa realiza rendición de cuentas periódica del SG-SST con soportes de comunicación y compromisos de mejora.',
  },
  {
    code: '2.7.1',
    title: 'Matriz legal',
    weight: 2,
    modeReview:
      'Verificar matriz legal actualizada con requisitos aplicables, estado de cumplimiento y plan de acción frente a brechas.',
    criteria:
      'Existe matriz legal vigente del SG-SST, con actualización periódica y evaluación del cumplimiento normativo.',
  },
  {
    code: '2.8.1',
    title: 'Comunicación',
    weight: 1,
    modeReview:
      'Revisar mecanismos de comunicación interna y externa del SG-SST, incluyendo medios, frecuencia y registros de difusión.',
    criteria:
      'La organización implementa estrategias de comunicación del SG-SST y conserva evidencias de socialización efectiva.',
  },
  {
    code: '2.9.1',
    title: 'Adquisiciones',
    weight: 1,
    modeReview:
      'Validar criterios de SST incluidos en compras de bienes y servicios, así como su aplicación en procesos de selección.',
    criteria:
      'Los procesos de adquisición integran criterios de SST y cuentan con registros de evaluación de proveedores.',
  },
  {
    code: '2.10.1',
    title: 'Contratación',
    weight: 2,
    modeReview:
      'Revisar requisitos de SST establecidos para contratistas y subcontratistas, incluyendo inducción, control y seguimiento.',
    criteria:
      'La contratación de terceros incorpora lineamientos de SST y evidencia control del cumplimiento durante la ejecución.',
  },
  {
    code: '2.11.1',
    title: 'Gestión del cambio',
    weight: 1,
    modeReview:
      'Solicitar procedimiento de gestión del cambio y verificar evaluación de impactos en SST ante cambios de procesos o estructura.',
    criteria:
      'La empresa aplica gestión del cambio en SST con análisis de riesgos y acciones de control antes de implementar cambios.',
  },
];

type EvaluationEntry = {
  code: string;
  title: string;
  weight: number;
  modeReview: string;
  criteria: string;
};

type AdvancedManagementForm = {
  fullName: string;
  documentNumber: string;
  position: string;
  profession: string;
  sstProfessionalType: string;
  sstLicenseNumber: string;
  licenseExpiresAt: string;
  course50HoursDate: string;
  course50HoursDetectedDate: string;
  course20HoursDate: string;
};

type PendingDocuments = Partial<Record<ResponsableSstDocumentType, File>>;

const initialAdvancedManagementForm: AdvancedManagementForm = {
  fullName: '',
  documentNumber: '',
  position: '',
  profession: '',
  sstProfessionalType: '',
  sstLicenseNumber: '',
  licenseExpiresAt: '',
  course50HoursDate: '',
  course50HoursDetectedDate: '',
  course20HoursDate: '',
};

const documentLabels: Record<ResponsableSstDocumentType, string> = {
  DIPLOMA: 'Diploma',
  FIFTY_HOUR_CERTIFICATE: 'Certificado curso 50 horas',
  TWENTY_HOUR_UPDATE_CERTIFICATE: 'Certificado actualización 20 horas',
};

function toDateInputValue(value?: string | Date) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function isOlderThanThreeYears(dateValue: string) {
  if (!dateValue) return false;
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  const expiration = new Date(date);
  expiration.setUTCFullYear(expiration.getUTCFullYear() + 3);
  return expiration < new Date(new Date().toISOString().slice(0, 10));
}

function detectDateFromFileName(fileName: string) {
  const normalized = fileName.replace(/_/g, '-');
  const iso = normalized.match(/(20\d{2}|19\d{2})[-./](0?[1-9]|1[0-2])[-./](0?[1-9]|[12]\d|3[01])/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const latam = normalized.match(/(0?[1-9]|[12]\d|3[01])[-./](0?[1-9]|1[0-2])[-./](20\d{2}|19\d{2})/);
  if (latam) return `${latam[3]}-${latam[2].padStart(2, '0')}-${latam[1].padStart(2, '0')}`;
  return '';
}

function complianceBadge(status?: ResponsableSstComplianceStatus) {
  if (status === 'COMPLIES') return { label: '✅ Cumple', className: 'advanced-management__badge advanced-management__badge--success' };
  if (status === 'NON_COMPLIANT') return { label: '❌ No cumple', className: 'advanced-management__badge advanced-management__badge--danger' };
  return { label: '⚠ Pendiente', className: 'advanced-management__badge advanced-management__badge--warning' };
}

const responsibleTypes: ComplianceResponsibleType[] = ['Responsable SG-SST', 'Coordinador SST', 'Líder SST', 'Profesional SST', 'Tecnólogo SST'];
const courseTypes: ComplianceCredentialCourseType[] = ['COURSE_50_HOURS', 'COURSE_20_HOURS'];

type CourseFormState = {
  responsibleUserId: string;
  trainingEntity: string;
  courseType: ComplianceCredentialCourseType;
  certificateNumber: string;
  courseDate: string;
  expirationDate: string;
  comments: string;
};

const emptyCourseForm: CourseFormState = {
  responsibleUserId: '',
  trainingEntity: '',
  courseType: 'COURSE_50_HOURS',
  certificateNumber: '',
  courseDate: '',
  expirationDate: '',
  comments: '',
};

function statusBadgeClass(status?: string) {
  if (status === 'Vigente') return 'advanced-management__badge advanced-management__badge--success';
  if (status === 'Vencido') return 'advanced-management__badge advanced-management__badge--danger';
  return 'advanced-management__badge advanced-management__badge--warning';
}

function employeeLabel(employee?: EmployeeModel) {
  return employee ? `${employee.name} · ${employee.document}` : 'Sin usuario asignado';
}

function resolveResponsibleEmployee(responsible: ComplianceCredentialResponsibleModel, employeeById: Map<string, EmployeeModel>) {
  if (typeof responsible.employeeId === 'object') return responsible.employeeId;
  return employeeById.get(String(responsible.employeeId));
}

function resolveResponsibleEmployeeId(responsible: ComplianceCredentialResponsibleModel) {
  return typeof responsible.employeeId === 'object' ? responsible.employeeId._id : String(responsible.employeeId);
}

function AdvancedCourse50HoursPanel({ token, readOnly, onComplianceChange, onDirtyChange, saveRequest, discardRequest, onSaved }: { token: string; readOnly?: boolean; onComplianceChange: (status: ResponsableSstComplianceStatus) => void; onDirtyChange: (dirty: boolean) => void; saveRequest: number; discardRequest: number; onSaved: () => void }) {
  const [tab, setTab] = useState('Responsables SST');
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [responsibles, setResponsibles] = useState<ComplianceCredentialResponsibleModel[]>([]);
  const [credentials, setCredentials] = useState<ComplianceCredentialModel[]>([]);
  const [detail, setDetail] = useState<ComplianceCredentialDetailModel | null>(null);
  const [form, setForm] = useState<CourseFormState>(emptyCourseForm);
  const [twentyForm, setTwentyForm] = useState<CourseFormState>({ ...emptyCourseForm, courseType: 'COURSE_20_HOURS' });
  const [selectedResponsibleRecordId, setSelectedResponsibleRecordId] = useState('');
  const [selectedResponsibleId, setSelectedResponsibleId] = useState('');
  const [selectedResponsibleType, setSelectedResponsibleType] = useState<ComplianceResponsibleType>('Responsable SG-SST');
  const [selectedComments, setSelectedComments] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pending20Files, setPending20Files] = useState<File[]>([]);
  const [manualOcrDate, setManualOcrDate] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee._id, employee])), [employees]);
  const fiftyCredential = useMemo(() => credentials.find((credential) => credential.courseType === 'COURSE_50_HOURS') ?? null, [credentials]);
  const twentyCredential = useMemo(() => credentials.find((credential) => credential.courseType === 'COURSE_20_HOURS') ?? null, [credentials]);
  const compliance = fiftyCredential?.phvaComplianceStatus ?? 'PENDING';
  const complianceUi = complianceBadge(compliance);
  const requires20Hour = Boolean(fiftyCredential?.requires20HourCourse || detail?.credential.requires20HourCourse);
  const documents = detail?.documents ?? [];
  const ocrData = detail?.ocrData ?? [];
  const alerts = detail?.alerts ?? [];
  const history = detail?.history ?? [];
  const latestOcr = ocrData[0];
  const detectedDate = toDateInputValue(latestOcr?.extractedCourseDate ?? latestOcr?.originalOCRDate);
  const modifiedDate = toDateInputValue(latestOcr?.modifiedDate);
  const ocrManuallyChanged = Boolean(latestOcr?.hasManualDateModification || (manualOcrDate && detectedDate && manualOcrDate !== detectedDate));

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const markDirty = () => {
    setDirty(true);
    setError('');
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [employeesResult, responsiblesResult, credentialsResult] = await Promise.all([
        fetchEmployees(token),
        listComplianceResponsibles(token),
        fetchComplianceCredentials(token),
      ]);
      const fifty = credentialsResult.find((credential) => credential.courseType === 'COURSE_50_HOURS') ?? null;
      setEmployees(employeesResult);
      setResponsibles(responsiblesResult);
      setCredentials(credentialsResult);
      if (fifty) {
        const fetchedDetail = await fetchComplianceCredential(token, fifty._id);
        setDetail(fetchedDetail);
        setManualOcrDate(toDateInputValue(fetchedDetail.ocrData[0]?.modifiedDate ?? fetchedDetail.ocrData[0]?.extractedCourseDate));
        setForm({
          responsibleUserId: fifty.responsibleUserId ?? '',
          trainingEntity: fifty.trainingEntity ?? '',
          courseType: 'COURSE_50_HOURS',
          certificateNumber: fifty.certificateNumber ?? '',
          courseDate: toDateInputValue(fifty.courseDate),
          expirationDate: toDateInputValue(fifty.expirationDate),
          comments: fifty.comments ?? '',
        });
        onComplianceChange(fifty.phvaComplianceStatus);
      }
      const twenty = credentialsResult.find((credential) => credential.courseType === 'COURSE_20_HOURS') ?? null;
      if (twenty) {
        setTwentyForm({
          responsibleUserId: twenty.responsibleUserId ?? '',
          trainingEntity: twenty.trainingEntity ?? '',
          courseType: 'COURSE_20_HOURS',
          certificateNumber: twenty.certificateNumber ?? '',
          courseDate: toDateInputValue(twenty.courseDate),
          expirationDate: toDateInputValue(twenty.expirationDate),
          comments: twenty.comments ?? '',
        });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la gestión avanzada del curso.');
    } finally {
      setLoading(false);
    }
  }, [onComplianceChange, token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (saveRequest > 0) void saveAll(); }, [saveRequest]);
  useEffect(() => { if (discardRequest > 0) { setDirty(false); setPendingFiles([]); setPending20Files([]); void load(); } }, [discardRequest, load]);

  const saveCredential = async (current: ComplianceCredentialModel | null, payload: CourseFormState, files: File[], relatedFiftyHourCredentialId?: string) => {
    const cleaned = {
      responsibleUserId: payload.responsibleUserId || undefined,
      courseType: payload.courseType,
      trainingEntity: payload.trainingEntity,
      certificateNumber: payload.certificateNumber,
      courseDate: payload.courseDate || undefined,
      expirationDate: payload.expirationDate || undefined,
      comments: payload.comments,
      relatedFiftyHourCredentialId,
    };
    const saved = current ? await updateComplianceCredential(token, current._id, cleaned) : await createComplianceCredential(token, cleaned);
    for (const file of files) {
      await attachComplianceCredentialDocument(token, {
        credentialId: saved._id,
        fileName: file.name,
        fileUrl: URL.createObjectURL(file),
        mimeType: file.type || 'application/octet-stream',
        ocrCourseDate: detectDateFromFileName(file.name) || undefined,
        rawOcrText: `Carga UI avanzada: ${file.name}`,
      });
    }
    return saved;
  };

  const saveAll = async () => {
    setLoading(true);
    setError('');
    try {
      const savedFifty = await saveCredential(fiftyCredential, form, pendingFiles);
      if (latestOcr && manualOcrDate && manualOcrDate !== detectedDate) await updateComplianceCredentialOcrDate(token, { ocrDataId: latestOcr._id, modifiedDate: manualOcrDate });
      if (requires20Hour || pending20Files.length || twentyForm.courseDate || twentyForm.trainingEntity) await saveCredential(twentyCredential, twentyForm, pending20Files, savedFifty._id);
      setDirty(false);
      setPendingFiles([]);
      setPending20Files([]);
      notify('Cambios guardados y validados con backend.');
      onSaved();
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la gestión avanzada del curso.');
    } finally {
      setLoading(false);
    }
  };

  const addResponsible = async () => {
    if (!selectedResponsibleId) { setError('Selecciona un usuario para agregar responsable.'); return; }
    setLoading(true);
    try {
      if (selectedResponsibleRecordId) {
        await updateComplianceResponsible(token, selectedResponsibleRecordId, { responsibleType: selectedResponsibleType, comments: selectedComments });
        notify('Responsable actualizado.');
      } else {
        await addComplianceResponsible(token, { employeeId: selectedResponsibleId, responsibleType: selectedResponsibleType, comments: selectedComments });
        notify('Responsable agregado.');
      }
      setSelectedResponsibleRecordId('');
      setSelectedComments('');
      await load();
    } catch (addError) { setError(addError instanceof Error ? addError.message : 'No se pudo guardar responsable.'); }
    finally { setLoading(false); }
  };

  const changeForm = (field: keyof CourseFormState, value: string, twenty = false) => {
    if (twenty) setTwentyForm((current) => ({ ...current, [field]: value }));
    else setForm((current) => ({ ...current, [field]: value }));
    markDirty();
  };

  const CourseFields = ({ twenty = false }: { twenty?: boolean }) => {
    const state = twenty ? twentyForm : form;
    return <div className="form-grid"><div className="grid grid-2"><label className="field"><span className="label">Responsible user</span><select className="input" disabled={readOnly} value={state.responsibleUserId} onChange={(event) => changeForm('responsibleUserId', event.target.value, twenty)}><option value="">Seleccionar usuario</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name} · {employee.position}</option>)}</select></label><label className="field"><span className="label">Training entity</span><input className="input" disabled={readOnly} value={state.trainingEntity} onChange={(event) => changeForm('trainingEntity', event.target.value, twenty)} /></label></div>{!twenty ? <div className="grid grid-2"><label className="field"><span className="label">Course type</span><select className="input" disabled={readOnly} value={state.courseType} onChange={(event) => changeForm('courseType', event.target.value, twenty)}>{courseTypes.map((type) => <option key={type} value={type}>{type === 'COURSE_50_HOURS' ? 'Curso 50 horas' : 'Curso 20 horas'}</option>)}</select></label><label className="field"><span className="label">Certificate number</span><input className="input" disabled={readOnly} value={state.certificateNumber} onChange={(event) => changeForm('certificateNumber', event.target.value, twenty)} /></label></div> : null}<div className="grid grid-2"><label className="field"><span className="label">Course date</span><input type="date" className="input" disabled={readOnly} value={state.courseDate} onChange={(event) => changeForm('courseDate', event.target.value, twenty)} /></label><label className="field"><span className="label">Expiration date</span><input type="date" className="input" disabled={readOnly} value={state.expirationDate} onChange={(event) => changeForm('expirationDate', event.target.value, twenty)} /></label></div><label className="field"><span className="label">Comments</span><textarea className="input" disabled={readOnly} value={state.comments} onChange={(event) => changeForm('comments', event.target.value, twenty)} /></label></div>;
  };

  const renderDocuments = (courseDocuments: ComplianceCredentialDocumentModel[]) => <div className="advanced-doc-grid">{courseDocuments.length ? courseDocuments.map((document) => <article key={document._id} className="advanced-doc-card"><div><strong>{document.fileName}</strong><p className="muted">Versión {new Date(document.createdAt ?? '').toLocaleString()} · {document.mimeType || 'archivo'}</p></div><div className="actions"><a className="btn btn-secondary" href={document.fileUrl} target="_blank" rel="noreferrer">Preview</a><a className="btn btn-ghost" href={document.fileUrl} download={document.fileName}>Download</a></div></article>) : <p className="empty-state">No hay documentos cargados todavía.</p>}</div>;

  return <div className="advanced-management advanced-management--50h">
    <section className="advanced-management__hero"><div><p className="muted">Módulo 1.2.3</p><h3>Curso de 50 horas SG-SST</h3></div><span className={complianceUi.className}>{complianceUi.label}</span></section>
    {toast ? <div className="toast-alert advanced-management__toast"><strong>Notificación</strong><p>{toast}</p></div> : null}
    {error ? <p className="error">{error}</p> : null}
    {loading ? <p className="muted">Sincronizando con backend...</p> : null}
    <div className="advanced-tabs" role="tablist">{['Responsables SST', 'Curso 50 Horas', 'Curso 20 Horas', 'Documentos', 'Alertas', 'Historial'].map((name) => <Button key={name} type="button" variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>{name}</Button>)}</div>

    {tab === 'Responsables SST' ? <section className="advanced-management__section"><h3>Responsables SST</h3><div className="responsive-table"><table className="table"><thead><tr><th>Usuario</th><th>Cargo</th><th>Área</th><th>Tipo responsable</th><th>Estado</th><th>Curso 50h</th><th>Vigencia</th><th>Acciones</th></tr></thead><tbody>{responsibles.map((responsible) => { const employee = resolveResponsibleEmployee(responsible, employeeById); return <tr key={responsible._id}><td>{employeeLabel(employee)}</td><td>{employee?.position ?? '—'}</td><td>{employee?.area ?? '—'}</td><td><select className="input" disabled={readOnly} value={responsible.responsibleType} onChange={async (event) => { await updateComplianceResponsible(token, responsible._id, { responsibleType: event.target.value as ComplianceResponsibleType }); notify('Responsable actualizado.'); await load(); }}>{responsibleTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></td><td>{responsible.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}</td><td><span className={statusBadgeClass(fiftyCredential?.status)}>{fiftyCredential?.status ?? 'Pendiente'}</span></td><td>{toDateInputValue(fiftyCredential?.expirationDate) || '—'}</td><td><div className="actions"><Button type="button" variant="secondary" disabled={readOnly} onClick={() => { setSelectedResponsibleRecordId(responsible._id); setSelectedResponsibleId(resolveResponsibleEmployeeId(responsible)); setSelectedResponsibleType(responsible.responsibleType); setSelectedComments(responsible.comments ?? ''); }}>Editar</Button><Button type="button" variant="ghost" disabled={readOnly || responsible.status !== 'ACTIVE'} onClick={async () => { await deactivateComplianceResponsible(token, responsible._id); notify('Responsable desactivado.'); await load(); }}>Desactivar</Button><Button type="button" variant="danger" disabled={readOnly} onClick={async () => { await removeComplianceResponsible(token, responsible._id); notify('Responsable eliminado.'); await load(); }}>Remover</Button></div></td></tr>; })}</tbody></table></div>{!responsibles.length ? <p className="empty-state">No hay responsables SST. Agrega múltiples responsables para cubrir operación, suplencia y validación.</p> : null}<div className="grid grid-3"><label className="field"><span className="label">Usuario</span><select className="input" disabled={readOnly} value={selectedResponsibleId} onChange={(event) => setSelectedResponsibleId(event.target.value)}><option value="">Seleccionar empleado</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name} · {employee.area}</option>)}</select></label><label className="field"><span className="label">Tipo responsable</span><select className="input" disabled={readOnly} value={selectedResponsibleType} onChange={(event) => setSelectedResponsibleType(event.target.value as ComplianceResponsibleType)}>{responsibleTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label className="field"><span className="label">Comentarios</span><input className="input" disabled={readOnly} value={selectedComments} onChange={(event) => setSelectedComments(event.target.value)} /></label></div><Button type="button" disabled={readOnly} onClick={() => void addResponsible()}>{selectedResponsibleRecordId ? 'Guardar edición' : 'Agregar responsable'}</Button></section> : null}

    {tab === 'Curso 50 Horas' ? <section className="advanced-management__section"><h3>Curso 50 Horas</h3><CourseFields /><div className="advanced-management__badges"><span className={statusBadgeClass(fiftyCredential?.status)}>{fiftyCredential?.status ?? 'Pendiente'}</span></div><label className="upload-zone"><input className="upload-zone__input" type="file" multiple accept=".pdf,image/*,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={readOnly} onChange={(event) => { setPendingFiles(Array.from(event.target.files ?? [])); markDirty(); }} /><span className="upload-zone__title">50h certificate, diploma y soportes</span><span className="muted">Acepta PDF, imágenes y Word.</span>{pendingFiles.map((file) => <span key={file.name} className="upload-zone__file">Pendiente: {file.name}</span>)}</label><section className="advanced-management__section advanced-management__related"><h3>OCR visualization</h3><div className="grid grid-2"><label className="field"><span className="label">OCR detected date</span><input type="date" className="input" value={detectedDate} disabled readOnly /></label><label className="field"><span className="label">Editable date field</span><input type="date" className="input" disabled={readOnly || !latestOcr} value={manualOcrDate} onChange={(event) => { setManualOcrDate(event.target.value); markDirty(); }} /></label></div>{ocrManuallyChanged ? <p className="advanced-management__audit-warning">Advertencia: la fecha fue modificada manualmente. Detectado: {detectedDate || '—'} · Usuario: {manualOcrDate || modifiedDate || '—'}</p> : <p className="muted">Valor detectado: {detectedDate || 'Sin OCR'} · Valor usuario: {manualOcrDate || 'Sin modificación'}</p>}</section></section> : null}

    {tab === 'Curso 20 Horas' ? <section className="advanced-management__section"><h3>Curso 20 Horas</h3>{requires20Hour ? <p className="advanced-management__alert">El backend indica actualización requerida: carga el certificado de 20 horas para mantener el cumplimiento.</p> : <p className="advanced-management__success">No se requiere actualización de 20 horas según validación actual.</p>}<CourseFields twenty /><label className="upload-zone"><input className="upload-zone__input" type="file" multiple accept=".pdf,image/*,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={readOnly} onChange={(event) => { setPending20Files(Array.from(event.target.files ?? [])); markDirty(); }} /><span className="upload-zone__title">Required upload form</span><span className="muted">Certificado o soportes del curso de actualización 20 horas.</span>{pending20Files.map((file) => <span key={file.name} className="upload-zone__file">Pendiente: {file.name}</span>)}</label></section> : null}

    {tab === 'Documentos' ? <section className="advanced-management__section"><h3>Repositorio centralizado</h3><p className="muted">Carga, previsualiza, descarga y conserva historial de versiones de PDF, imágenes y Word.</p>{renderDocuments(documents)}<h3>Version history</h3>{renderDocuments(documents.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))))}</section> : null}
    {tab === 'Alertas' ? <section className="advanced-management__section"><h3>Alertas generadas</h3><div className="advanced-list">{alerts.length ? alerts.map((alert: ComplianceCredentialAlertModel) => <article key={alert._id} className="advanced-list__item"><span className={alert.severity === 'critical' ? 'advanced-management__badge advanced-management__badge--danger' : alert.severity === 'warning' ? 'advanced-management__badge advanced-management__badge--warning' : 'advanced-management__badge advanced-management__badge--success'}>{alert.severity}</span><strong>{alert.type}</strong><p>{alert.message}</p><small>Creada: {new Date(alert.createdAt ?? alert.dueAt ?? '').toLocaleString()} · Estado: {alert.resolved ? 'Resuelta' : 'Abierta'}</small></article>) : <p className="empty-state">No hay alertas generadas.</p>}</div></section> : null}
    {tab === 'Historial' ? <section className="advanced-management__section"><h3>Timeline / historial</h3><div className="timeline">{history.length ? history.map((entry: ComplianceCredentialHistoryModel) => <article key={entry._id} className="timeline__item"><strong>{entry.action}</strong><p>{entry.details || `${entry.field}: ${entry.oldValue ?? '—'} → ${entry.newValue ?? '—'}`}</p><small>{new Date(entry.createdAt ?? '').toLocaleString()}</small></article>) : <p className="empty-state">Aún no hay movimientos registrados.</p>}</div></section> : null}
    <div className="advanced-management__footer"><span className={dirty ? 'advanced-management__dirty' : 'muted'}>{dirty ? 'Cambios sin guardar' : 'Sin cambios pendientes'}</span><Button type="button" disabled={readOnly || loading} onClick={() => void saveAll()}>Guardar gestión avanzada</Button></div>
  </div>;
}


function SstPolicyAdvancedPanel({ token, readOnly, onComplianceChange, onDirtyChange, saveRequest, discardRequest, onSaved }: { token: string; readOnly?: boolean; onComplianceChange: (status: ResponsableSstComplianceStatus) => void; onDirtyChange: (dirty: boolean) => void; saveRequest: number; discardRequest: number; onSaved: () => void }) {
  const [tab, setTab] = useState('Política SST');
  const [record, setRecord] = useState<SstPolicyAdvancedModel | null>(null);
  const [masterList, setMasterList] = useState<PolicyMasterListRowModel[]>([]);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);
  const [area, setArea] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [dirty, setDirty] = useState(false);
  const badge = complianceBadge(record?.complianceStatus);
  const currentVersion = record?.versions.find((version) => version.version === record.currentVersion);

  const load = useCallback(async () => {
    if (!token) return;
    const [policy, list, workerList] = await Promise.all([fetchSstPolicyAdvanced(token), fetchSstPolicyMasterListAdvanced(token), fetchEmployees(token)]);
    setRecord(policy);
    setMasterList(list);
    setEmployees(workerList);
    onComplianceChange(policy.complianceStatus);
    setDirty(false);
  }, [onComplianceChange, token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (saveRequest && record) void save(); }, [saveRequest]);
  useEffect(() => { if (discardRequest) void load(); }, [discardRequest, load]);

  const patchRecord = (patch: Partial<SstPolicyAdvancedModel>) => {
    setRecord((current) => current ? { ...current, ...patch } : current);
    setDirty(true);
  };

  const save = async () => {
    if (!record) return;
    const saved = await updateSstPolicyAdvanced(token, {
      documentCode: record.documentCode,
      documentName: record.documentName,
      currentVersion: record.currentVersion,
      status: record.status,
      content: record.content,
      issuedAt: toDateInputValue(currentVersion?.issuedAt),
      approvedAt: toDateInputValue(currentVersion?.approvedAt),
      expiresAt: toDateInputValue(currentVersion?.expiresAt),
    });
    setRecord(saved);
    setMasterList(await fetchSstPolicyMasterListAdvanced(token));
    onComplianceChange(saved.complianceStatus);
    setDirty(false);
    onSaved();
  };

  const setCurrentVersionDate = (field: 'issuedAt' | 'approvedAt' | 'expiresAt', value: string) => {
    if (!record) return;
    patchRecord({ versions: record.versions.map((version) => version.version === record.currentVersion ? { ...version, [field]: value } : version) });
  };

  const exportDocument = (type: 'pdf' | 'word') => {
    if (!record) return;
    const body = `${record.documentCode} · ${record.documentName}\nVersión ${record.currentVersion}\n\n${record.content ?? ''}`;
    const blob = new Blob([body], { type: type === 'pdf' ? 'application/pdf' : 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${record.documentCode || 'POL-SST'}.${type === 'pdf' ? 'pdf' : 'doc'}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportMaster = (type: 'excel' | 'pdf') => {
    const rows = masterList.map((row) => [row.code, row.document, row.version, row.status, toDateInputValue(row.issuedAt), toDateInputValue(row.expiresAt), row.responsible].join(type === 'excel' ? ',' : ' | ')).join('\n');
    const blob = new Blob([`Código,Documento,Versión,Estado,Fecha emisión,Fecha vencimiento,Responsable\n${rows}`], { type: type === 'excel' ? 'text/csv' : 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `listado-maestro-politica-sst.${type === 'excel' ? 'csv' : 'pdf'}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!record) return <p className="muted">Cargando política SST avanzada...</p>;
  const areas = Array.from(new Set(employees.map((employee) => employee.area).filter(Boolean)));
  const filteredMaster = masterList.filter((row) => `${row.code} ${row.document} ${row.status} ${row.responsible}`.toLowerCase().includes(filter.toLowerCase()));

  return <div className="advanced-management advanced-management--policy">
    <section className="advanced-management__hero"><div><p className="muted">Módulo 2.1.1</p><h3>Política SST</h3><p className="muted">{record.complianceReason}</p></div><span className={badge.className}>{badge.label}</span></section>
    <div className="advanced-tabs" role="tablist">{['Política SST', 'Firmas', 'Socialización', 'Listado Maestro', 'Alertas', 'Historial'].map((name) => <Button key={name} type="button" variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>{name}</Button>)}</div>

    {tab === 'Política SST' ? <section className="advanced-management__section"><div className="actions"><Button type="button" disabled={readOnly} onClick={async () => { const generated = await generateSstPolicyAdvanced(token); setRecord(generated); onComplianceChange(generated.complianceStatus); }}>Generar Política SST</Button><Button type="button" variant="secondary" disabled={readOnly} onClick={save}>Guardar cambios</Button><Button type="button" variant="ghost" disabled={readOnly} onClick={async () => setRecord(await createSstPolicyVersionAdvanced(token))}>Nueva versión</Button><Button type="button" variant="ghost" onClick={() => exportDocument('pdf')}>Exportar PDF</Button><Button type="button" variant="ghost" onClick={() => exportDocument('word')}>Exportar Word</Button></div><div className="form-grid"><label className="field"><span className="label">Código documental</span><input className="input" value={record.documentCode} disabled={readOnly} onChange={(event) => patchRecord({ documentCode: event.target.value })} /></label><label className="field"><span className="label">Nombre documento</span><input className="input" value={record.documentName} disabled={readOnly} onChange={(event) => patchRecord({ documentName: event.target.value })} /></label><label className="field"><span className="label">Versión</span><input className="input" value={record.currentVersion} disabled={readOnly} onChange={(event) => patchRecord({ currentVersion: event.target.value })} /></label><label className="field"><span className="label">Estado</span><select className="input" value={record.status} disabled={readOnly} onChange={(event) => patchRecord({ status: event.target.value as never })}>{['Borrador', 'Pendiente aprobación', 'Aprobado', 'Vencido', 'Archivado'].map((status) => <option key={status}>{status}</option>)}</select></label><label className="field"><span className="label">Fecha emisión</span><input className="input" type="date" value={toDateInputValue(currentVersion?.issuedAt)} disabled={readOnly} onChange={(event) => setCurrentVersionDate('issuedAt', event.target.value)} /></label><label className="field"><span className="label">Fecha aprobación</span><input className="input" type="date" value={toDateInputValue(currentVersion?.approvedAt)} disabled={readOnly} onChange={(event) => setCurrentVersionDate('approvedAt', event.target.value)} /></label><label className="field"><span className="label">Fecha vencimiento</span><input className="input" type="date" value={toDateInputValue(currentVersion?.expiresAt)} disabled={readOnly} onChange={(event) => setCurrentVersionDate('expiresAt', event.target.value)} /></label></div><label className="field"><span className="label">Plantilla editable</span><textarea className="input" rows={12} value={record.content ?? ''} disabled={readOnly} onChange={(event) => patchRecord({ content: event.target.value })} /></label><div className="responsive-table"><table className="table"><thead><tr><th>Versión</th><th>Estado</th><th>Aprobación</th><th>Vencimiento</th><th>Archivada</th><th>Acción</th></tr></thead><tbody>{record.versions.map((version) => <tr key={version.version}><td>{version.version}</td><td>{version.status}</td><td>{toDateInputValue(version.approvedAt) || '—'}</td><td>{toDateInputValue(version.expiresAt) || '—'}</td><td>{version.archived ? 'Sí' : 'No'}</td><td><Button type="button" variant="ghost" disabled={readOnly || version.archived} onClick={async () => setRecord(await archiveSstPolicyVersionAdvanced(token, version.version))}>Archivar</Button></td></tr>)}</tbody></table></div></section> : null}

    {tab === 'Firmas' ? <section className="advanced-management__section"><p className="muted">La política no puede aprobarse sin firmas obligatorias de Manager y Representante legal.</p><table className="table"><thead><tr><th>Firmante</th><th>Correo</th><th>Obligatoria</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>{record.signatures.map((signature) => <tr key={signature.role}><td><input className="input" value={signature.signerName} disabled={readOnly} onChange={(event) => setRecord({ ...record, signatures: record.signatures.map((item) => item.role === signature.role ? { ...item, signerName: event.target.value } : item) })} /></td><td><input className="input" value={signature.signerEmail} disabled={readOnly} onChange={(event) => setRecord({ ...record, signatures: record.signatures.map((item) => item.role === signature.role ? { ...item, signerEmail: event.target.value } : item) })} /></td><td>{signature.required ? 'Sí' : 'No'}</td><td>{signature.status}</td><td>{signature.signedAt ? new Date(signature.signedAt).toLocaleString() : '—'}</td><td><div className="actions"><Button type="button" disabled={readOnly} onClick={async () => setRecord(await updateSstPolicySignatureAdvanced(token, { ...signature, status: 'Firmado', evidence: 'Firma digital reutilizada' }))}>Firmar</Button><Button type="button" variant="danger" disabled={readOnly} onClick={async () => setRecord(await updateSstPolicySignatureAdvanced(token, { ...signature, status: 'Rechazado', rejectionReason: 'Rechazado por firmante' }))}>Rechazar</Button></div></td></tr>)}</tbody></table><Button type="button" disabled={readOnly} onClick={async () => setRecord(await approveSstPolicyAdvanced(token))}>Aprobar política</Button></section> : null}

    {tab === 'Socialización' ? <section className="advanced-management__section"><div className="actions"><Button type="button" disabled={readOnly} onClick={async () => setRecord(await assignSstPolicySocializationAdvanced(token, { mode: 'all' }))}>Asignar todos</Button><select className="input" value={area} disabled={readOnly} onChange={(event) => setArea(event.target.value)}><option value="">Área...</option>{areas.map((name) => <option key={name}>{name}</option>)}</select><Button type="button" variant="secondary" disabled={readOnly || !area} onClick={async () => setRecord(await assignSstPolicySocializationAdvanced(token, { mode: 'area', area }))}>Asignar por área</Button><select className="input" multiple value={selectedEmployees} disabled={readOnly} onChange={(event) => setSelectedEmployees(Array.from(event.target.selectedOptions).map((option) => option.value))}>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name} · {employee.area}</option>)}</select><Button type="button" variant="secondary" disabled={readOnly || !selectedEmployees.length} onClick={async () => setRecord(await assignSstPolicySocializationAdvanced(token, { mode: 'selected', employeeIds: selectedEmployees }))}>Asignar seleccionados</Button></div><table className="table"><thead><tr><th>Trabajador</th><th>Área</th><th>Estado</th><th>Fecha/Hora</th><th>Evidencia</th><th>Acción</th></tr></thead><tbody>{record.socializations.map((item) => <tr key={item.employeeId ?? item.employeeName}><td>{item.employeeName}</td><td>{item.area ?? '—'}</td><td>{item.status}</td><td>{item.signedAt ? new Date(item.signedAt).toLocaleString() : item.readAt ? new Date(item.readAt).toLocaleString() : '—'}</td><td>{item.evidence ?? '—'}</td><td><div className="actions"><Button type="button" variant="ghost" disabled={readOnly || !item.employeeId} onClick={async () => setRecord(await updateSstPolicySocializationAdvanced(token, { employeeId: String(item.employeeId), status: 'Leído', evidence: 'Lectura registrada' }))}>Leído</Button><Button type="button" disabled={readOnly || !item.employeeId} onClick={async () => setRecord(await updateSstPolicySocializationAdvanced(token, { employeeId: String(item.employeeId), status: 'Firmado digitalmente', evidence: 'Firma digital trabajador' }))}>Firma digital</Button></div></td></tr>)}</tbody></table></section> : null}

    {tab === 'Listado Maestro' ? <section className="advanced-management__section"><div className="actions"><input className="input" placeholder="Filtrar" value={filter} onChange={(event) => setFilter(event.target.value)} /><Button type="button" variant="ghost" onClick={() => exportMaster('excel')}>Exportar Excel</Button><Button type="button" variant="ghost" onClick={() => exportMaster('pdf')}>Exportar PDF</Button></div><table className="table"><thead><tr><th>Código</th><th>Documento</th><th>Versión</th><th>Estado</th><th>Fecha emisión</th><th>Fecha vencimiento</th><th>Responsable</th></tr></thead><tbody>{filteredMaster.map((row) => <tr key={`${row.code}-${row.version}`}><td>{row.code}</td><td>{row.document}</td><td>{row.version}</td><td>{row.status}</td><td>{toDateInputValue(row.issuedAt) || '—'}</td><td>{toDateInputValue(row.expiresAt) || '—'}</td><td>{row.responsible}</td></tr>)}</tbody></table></section> : null}

    {tab === 'Alertas' ? <section className="advanced-management__section"><table className="table"><thead><tr><th>Tipo</th><th>Mensaje</th><th>Vence</th><th>Destinatarios</th></tr></thead><tbody>{record.alerts.map((alert) => <tr key={`${alert.type}-${alert.dueAt}`}><td>{alert.type}</td><td>{alert.message}</td><td>{new Date(alert.dueAt).toLocaleDateString()}</td><td>{alert.recipients.join(', ')}</td></tr>)}</tbody></table></section> : null}

    {tab === 'Historial' ? <section className="advanced-management__section"><table className="table"><thead><tr><th>Acción</th><th>Usuario</th><th>Fecha</th><th>Valor anterior</th><th>Valor nuevo</th></tr></thead><tbody>{record.history.map((entry, index) => <tr key={`${entry.action}-${index}`}><td>{entry.action}</td><td>{entry.userEmail ?? 'Sistema'}</td><td>{new Date(entry.date).toLocaleString()}</td><td>{entry.previousValue ?? '—'}</td><td>{entry.newValue ?? '—'}</td></tr>)}</tbody></table></section> : null}
  </div>;
}


const objectiveMethodLabels: Record<string, string> = {
  MANUAL: 'Manual Progress',
  AUTOMATIC: 'Automatic Progress',
  ACTIVITY_BASED: 'Activity-Based Progress',
};

const objectiveStatusLabels: Record<string, string> = {
  'Not Started': 'No iniciado',
  'In Progress': 'En progreso',
  Completed: 'Completado',
  Delayed: 'Retrasado',
};

function objectiveProgressClass(progress: number) {
  if (progress <= 30) return 'objective-progress__bar objective-progress__bar--low';
  if (progress <= 70) return 'objective-progress__bar objective-progress__bar--medium';
  return 'objective-progress__bar objective-progress__bar--high';
}

function SstObjectivesAdvancedPanel({ token, readOnly, onComplianceChange, onDirtyChange, saveRequest, discardRequest, onSaved }: { token: string; readOnly?: boolean; onComplianceChange: (status: ResponsableSstComplianceStatus) => void; onDirtyChange: (dirty: boolean) => void; saveRequest: number; discardRequest: number; onSaved: () => void }) {
  const [record, setRecord] = useState<SstObjectivesAdvancedModel | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('Dashboard');
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (!token) return; fetchSstObjectivesAdvanced(token).then((response) => { setRecord(response); onComplianceChange(response.complianceStatus); }); }, [token, onComplianceChange]);
  const patchObjective = (objectiveId: string, patch: Partial<SstObjectiveItemModel>) => {
    if (!record) return;
    setRecord({ ...record, objectives: record.objectives.map((objective) => objective.objectiveId === objectiveId ? { ...objective, ...patch } : objective) });
    setDirty(true);
  };
  const save = async () => {
    if (!record) return;
    const saved = await updateSstObjectivesAdvanced(token, record);
    setRecord(saved);
    setDirty(false);
    onComplianceChange(saved.complianceStatus);
    onSaved();
  };
  const addObjective = () => {
    if (!record) return;
    const objective: SstObjectiveItemModel = { objectiveId: `tmp-${Date.now()}`, name: 'Nuevo objetivo SST', responsible: 'Responsable SST', dueDate: new Date().toISOString().slice(0, 10), active: true, measurementMethod: 'MANUAL', status: 'Not Started', currentProgress: 0, targetProgress: 100, indicator: 'Avance del objetivo', targetValue: 100, currentValue: 0, automaticSource: 'MANUAL', activities: [], executionLog: [], lastUpdatedAt: new Date().toISOString() };
    setRecord({ ...record, objectives: [...record.objectives, objective] });
    setDirty(true);
  };
  useEffect(() => { if (saveRequest > 0) void save(); }, [saveRequest]);
  useEffect(() => { if (discardRequest > 0) { setDirty(false); if (token) fetchSstObjectivesAdvanced(token).then(setRecord); } }, [discardRequest, token]);
  if (!record) return <p className="muted">Cargando objetivos SST avanzados...</p>;
  const badge = complianceBadge(record.complianceStatus);
  return <div className="advanced-management advanced-management--objectives">
    <section className="advanced-management__hero"><div><p className="muted">Módulo 2.2.1</p><h3>Objetivos SST</h3><p className="muted">{record.complianceReason}</p></div><span className={badge.className}>{badge.label}</span></section>
    <div className="advanced-tabs" role="tablist">{['Dashboard', 'Objetivos', 'Actividades', 'Alertas', 'Historial'].map((name) => <Button key={name} type="button" variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>{name}</Button>)}</div>

    {tab === 'Dashboard' ? <section className="advanced-management__section"><div className="objective-card-grid">{record.objectives.map((objective) => {
      const completed = objective.activities.filter((activity) => activity.status === 'Completed').length;
      return <article key={objective.objectiveId} className="objective-card"><div><p className="muted">{objectiveMethodLabels[objective.measurementMethod]}</p><h3>{objective.name}</h3><p className="muted">Responsable: {objective.responsible} · Vence: {toDateInputValue(objective.dueDate)}</p></div><div className="objective-progress"><div className="objective-progress__track"><span className={objectiveProgressClass(objective.currentProgress)} style={{ width: `${Math.min(100, objective.currentProgress)}%` }} /></div><strong>{objective.currentProgress}%</strong></div><p><span className={statusBadgeClass(objective.status)}>{objectiveStatusLabels[objective.status] ?? objective.status}</span></p>{objective.measurementMethod === 'AUTOMATIC' ? <p className="muted">{objective.currentValue ?? 0} / {objective.targetValue ?? 0} · {objective.indicator}</p> : null}{objective.measurementMethod === 'ACTIVITY_BASED' ? <p className="muted">Actividades: {completed}/{objective.activities.length}</p> : null}</article>;
    })}</div></section> : null}

    {tab === 'Objetivos' ? <section className="advanced-management__section"><div className="actions"><Button type="button" disabled={readOnly} onClick={addObjective}>Agregar objetivo</Button><Button type="button" variant="secondary" disabled={readOnly || !dirty} onClick={() => void save()}>Guardar cambios</Button></div><div className="responsive-table"><table className="table"><thead><tr><th>Objetivo</th><th>Método</th><th>Responsable</th><th>Vence</th><th>Indicador</th><th>Actual</th><th>Meta</th><th>Fuente</th><th>Estado</th></tr></thead><tbody>{record.objectives.map((objective) => <tr key={objective.objectiveId}><td><input className="input" disabled={readOnly} value={objective.name} onChange={(event) => patchObjective(objective.objectiveId, { name: event.target.value })} /></td><td><select className="input" disabled={readOnly} value={objective.measurementMethod} onChange={(event) => patchObjective(objective.objectiveId, { measurementMethod: event.target.value as never })}>{Object.entries(objectiveMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td><input className="input" disabled={readOnly} value={objective.responsible} onChange={(event) => patchObjective(objective.objectiveId, { responsible: event.target.value })} /></td><td><input className="input" type="date" disabled={readOnly} value={toDateInputValue(objective.dueDate)} onChange={(event) => patchObjective(objective.objectiveId, { dueDate: event.target.value })} /></td><td><input className="input" disabled={readOnly} value={objective.indicator ?? ''} onChange={(event) => patchObjective(objective.objectiveId, { indicator: event.target.value })} /></td><td><input className="input" type="number" disabled={readOnly || objective.measurementMethod === 'AUTOMATIC'} value={objective.measurementMethod === 'MANUAL' ? objective.currentProgress : objective.currentValue ?? 0} onChange={(event) => patchObjective(objective.objectiveId, objective.measurementMethod === 'MANUAL' ? { currentProgress: Number(event.target.value) } : { currentValue: Number(event.target.value) })} /></td><td><input className="input" type="number" disabled={readOnly} value={objective.measurementMethod === 'MANUAL' ? objective.targetProgress : objective.targetValue ?? 0} onChange={(event) => patchObjective(objective.objectiveId, objective.measurementMethod === 'MANUAL' ? { targetProgress: Number(event.target.value) } : { targetValue: Number(event.target.value) })} /></td><td><select className="input" disabled={readOnly || objective.measurementMethod !== 'AUTOMATIC'} value={objective.automaticSource ?? 'MANUAL'} onChange={(event) => patchObjective(objective.objectiveId, { automaticSource: event.target.value as never })}>{['MANUAL', 'TRAININGS', 'INSPECTIONS', 'EMPLOYEES', 'INCIDENTS'].map((source) => <option key={source}>{source}</option>)}</select></td><td>{objectiveStatusLabels[objective.status] ?? objective.status}</td></tr>)}</tbody></table></div></section> : null}

    {tab === 'Actividades' ? <section className="advanced-management__section">{record.objectives.map((objective) => <article key={objective.objectiveId} className="advanced-management__related"><div className="actions" style={{ justifyContent: 'space-between' }}><h3>{objective.name}</h3><Button type="button" variant="secondary" disabled={readOnly} onClick={() => patchObjective(objective.objectiveId, { measurementMethod: 'ACTIVITY_BASED', activities: [...objective.activities, { name: 'Nueva actividad', responsible: objective.responsible, dueDate: new Date().toISOString().slice(0, 10), status: 'Pending', tasks: [] }] })}>Agregar actividad</Button></div><table className="table"><thead><tr><th>Actividad</th><th>Responsable</th><th>Vence</th><th>Estado</th></tr></thead><tbody>{objective.activities.map((activity, index) => <tr key={`${objective.objectiveId}-${index}`}><td><input className="input" disabled={readOnly} value={activity.name} onChange={(event) => { const activities = [...objective.activities]; activities[index] = { ...activity, name: event.target.value }; patchObjective(objective.objectiveId, { activities }); }} /></td><td><input className="input" disabled={readOnly} value={activity.responsible} onChange={(event) => { const activities = [...objective.activities]; activities[index] = { ...activity, responsible: event.target.value }; patchObjective(objective.objectiveId, { activities }); }} /></td><td><input className="input" type="date" disabled={readOnly} value={toDateInputValue(activity.dueDate)} onChange={(event) => { const activities = [...objective.activities]; activities[index] = { ...activity, dueDate: event.target.value }; patchObjective(objective.objectiveId, { activities }); }} /></td><td><select className="input" disabled={readOnly} value={activity.status} onChange={async (event) => { const activities = [...objective.activities]; activities[index] = { ...activity, status: event.target.value as never, completedAt: event.target.value === 'Completed' ? new Date().toISOString() : undefined }; const saved = await updateSstObjectiveActivitiesAdvanced(token, objective.objectiveId, activities); setRecord(saved); onComplianceChange(saved.complianceStatus); }}><option value="Pending">Pendiente</option><option value="In Progress">En progreso</option><option value="Completed">Completada</option></select></td></tr>)}</tbody></table></article>)}</section> : null}

    {tab === 'Alertas' ? <section className="advanced-management__section"><table className="table"><thead><tr><th>Tipo</th><th>Mensaje</th><th>Destinatarios</th><th>Fecha</th></tr></thead><tbody>{record.alerts.map((alert) => <tr key={`${alert.type}-${alert.objectiveId}`}><td>{alert.type}</td><td>{alert.message}</td><td>{alert.recipients.join(', ')}</td><td>{new Date(alert.dueAt).toLocaleDateString()}</td></tr>)}</tbody></table></section> : null}

    {tab === 'Historial' ? <section className="advanced-management__section"><table className="table"><thead><tr><th>Acción</th><th>Usuario</th><th>Fecha</th><th>Campo</th><th>Anterior</th><th>Nuevo</th></tr></thead><tbody>{record.history.map((entry, index) => <tr key={`${entry.action}-${index}`}><td>{entry.action}</td><td>{entry.userEmail ?? 'Sistema'}</td><td>{new Date(entry.date).toLocaleString()}</td><td>{entry.field}</td><td>{entry.previousValue ?? '—'}</td><td>{entry.newValue ?? '—'}</td></tr>)}</tbody></table></section> : null}
    <div className="advanced-management__footer"><span className={dirty ? 'advanced-management__dirty' : 'muted'}>{dirty ? 'Cambios sin guardar' : 'Sin cambios pendientes'}</span><Button type="button" disabled={readOnly || !dirty} onClick={() => void save()}>Guardar</Button></div>
  </div>;
}


function chapterCompliance(evaluation: InitialEvaluationModel) {
  const grouped = new Map<string, { total: number; complies: number }>();
  evaluation.standards.forEach((standard) => {
    if (standard.status === 'No Aplica') return;
    const current = grouped.get(standard.chapter) ?? { total: 0, complies: 0 };
    current.total += 1;
    if (standard.status === 'Cumple') current.complies += 1;
    grouped.set(standard.chapter, current);
  });
  return Array.from(grouped.entries()).map(([chapter, value]) => ({ chapter, percentage: value.total ? Math.round((value.complies / value.total) * 100) : 100 }));
}

type AnnualTaskLocation = { objectiveIndex: number; activityIndex: number; taskIndex: number; objective: SstObjectiveItemModel; activity: SstObjectiveActivityModel; task: SstObjectiveTaskModel };

function AnnualWorkPlanPanel({ token, readOnly, onComplianceChange, onDirtyChange, saveRequest, discardRequest, onSaved }: { token: string; readOnly?: boolean; onComplianceChange: (status: ResponsableSstComplianceStatus) => void; onDirtyChange: (dirty: boolean) => void; saveRequest: number; discardRequest: number; onSaved: () => void }) {
  const [record, setRecord] = useState<SstObjectivesAdvancedModel | null>(null);
  const [tab, setTab] = useState('Annual Work Plan Execution');
  const [dirty, setDirty] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [logDraft, setLogDraft] = useState({ progressNotes: '', achievements: '', difficulties: '', observations: '', nextActions: '' });
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (!token) return; fetchAnnualWorkPlanAdvanced(token).then((response) => { setRecord(response); setSelectedObjectiveId(response.objectives[0]?.objectiveId ?? ''); setSelectedActivityId(response.objectives[0]?.activities[0]?.activityId ?? ''); onComplianceChange(response.complianceStatus); }); }, [token, onComplianceChange]);
  const updateRecord = (next: SstObjectivesAdvancedModel) => { setRecord(next); setDirty(true); };
  const save = async () => { if (!record) return; const saved = await updateAnnualWorkPlanAdvanced(token, record); setRecord(saved); setDirty(false); onComplianceChange(saved.complianceStatus); onSaved(); };
  useEffect(() => { if (saveRequest > 0) void save(); }, [saveRequest]);
  useEffect(() => { if (discardRequest > 0 && token) { setDirty(false); fetchAnnualWorkPlanAdvanced(token).then(setRecord); } }, [discardRequest, token]);
  if (!record) return <p className="muted">Cargando plan anual de trabajo...</p>;
  const patchObjective = (objectiveId: string, patch: Partial<SstObjectiveItemModel>) => updateRecord({ ...record, objectives: record.objectives.map((objective) => objective.objectiveId === objectiveId ? { ...objective, ...patch } : objective) });
  const tasks: AnnualTaskLocation[] = record.objectives.flatMap((objective, objectiveIndex) => objective.activities.flatMap((activity, activityIndex) => (activity.tasks ?? []).map((task, taskIndex) => ({ objectiveIndex, activityIndex, taskIndex, objective, activity, task }))));
  const isTaskDelayed = (task: SstObjectiveTaskModel) => task.status === 'Delayed' || (task.status !== 'Completed' && new Date(task.dueDate) < new Date());
  const upcoming = tasks.filter(({ task }) => task.status !== 'Completed' && new Date(task.dueDate) >= new Date()).length;
  const delayed = tasks.filter(({ task }) => isTaskDelayed(task)).length;
  const completed = tasks.filter(({ task }) => task.status === 'Completed' || task.progress === 100).length;
  const critical = tasks.filter(({ task }) => task.priority === 'Critical').length;
  const riskTasks = tasks.filter(({ task }) => isTaskDelayed(task) || (task.lastProgressAt && (Date.now() - new Date(task.lastProgressAt).getTime()) > 30 * 86400000) || !task.evidence?.length || ((task.status === 'Delayed' || new Date(task.dueDate) < new Date()) && !task.justifications?.length));
  const setTask = (location: AnnualTaskLocation, patch: Partial<SstObjectiveTaskModel>) => {
    const objectives = [...record.objectives];
    const objective = { ...objectives[location.objectiveIndex] };
    const activities = [...objective.activities];
    const activity = { ...activities[location.activityIndex] };
    const tasksCopy = [...(activity.tasks ?? [])];
    tasksCopy[location.taskIndex] = { ...tasksCopy[location.taskIndex], ...patch, lastProgressAt: patch.progress !== undefined ? new Date().toISOString() : tasksCopy[location.taskIndex].lastProgressAt };
    activity.tasks = tasksCopy;
    activities[location.activityIndex] = activity;
    objective.activities = activities;
    objectives[location.objectiveIndex] = objective;
    updateRecord({ ...record, objectives });
  };
  const addActivity = () => {
    const objective = record.objectives.find((item) => item.objectiveId === selectedObjectiveId) ?? record.objectives[0];
    if (!objective) return;
    patchObjective(objective.objectiveId, { measurementMethod: 'ACTIVITY_BASED', activities: [...objective.activities, { activityId: `act-${Date.now()}`, name: 'Nueva actividad', responsible: 'ADMIN', dueDate: new Date().toISOString().slice(0, 10), status: 'Pending', tasks: [] }] });
  };
  const addTask = () => {
    const objectiveIndex = record.objectives.findIndex((item) => item.objectiveId === selectedObjectiveId);
    const objective = record.objectives[objectiveIndex] ?? record.objectives[0];
    if (!objective) return;
    const activityIndex = Math.max(0, objective.activities.findIndex((item) => item.activityId === selectedActivityId));
    const activity = objective.activities[activityIndex] ?? objective.activities[0];
    if (!activity) return;
    const newTask: SstObjectiveTaskModel = { taskId: `task-${Date.now()}`, name: 'Nueva tarea', description: '', relatedObjective: objective.objectiveId, relatedActivity: activity.activityId, responsibleUser: 'ADMIN', assignmentDate: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), priority: 'Medium', estimatedCost: 0, notes: '', status: 'Pending', progress: 0, subtasks: [], evidence: [], justifications: [], reschedules: [] };
    const activities = [...objective.activities];
    activities[activityIndex] = { ...activity, tasks: [...(activity.tasks ?? []), newTask] };
    patchObjective(objective.objectiveId, { activities });
  };
  const addExecutionLog = () => {
    const objective = record.objectives.find((item) => item.objectiveId === selectedObjectiveId) ?? record.objectives[0];
    if (!objective) return;
    patchObjective(objective.objectiveId, { executionLog: [...(objective.executionLog ?? []), { logId: `log-${Date.now()}`, date: new Date().toISOString(), ...logDraft }] });
    setLogDraft({ progressNotes: '', achievements: '', difficulties: '', observations: '', nextActions: '' });
  };
  const badge = complianceBadge(record.complianceStatus);
  return <div className="advanced-management advanced-management--objectives">
    <section className="advanced-management__hero"><div><p className="muted">Módulo 2.4.1</p><h3>Plan anual de trabajo</h3><p className="muted">{record.complianceReason}</p></div><span className={badge.className}>{badge.label}</span></section>
    <div className="advanced-tabs" role="tablist">{['Annual Work Plan Execution', 'Actividades y tareas', 'Panel personal', 'Execution Log', 'Alertas', 'Risk Panel', 'History'].map((name) => <Button key={name} type="button" variant={tab === name ? 'primary' : 'secondary'} onClick={() => setTab(name)}>{name}</Button>)}</div>
    {tab === 'Annual Work Plan Execution' ? <section className="advanced-management__section"><div className="advanced-doc-grid"><article className="advanced-doc-card"><strong>Total Tasks</strong><span>{tasks.length}</span></article><article className="advanced-doc-card"><strong>Completed Tasks</strong><span>{completed}</span></article><article className="advanced-doc-card"><strong>Delayed Tasks</strong><span>{delayed}</span></article><article className="advanced-doc-card"><strong>Upcoming Tasks</strong><span>{upcoming}</span></article><article className="advanced-doc-card"><strong>Critical Tasks</strong><span>{critical}</span></article></div>{tasks.map(({ task }) => <article key={task.taskId} className="objective-card"><h3>{task.name}</h3><p className="muted">{task.responsibleUser} · {task.priority} · vence {toDateInputValue(task.dueDate)}</p><div className="objective-progress"><div className="objective-progress__track"><span className={objectiveProgressClass(task.progress)} style={{ width: `${task.progress}%` }} /></div><strong>{task.progress}%</strong></div></article>)}</section> : null}
    {tab === 'Actividades y tareas' ? <section className="advanced-management__section"><div className="actions"><select className="input" value={selectedObjectiveId} onChange={(event) => { setSelectedObjectiveId(event.target.value); setSelectedActivityId(record.objectives.find((item) => item.objectiveId === event.target.value)?.activities[0]?.activityId ?? ''); }}>{record.objectives.map((objective) => <option key={objective.objectiveId} value={objective.objectiveId}>{objective.name}</option>)}</select><select className="input" value={selectedActivityId} onChange={(event) => setSelectedActivityId(event.target.value)}>{(record.objectives.find((item) => item.objectiveId === selectedObjectiveId)?.activities ?? []).map((activity) => <option key={activity.activityId} value={activity.activityId}>{activity.name}</option>)}</select><Button type="button" disabled={readOnly} onClick={addActivity}>Crear actividad</Button><Button type="button" disabled={readOnly} onClick={addTask}>Crear tarea</Button></div><table className="table"><thead><tr><th>Task Name / Description</th><th>Responsible User</th><th>Due Date</th><th>Priority</th><th>Estimated Cost</th><th>Status</th><th>Progress</th><th>Evidence / Subtasks / Delay workflow</th></tr></thead><tbody>{tasks.map((location) => <tr key={location.task.taskId}><td><input className="input" disabled={readOnly} value={location.task.name} onChange={(event) => setTask(location, { name: event.target.value })} /><textarea className="input" disabled={readOnly} value={location.task.description ?? ''} onChange={(event) => setTask(location, { description: event.target.value })} /></td><td><select className="input" disabled={readOnly} value={location.task.responsibleUser} onChange={(event) => setTask(location, { responsibleUser: event.target.value, assignmentDate: new Date().toISOString().slice(0, 10) })}><option>ADMIN</option><option>MEMBER</option></select><small>Asignación: {toDateInputValue(location.task.assignmentDate)}</small></td><td><input className="input" type="date" disabled={readOnly} value={toDateInputValue(location.task.dueDate)} onChange={(event) => setTask(location, { dueDate: event.target.value })} /></td><td><select className="input" disabled={readOnly} value={location.task.priority} onChange={(event) => setTask(location, { priority: event.target.value as SstObjectiveTaskModel['priority'] })}>{['Low','Medium','High','Critical'].map((priority) => <option key={priority}>{priority}</option>)}</select></td><td><input className="input" type="number" disabled={readOnly} value={location.task.estimatedCost ?? 0} onChange={(event) => setTask(location, { estimatedCost: Number(event.target.value) })} /><input className="input" disabled={readOnly} placeholder="Notes" value={location.task.notes ?? ''} onChange={(event) => setTask(location, { notes: event.target.value })} /></td><td><select className="input" disabled={readOnly} value={location.task.status} onChange={(event) => setTask(location, { status: event.target.value as SstObjectiveTaskModel['status'] })}>{['Pending','In Progress','Completed','Delayed','Cancelled'].map((status) => <option key={status}>{status}</option>)}</select></td><td><select className="input" disabled={readOnly} value={location.task.progress} onChange={(event) => setTask(location, { progress: Number(event.target.value), status: Number(event.target.value) === 100 ? 'Completed' : Number(event.target.value) > 0 ? 'In Progress' : 'Pending' })}>{[0,25,50,75,100].map((progress) => <option key={progress} value={progress}>{progress}%</option>)}</select><div className="objective-progress"><div className="objective-progress__track"><span className={objectiveProgressClass(location.task.progress)} style={{ width: `${location.task.progress}%` }} /></div></div></td><td><div className="actions"><Button type="button" variant="secondary" disabled={readOnly} onClick={() => setTask(location, { subtasks: [...location.task.subtasks, { subtaskId: `sub-${Date.now()}`, name: 'Nueva subtarea', status: 'Pending', progress: 0 }] })}>Subtask</Button><label className="button button--secondary"><input type="file" style={{ display: 'none' }} disabled={readOnly} accept=".pdf,.xls,.xlsx,image/*,video/*,.doc,.docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) setTask(location, { evidence: [...location.task.evidence, { evidenceId: `ev-${Date.now()}`, fileName: file.name, fileType: file.type || file.name.split('.').pop() || 'document', uploadedAt: new Date().toISOString() }] }); }} />Evidence</label><Button type="button" variant="secondary" disabled={readOnly} onClick={() => setTask(location, { justifications: [...location.task.justifications, { justificationId: `jus-${Date.now()}`, reason: 'Other', comments: 'Reason for Non-Completion', date: new Date().toISOString() }] })}>Justify</Button><Button type="button" variant="secondary" disabled={readOnly} onClick={() => setTask(location, { reschedules: [...location.task.reschedules, { requestId: `res-${Date.now()}`, newDueDate: location.task.dueDate, correctiveAction: 'Corrective action', comments: '', status: location.task.priority === 'Critical' ? 'Pending Manager Approval' : 'Approved', reviewedAt: location.task.priority === 'Critical' ? undefined : new Date().toISOString() }] })}>Reschedule</Button></div>{location.task.reschedules.filter((request) => request.status === 'Pending Manager Approval').map((request) => <div className="actions" key={request.requestId}><small>Manager approval: {toDateInputValue(request.newDueDate)}</small><Button type="button" variant="secondary" disabled={readOnly} onClick={() => setTask(location, { reschedules: location.task.reschedules.map((item) => item.requestId === request.requestId ? { ...item, status: 'Approved', reviewedAt: new Date().toISOString(), managerComments: 'Approved reschedule' } : item), dueDate: request.newDueDate })}>Approve</Button><Button type="button" variant="danger" disabled={readOnly} onClick={() => setTask(location, { reschedules: location.task.reschedules.map((item) => item.requestId === request.requestId ? { ...item, status: 'Rejected', reviewedAt: new Date().toISOString(), managerComments: 'Rejected reschedule' } : item) })}>Reject</Button></div>)}<small>Evidencias: {location.task.evidence.length} · Justificaciones: {location.task.justifications.length} · Reprogramaciones: {location.task.reschedules.length}</small></td></tr>)}</tbody></table></section> : null}
    {tab === 'Panel personal' ? <section className="advanced-management__section"><h3>Personal Task Panel</h3>{tasks.map(({ task }) => <article key={task.taskId} className="advanced-list__item"><strong>{task.responsibleUser}: {task.name}</strong><p>{task.status} · {task.progress}% · vence {toDateInputValue(task.dueDate)}</p></article>)}</section> : null}
    {tab === 'Execution Log' ? <section className="advanced-management__section"><div className="grid grid-2"><select className="input" value={selectedObjectiveId} onChange={(event) => setSelectedObjectiveId(event.target.value)}>{record.objectives.map((objective) => <option key={objective.objectiveId} value={objective.objectiveId}>{objective.name}</option>)}</select>{(['progressNotes','achievements','difficulties','observations','nextActions'] as const).map((field) => <textarea key={field} className="input" disabled={readOnly} placeholder={field} value={logDraft[field]} onChange={(event) => setLogDraft({ ...logDraft, [field]: event.target.value })} />)}</div><Button type="button" disabled={readOnly} onClick={addExecutionLog}>Registrar Execution Log</Button>{record.objectives.flatMap((objective) => (objective.executionLog ?? []).map((log) => ({ objective, log }))).sort((a, b) => new Date(b.log.date ?? '').getTime() - new Date(a.log.date ?? '').getTime()).map(({ objective, log }) => <article className="advanced-list__item" key={log.logId}><strong>{objective.name}</strong><p>{new Date(log.date ?? '').toLocaleString()} · {log.userEmail ?? 'Usuario responsable'}</p><p>{log.progressNotes} {log.achievements} {log.difficulties} {log.observations} {log.nextActions}</p></article>)}</section> : null}
    {tab === 'Alertas' ? <section className="advanced-management__section"><h3>Notifications</h3><table className="table"><thead><tr><th>Tipo</th><th>Mensaje</th><th>Destinatarios</th><th>Fecha</th></tr></thead><tbody>{record.alerts.map((alert) => <tr key={`${alert.type}-${alert.objectiveId}-${alert.message}`}><td>{alert.type}</td><td>{alert.message}</td><td>{alert.recipients.join(', ')}</td><td>{new Date(alert.dueAt).toLocaleDateString()}</td></tr>)}</tbody></table></section> : null}
    {tab === 'Risk Panel' ? <section className="advanced-management__section"><h3>Tasks requiring attention</h3>{riskTasks.map(({ task }) => <article key={task.taskId} className="advanced-list__item"><strong>{task.name}</strong><p>Overdue: {new Date(task.dueDate) < new Date() ? 'Sí' : 'No'} · No progress in 30 days: {task.lastProgressAt && (Date.now() - new Date(task.lastProgressAt).getTime()) > 30 * 86400000 ? 'Sí' : 'No'} · Missing evidence: {!task.evidence.length ? 'Sí' : 'No'} · Missing justification: {(isTaskDelayed(task) && !task.justifications.length) ? 'Sí' : 'No'}</p></article>)}</section> : null}
    {tab === 'History' ? <section className="advanced-management__section"><table className="table"><thead><tr><th>User</th><th>Action</th><th>Date</th><th>Previous Value</th><th>New Value</th></tr></thead><tbody>{record.history.slice().reverse().map((entry, index) => <tr key={`${entry.action}-${index}`}><td>{entry.userEmail ?? 'Sistema'}</td><td>{entry.action}</td><td>{new Date(entry.date).toLocaleString()}</td><td>{entry.previousValue ?? '—'}</td><td>{entry.newValue ?? '—'}</td></tr>)}</tbody></table></section> : null}
    <div className="advanced-management__footer"><span className={dirty ? 'advanced-management__dirty' : 'muted'}>{dirty ? 'Cambios sin guardar' : 'Sin cambios pendientes'}</span><Button type="button" disabled={readOnly || !dirty} onClick={() => void save()}>Guardar</Button></div>
  </div>;
}


function InitialEvaluationAdvancedPanel({ token, readOnly, onComplianceChange, onDirtyChange }: { token: string; readOnly?: boolean; onComplianceChange: (status: ResponsableSstComplianceStatus) => void; onDirtyChange: (dirty: boolean) => void }) {
  const tabs = ['Diagnóstico General', 'Evaluación por Estándares', 'Brechas', 'Hallazgos', 'Plan de Acción', 'Indicadores', 'Firma Gerencial', 'Historial'];
  const [tab, setTab] = useState(tabs[0]);
  const [record, setRecord] = useState<InitialEvaluationModel | null>(null);
  const [chapterFilter, setChapterFilter] = useState('Todos');
  const [finding, setFinding] = useState({ title: '', description: '', severity: 'Medium', responsible: '', dueDate: '', status: 'Open' });
  const [action, setAction] = useState({ title: '', description: '', responsible: '', dueDate: '', manualProgress: 0, automaticProgress: 0, activityProgress: 0, status: 'Open' });
  const [signature, setSignature] = useState({ signerName: '', signerEmail: '', comments: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const next = await fetchInitialEvaluationAdvanced(token);
      setRecord(next);
      onComplianceChange(next.status === 'Aprobada' ? 'COMPLIES' : next.overallCompliance > 0 ? 'PENDING' : 'NON_COMPLIANT');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar la evaluación inicial.');
    } finally {
      setLoading(false);
    }
  }, [onComplianceChange, token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onDirtyChange(false); }, [onDirtyChange]);

  const updateStandard = async (standard: InitialEvaluationStandardModel, payload: Partial<InitialEvaluationStandardModel>) => {
    setRecord(await updateInitialEvaluationStandard(token, standard.code, payload));
    setMessage(`Estándar ${standard.code} actualizado.`);
  };

  const chapters = ['Todos', ...Array.from(new Set(record?.standards.map((standard) => standard.chapter) ?? []))];
  const standards = record?.standards.filter((standard) => chapterFilter === 'Todos' || standard.chapter === chapterFilter) ?? [];
  const chapterRows = record ? chapterCompliance(record) : [];
  const completed = record?.standards.filter((standard) => standard.status === 'Cumple').length ?? 0;
  const pending = record?.standards.filter((standard) => standard.status === 'No Cumple').length ?? 0;
  const na = record?.standards.filter((standard) => standard.status === 'No Aplica').length ?? 0;
  const criticalFindings = record?.findings.filter((item) => item.severity === 'Critical' && item.status !== 'Closed').length ?? 0;
  const pendingActions = record?.actionPlan.filter((item) => item.status !== 'Closed').length ?? 0;
  const riskLevel = criticalFindings > 0 || (record?.overallCompliance ?? 0) < 60 ? 'Alto' : (record?.overallCompliance ?? 0) < 85 ? 'Medio' : 'Bajo';

  if (loading && !record) return <p className="muted">Cargando gestión avanzada de evaluación inicial...</p>;
  if (!record) return <div className="advanced-management"><p className="advanced-management__audit-warning">{error || 'Sin datos disponibles.'}</p></div>;

  return (
    <div className="advanced-management initial-evaluation-management">
      {error ? <p className="advanced-management__audit-warning">{error}</p> : null}
      {message ? <p className="advanced-management__success">{message}</p> : null}
      <section className="advanced-management__hero">
        <h3>{record.name}</h3>
        <p className="muted">Cumplimiento ejecutivo: {record.overallCompliance}% · Estado: {record.status} · Próxima reevaluación: {toDateInputValue(record.nextReassessmentAt)}</p>
        <div className="advanced-management__badges">
          <span className="advanced-management__badge advanced-management__badge--success">Cumplen: {completed}</span>
          <span className="advanced-management__badge advanced-management__badge--warning">Pendientes: {pending}</span>
          <span className="advanced-management__badge">No aplica: {na}</span>
          <span className={riskLevel === 'Alto' ? 'advanced-management__badge advanced-management__badge--danger' : 'advanced-management__badge'}>Riesgo: {riskLevel}</span>
        </div>
      </section>
      <div className="advanced-tabs">{tabs.map((item) => <Button key={item} type="button" variant={tab === item ? 'primary' : 'secondary'} onClick={() => setTab(item)}>{item}</Button>)}</div>

      {tab === 'Diagnóstico General' ? <section className="advanced-management__section"><h3>Diagnóstico General</h3><div className="advanced-doc-grid"><article className="advanced-doc-card"><strong>Fecha evaluación</strong><span>{toDateInputValue(record.evaluationDate)}</span></article><article className="advanced-doc-card"><strong>Responsable SST</strong><span>{record.responsibleSst || 'Detectado desde responsable SST / pendiente'}</span></article><article className="advanced-doc-card"><strong>Estado</strong><span>{record.status}</span></article><article className="advanced-doc-card"><strong>Cumplimiento General</strong><span>{record.overallCompliance}%</span></article><article className="advanced-doc-card"><strong>Total estándares evaluados</strong><span>{record.totalStandardsEvaluated}</span></article></div><div className="actions"><Button type="button" disabled={readOnly} onClick={async () => { setRecord(await runInitialEvaluationAutoDiagnostic(token)); setMessage('Auto-diagnóstico ejecutado leyendo módulos existentes.'); }}>Ejecutar auto-diagnóstico</Button></div></section> : null}

      {tab === 'Evaluación por Estándares' ? <section className="advanced-management__section"><h3>Evaluación por Estándares</h3><label>Filtrar capítulo<select value={chapterFilter} onChange={(event) => setChapterFilter(event.target.value)}>{chapters.map((chapter) => <option key={chapter}>{chapter}</option>)}</select></label><table className="table"><thead><tr><th>Estándar</th><th>Capítulo</th><th>Estado</th><th>Observaciones</th><th>Evidencia</th><th>Adjuntos</th></tr></thead><tbody>{standards.map((standard) => <tr key={standard.code}><td><strong>{standard.code}</strong><br />{standard.title}{standard.autoEvaluated ? <small> · auto: {standard.autoSource}</small> : null}</td><td>{standard.chapter}</td><td><select disabled={readOnly} value={standard.status} onChange={(event) => void updateStandard(standard, { status: event.target.value as InitialEvaluationStandardModel['status'] })}><option>Cumple</option><option>No Cumple</option><option>No Aplica</option></select></td><td><textarea disabled={readOnly} defaultValue={standard.observations} onBlur={(event) => void updateStandard(standard, { observations: event.target.value })} /></td><td><input disabled={readOnly} defaultValue={standard.evidence.join(', ')} onBlur={(event) => void updateStandard(standard, { evidence: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></td><td><input disabled={readOnly} defaultValue={standard.attachments.join(', ')} onBlur={(event) => void updateStandard(standard, { attachments: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></td></tr>)}</tbody></table><h4>Cumplimiento por capítulo</h4>{chapterRows.map((row) => <p key={row.chapter}>{row.chapter}: {row.percentage}%</p>)}</section> : null}

      {tab === 'Brechas' ? <section className="advanced-management__section"><h3>Análisis de Brechas</h3><p>Cumplidos: {completed} · Pendientes: {pending} · No aplica: {na} · Cumplimiento: {record.overallCompliance}%</p><table className="table"><thead><tr><th>Capítulo</th><th>Estándar</th><th>Estado</th><th>Acción recomendada</th></tr></thead><tbody>{record.gaps.map((gap) => <tr key={gap.code}><td>{gap.chapter}</td><td>{gap.code} · {gap.title}</td><td>{gap.status}</td><td>{gap.recommendedAction}</td></tr>)}</tbody></table></section> : null}

      {tab === 'Hallazgos' ? <section className="advanced-management__section"><h3>Hallazgos</h3><div className="form-grid"><input placeholder="Título" value={finding.title} onChange={(event) => setFinding({ ...finding, title: event.target.value })} /><textarea placeholder="Descripción" value={finding.description} onChange={(event) => setFinding({ ...finding, description: event.target.value })} /><select value={finding.severity} onChange={(event) => setFinding({ ...finding, severity: event.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select><input placeholder="Responsable" value={finding.responsible} onChange={(event) => setFinding({ ...finding, responsible: event.target.value })} /><input type="date" value={finding.dueDate} onChange={(event) => setFinding({ ...finding, dueDate: event.target.value })} /><select value={finding.status} onChange={(event) => setFinding({ ...finding, status: event.target.value })}><option>Open</option><option>In Progress</option><option>Closed</option></select><Button type="button" disabled={readOnly || !finding.title} onClick={async () => { setRecord(await upsertInitialEvaluationFinding(token, finding as Partial<InitialEvaluationFindingModel> & { title: string })); setFinding({ title: '', description: '', severity: 'Medium', responsible: '', dueDate: '', status: 'Open' }); }}>Registrar hallazgo</Button></div><table className="table"><thead><tr><th>Título</th><th>Severidad</th><th>Responsable</th><th>Vence</th><th>Estado</th></tr></thead><tbody>{record.findings.map((item) => <tr key={item.id}><td>{item.title}<br /><small>{item.description}</small></td><td>{item.severity}</td><td>{item.responsible}</td><td>{toDateInputValue(item.dueDate)}</td><td>{item.status}</td></tr>)}</tbody></table></section> : null}

      {tab === 'Plan de Acción' ? <section className="advanced-management__section"><h3>Plan de Acción</h3><div className="actions"><Button type="button" disabled={readOnly} onClick={async () => { setRecord(await generateInitialEvaluationActions(token)); setMessage('Plan de acción generado desde brechas y hallazgos.'); }}>Generar acciones automáticas</Button></div><div className="form-grid"><input placeholder="Acción" value={action.title} onChange={(event) => setAction({ ...action, title: event.target.value })} /><input placeholder="Responsable" value={action.responsible} onChange={(event) => setAction({ ...action, responsible: event.target.value })} /><input type="date" value={action.dueDate} onChange={(event) => setAction({ ...action, dueDate: event.target.value })} /><input type="number" min="0" max="100" value={action.manualProgress} onChange={(event) => setAction({ ...action, manualProgress: Number(event.target.value) })} /><input type="number" min="0" max="100" value={action.automaticProgress} onChange={(event) => setAction({ ...action, automaticProgress: Number(event.target.value) })} /><input type="number" min="0" max="100" value={action.activityProgress} onChange={(event) => setAction({ ...action, activityProgress: Number(event.target.value) })} /><Button type="button" disabled={readOnly || !action.title} onClick={async () => { setRecord(await upsertInitialEvaluationAction(token, action as Partial<InitialEvaluationActionModel> & { title: string })); setAction({ title: '', description: '', responsible: '', dueDate: '', manualProgress: 0, automaticProgress: 0, activityProgress: 0, status: 'Open' }); }}>Agregar acción</Button></div>{record.actionPlan.map((item) => <article className="advanced-list__item" key={item.id}><strong>{item.title}</strong><p>{item.description}</p><div className="progress"><div style={{ width: `${item.progress}%` }} /></div><small>{item.progress}% · Manual {item.manualProgress}% · Automático {item.automaticProgress}% · Actividades {item.activityProgress}% · {item.status}</small></article>)}</section> : null}

      {tab === 'Indicadores' ? <section className="advanced-management__section"><h3>Indicadores</h3><div className="advanced-doc-grid"><article className="advanced-doc-card"><strong>Overall Compliance</strong><span>{record.overallCompliance}%</span></article><article className="advanced-doc-card"><strong>Open Findings</strong><span>{record.findings.filter((item) => item.status !== 'Closed').length}</span></article><article className="advanced-doc-card"><strong>Closed Findings</strong><span>{record.findings.filter((item) => item.status === 'Closed').length}</span></article><article className="advanced-doc-card"><strong>Pending Actions</strong><span>{pendingActions}</span></article></div><h4>Compliance by Chapter</h4>{chapterRows.map((row) => <p key={row.chapter}>{row.chapter}: {row.percentage}%</p>)}<h4>Findings by Severity</h4>{['Low', 'Medium', 'High', 'Critical'].map((severity) => <p key={severity}>{severity}: {record.findings.filter((item) => item.severity === severity).length}</p>)}<h4>Monthly Progress Trend</h4><p className="muted">Tendencia actual basada en cambios auditados y progreso de acciones: {Math.round(record.actionPlan.reduce((sum, item) => sum + item.progress, 0) / Math.max(record.actionPlan.length, 1))}%.</p></section> : null}

      {tab === 'Firma Gerencial' ? <section className="advanced-management__section"><h3>Firma Gerencial</h3><p className="muted">Sin firma MANAGER la evaluación queda pendiente y PHVA avanzado no puede marcarse como totalmente conforme.</p>{record.approval ? <div className="advanced-management__success">Aprobada por {record.approval.approvedByEmail} el {new Date(record.approval.approvedAt).toLocaleString()}. Documento: {record.approval.approvalDocumentUrl}</div> : <><div className="actions"><Button type="button" disabled={readOnly} onClick={async () => { setRecord(await submitInitialEvaluationApproval(token, 'Evaluación completada y enviada a aprobación ejecutiva.')); setMessage('Evaluación enviada a aprobación gerencial.'); }}>Enviar a aprobación</Button></div><div className="form-grid"><input placeholder="Nombre Representante Legal" value={signature.signerName} onChange={(event) => setSignature({ ...signature, signerName: event.target.value })} /><input placeholder="Correo" value={signature.signerEmail} onChange={(event) => setSignature({ ...signature, signerEmail: event.target.value })} /><textarea placeholder="Comentarios" value={signature.comments} onChange={(event) => setSignature({ ...signature, comments: event.target.value })} /><Button type="button" disabled={!signature.signerName} onClick={async () => { setRecord(await signInitialEvaluationApproval(token, signature)); setMessage('Firma digital gerencial registrada.'); onComplianceChange('COMPLIES'); }}>Firmar digitalmente (MANAGER)</Button></div></>}<h4>Resumen a firmar</h4><p>Resultados: {record.overallCompliance}% · Hallazgos: {record.findings.length} · Acciones: {record.actionPlan.length}</p></section> : null}

      {tab === 'Historial' ? <section className="advanced-management__section"><h3>Historial y trazabilidad</h3><table className="table"><thead><tr><th>Usuario</th><th>Fecha</th><th>Entidad</th><th>Campo</th><th>Anterior</th><th>Nuevo</th></tr></thead><tbody>{record.history.slice().reverse().map((item, index) => <tr key={`${item.date}-${index}`}><td>{item.userEmail || 'Sistema'}</td><td>{new Date(item.date).toLocaleString()}</td><td>{item.entity}</td><td>{item.field}</td><td>{item.previousValue}</td><td>{item.newValue}</td></tr>)}</tbody></table></section> : null}
    </div>
  );
}

function AdvancedManagementPanel({
  item,
  token,
  readOnly,
  onComplianceChange,
  onDirtyChange,
  saveRequest,
  discardRequest,
  onSaved,
}: {
  item: EvaluationEntry;
  token: string;
  readOnly?: boolean;
  onComplianceChange: (status: ResponsableSstComplianceStatus) => void;
  onDirtyChange: (dirty: boolean) => void;
  saveRequest: number;
  discardRequest: number;
  onSaved: () => void;
}) {
  if (item.code === '2.3.1') {
    return <InitialEvaluationAdvancedPanel token={token} readOnly={readOnly} onComplianceChange={onComplianceChange} onDirtyChange={onDirtyChange} />;
  }
  if (item.code === '2.4.1') {
    return <AnnualWorkPlanPanel token={token} readOnly={readOnly} onComplianceChange={onComplianceChange} onDirtyChange={onDirtyChange} saveRequest={saveRequest} discardRequest={discardRequest} onSaved={onSaved} />;
  }
  if (item.code === '2.2.1') {
    return <SstObjectivesAdvancedPanel token={token} readOnly={readOnly} onComplianceChange={onComplianceChange} onDirtyChange={onDirtyChange} saveRequest={saveRequest} discardRequest={discardRequest} onSaved={onSaved} />;
  }
  if (item.code === '2.1.1') {
    return <SstPolicyAdvancedPanel token={token} readOnly={readOnly} onComplianceChange={onComplianceChange} onDirtyChange={onDirtyChange} saveRequest={saveRequest} discardRequest={discardRequest} onSaved={onSaved} />;
  }
  if (item.code === '1.2.3') {
    return <AdvancedCourse50HoursPanel token={token} readOnly={readOnly} onComplianceChange={onComplianceChange} onDirtyChange={onDirtyChange} saveRequest={saveRequest} discardRequest={discardRequest} onSaved={onSaved} />;
  }
  if (item.code === '1.2.1') {
    return <TrainingManagementAdvancedPanel token={token} readOnly={readOnly} onComplianceChange={onComplianceChange} onDirtyChange={onDirtyChange} saveRequest={saveRequest} discardRequest={discardRequest} onSaved={onSaved} />;
  }
  if (item.code === '1.1.2') {
    return <ResponsibilitiesAdvancedPanel token={token} readOnly={readOnly} onComplianceChange={onComplianceChange} onDirtyChange={onDirtyChange} saveRequest={saveRequest} discardRequest={discardRequest} onSaved={onSaved} />;
  }
  if (item.code === '1.1.3') {
    return <ResourceAssignmentAdvancedPanel token={token} readOnly={readOnly} onComplianceChange={onComplianceChange} onDirtyChange={onDirtyChange} saveRequest={saveRequest} discardRequest={discardRequest} onSaved={onSaved} />;
  }
  if (item.code === '1.1.4') {
    return <ArlAffiliationsAdvancedPanel token={token} readOnly={readOnly} onComplianceChange={onComplianceChange} onDirtyChange={onDirtyChange} saveRequest={saveRequest} discardRequest={discardRequest} onSaved={onSaved} />;
  }
  if (item.code === '1.1.5') {
    return <SpecialPensionAdvancedPanel token={token} readOnly={readOnly} onComplianceChange={onComplianceChange} onDirtyChange={onDirtyChange} saveRequest={saveRequest} discardRequest={discardRequest} onSaved={onSaved} />;
  }
  if (item.code === '1.1.6') {
    return <CommitteeAdvancedPanel token={token} committeeType='COPASST' title='COPASST' onComplianceChange={onComplianceChange} />;
  }
  if (item.code === '1.1.8') {
    return <CommitteeAdvancedPanel token={token} committeeType='CONVIVENCIA' title='Comité de Convivencia Laboral' onComplianceChange={onComplianceChange} />;
  }
  const [form, setForm] = useState<AdvancedManagementForm>(initialAdvancedManagementForm);
  const [savedRecord, setSavedRecord] = useState<ResponsableSstAdvancedModel | null>(null);
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocuments>({});
  const [dirty, setDirty] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const dirtyRef = useRef(dirty);

  const hasDocument = (type: ResponsableSstDocumentType) => Boolean(pendingDocuments[type] || savedRecord?.documents.some((document) => document.type === type));
  const requires20HourUpdate = form.course50HoursDate ? isOlderThanThreeYears(form.course50HoursDate) : Boolean(savedRecord?.requires20HourUpdate);
  const badge = complianceBadge(savedRecord?.complianceStatus);

  const validations = useMemo(() => {
    const messages: string[] = [];
    const requiredFields: Array<[keyof AdvancedManagementForm, string]> = [
      ['fullName', 'Nombre completo'],
      ['documentNumber', 'Documento'],
      ['position', 'Cargo'],
      ['profession', 'Profesión'],
      ['sstProfessionalType', 'Tipo profesional SST'],
      ['sstLicenseNumber', 'Número licencia SST'],
      ['licenseExpiresAt', 'Fecha vencimiento licencia'],
      ['course50HoursDate', 'Fecha curso 50 horas'],
    ];

    requiredFields.forEach(([key, label]) => {
      if (!form[key].trim()) messages.push(`${label} es obligatorio.`);
    });

    if (!hasDocument('DIPLOMA')) messages.push('Diploma cargado es obligatorio.');
    if (!hasDocument('FIFTY_HOUR_CERTIFICATE')) messages.push('Certificado curso 50 horas cargado es obligatorio.');
    if (requires20HourUpdate && !form.course20HoursDate.trim()) messages.push('Fecha curso 20 horas es obligatoria porque el curso 50 horas tiene más de 3 años.');
    if (requires20HourUpdate && !hasDocument('TWENTY_HOUR_UPDATE_CERTIFICATE')) messages.push('Certificado actualización 20 horas es obligatorio porque el curso 50 horas tiene más de 3 años.');
    if (form.licenseExpiresAt && new Date(`${form.licenseExpiresAt}T00:00:00.000Z`) < new Date(new Date().toISOString().slice(0, 10))) messages.push('La licencia SST está expirada.');

    return messages;
  }, [form, pendingDocuments, requires20HourUpdate, savedRecord]);

  const quickBadges = [
    { label: 'Licencia vigente', ok: Boolean(form.licenseExpiresAt && new Date(`${form.licenseExpiresAt}T00:00:00.000Z`) >= new Date(new Date().toISOString().slice(0, 10))) },
    { label: 'Curso vigente', ok: Boolean(form.course50HoursDate && !requires20HourUpdate) },
    { label: 'Documentos completos', ok: hasDocument('DIPLOMA') && hasDocument('FIFTY_HOUR_CERTIFICATE') && (!requires20HourUpdate || hasDocument('TWENTY_HOUR_UPDATE_CERTIFICATE')) },
  ];

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    setLoading(true);
    fetchResponsableSstAdvanced(token)
      .then((record) => {
        if (ignore) return;
        setSavedRecord(record);
        if (!dirtyRef.current) {
          setForm({
            fullName: record.fullName ?? '',
            documentNumber: record.documentNumber ?? '',
            position: record.position ?? '',
            profession: record.profession ?? '',
            sstProfessionalType: record.sstProfessionalType ?? '',
            sstLicenseNumber: record.sstLicenseNumber ?? '',
            licenseExpiresAt: toDateInputValue(record.licenseExpiresAt),
            course50HoursDate: toDateInputValue(record.course50HoursDate),
            course50HoursDetectedDate: toDateInputValue(record.course50HoursDetectedDate),
            course20HoursDate: toDateInputValue(record.course20HoursDate),
          });
        }
        onComplianceChange(record.complianceStatus);
      })
      .catch((fetchError: Error) => setError(fetchError.message))
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [onComplianceChange, token]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  const updateField = (field: keyof AdvancedManagementForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setSuccess('');
  };

  const handleDocumentChange = (type: ResponsableSstDocumentType) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPendingDocuments((current) => ({ ...current, [type]: file }));
    setDirty(true);
    setSuccess('');

    if (type === 'FIFTY_HOUR_CERTIFICATE') {
      const detectedDate = detectDateFromFileName(file.name);
      if (detectedDate) {
        setForm((current) => ({ ...current, course50HoursDetectedDate: detectedDate, course50HoursDate: current.course50HoursDate || detectedDate }));
      }
    }
  };

  const save = async () => {
    setError('');
    setSuccess('');

    if (validations.length) {
      setError(validations.join(' '));
      return;
    }

    try {
      setLoading(true);
      let latestRecord = await updateResponsableSstAdvanced(token, {
        ...form,
        course20HoursDate: requires20HourUpdate ? form.course20HoursDate : '',
      });

      for (const [type, file] of Object.entries(pendingDocuments) as Array<[ResponsableSstDocumentType, File | undefined]>) {
        if (!file) continue;
        latestRecord = await uploadResponsableSstDocument(token, {
          type,
          file,
          finalUserDate: type === 'FIFTY_HOUR_CERTIFICATE' ? form.course50HoursDate : undefined,
        });
      }

      setSavedRecord(latestRecord);
      onComplianceChange(latestRecord.complianceStatus);
      setPendingDocuments({});
      setDirty(false);
      setShowCloseModal(false);
      setSuccess('Gestión avanzada guardada y sincronizada con el estado PHVA.');
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la gestión avanzada.');
    } finally {
      setLoading(false);
    }
  };

  const discard = () => {
    setPendingDocuments({});
    setDirty(false);
    setShowCloseModal(false);
    if (savedRecord) {
      setForm({
        fullName: savedRecord.fullName ?? '',
        documentNumber: savedRecord.documentNumber ?? '',
        position: savedRecord.position ?? '',
        profession: savedRecord.profession ?? '',
        sstProfessionalType: savedRecord.sstProfessionalType ?? '',
        sstLicenseNumber: savedRecord.sstLicenseNumber ?? '',
        licenseExpiresAt: toDateInputValue(savedRecord.licenseExpiresAt),
        course50HoursDate: toDateInputValue(savedRecord.course50HoursDate),
        course50HoursDetectedDate: toDateInputValue(savedRecord.course50HoursDetectedDate),
        course20HoursDate: toDateInputValue(savedRecord.course20HoursDate),
      });
    }
  };

  useEffect(() => {
    if (saveRequest > 0) void save();
  }, [saveRequest]);

  useEffect(() => {
    if (discardRequest > 0) discard();
  }, [discardRequest]);

  return (
    <div className="advanced-management">
      <section className="advanced-management__hero">
        <div>
          <p className="muted">Gestión avanzada del ítem {item.code}</p>
          <h3>Responsable SG-SST</h3>
        </div>
        <span className={badge.className}>{badge.label}</span>
      </section>

      <div className="advanced-management__badges">
        {quickBadges.map((quickBadge) => (
          <span key={quickBadge.label} className={`advanced-management__badge ${quickBadge.ok ? 'advanced-management__badge--success' : 'advanced-management__badge--warning'}`.trim()}>
            {quickBadge.ok ? '✅' : '⚠'} {quickBadge.label}
          </span>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="advanced-management__success">{success}</p> : null}
      {loading ? <p className="muted">Cargando información avanzada...</p> : null}

      <section className="advanced-management__section">
        <h3>Información general</h3>
        <div className="form-grid">
          <div className="grid grid-2">
            <label className="field"><span className="label">Nombre completo</span><input className="input" value={form.fullName} disabled={readOnly} onChange={(event) => updateField('fullName', event.target.value)} /></label>
            <label className="field"><span className="label">Nº Documento</span><input className="input" value={form.documentNumber} disabled={readOnly} onChange={(event) => updateField('documentNumber', event.target.value)} /></label>
          </div>
          <div className="grid grid-2">
            <label className="field"><span className="label">Cargo</span><input className="input" value={form.position} disabled={readOnly} onChange={(event) => updateField('position', event.target.value)} /></label>
            <label className="field"><span className="label">Profesión</span><input className="input" value={form.profession} disabled={readOnly} onChange={(event) => updateField('profession', event.target.value)} /></label>
          </div>
          <label className="field"><span className="label">Tipo profesional SST</span><input className="input" value={form.sstProfessionalType} disabled={readOnly} placeholder="Profesional SST / Posgrado SST" onChange={(event) => updateField('sstProfessionalType', event.target.value)} /></label>
          <div className="grid grid-2">
            <label className="field"><span className="label">Número licencia SST</span><input className="input" value={form.sstLicenseNumber} disabled={readOnly} onChange={(event) => updateField('sstLicenseNumber', event.target.value)} /></label>
            <label className="field"><span className="label">Fecha vencimiento licencia</span><input type="date" className="input" value={form.licenseExpiresAt} disabled={readOnly} onChange={(event) => updateField('licenseExpiresAt', event.target.value)} /></label>
          </div>
          <div className="grid grid-2">
            <label className="field"><span className="label">Fecha curso 50 horas</span><input type="date" className="input" value={form.course50HoursDate} disabled={readOnly} onChange={(event) => updateField('course50HoursDate', event.target.value)} /></label>
            <label className="field"><span className="label">Fecha detectada automáticamente</span><input type="date" className="input" value={form.course50HoursDetectedDate} disabled readOnly /></label>
          </div>
          {requires20HourUpdate ? (
            <label className="field"><span className="label">Fecha curso 20 horas</span><input type="date" className="input" value={form.course20HoursDate} disabled={readOnly} onChange={(event) => updateField('course20HoursDate', event.target.value)} /></label>
          ) : null}
        </div>
      </section>

      <section className="advanced-management__section">
        <h3>Documentos</h3>
        <div className="advanced-management__documents">
          {(['DIPLOMA', 'FIFTY_HOUR_CERTIFICATE'] as ResponsableSstDocumentType[]).concat(requires20HourUpdate ? ['TWENTY_HOUR_UPDATE_CERTIFICATE'] : []).map((type) => {
            const existing = savedRecord?.documents.find((document) => document.type === type);
            const pending = pendingDocuments[type];
            return (
              <label key={type} className="upload-zone">
                <input type="file" className="upload-zone__input" disabled={readOnly} onChange={handleDocumentChange(type)} />
                <span className="upload-zone__title">{documentLabels[type]}</span>
                <span className="muted">{type === 'FIFTY_HOUR_CERTIFICATE' ? 'Intentaremos detectar la fecha desde el nombre del archivo.' : 'PDF, imagen o documento editable.'}</span>
                {pending ? <span className="upload-zone__file">Pendiente: {pending.name}</span> : null}
                {!pending && existing ? <span className="upload-zone__file">Cargado: {existing.fileName}</span> : null}
              </label>
            );
          })}
        </div>
      </section>

      <section className="advanced-management__section">
        <h3>Validaciones requeridas</h3>
        {validations.length ? (
          <ul className="advanced-management__validations">{validations.map((message) => <li key={message}>{message}</li>)}</ul>
        ) : (
          <p className="advanced-management__success">Validaciones completas para guardar y sincronizar el punto {item.code}.</p>
        )}
        {savedRecord?.complianceReason ? <p className="muted">Resultado: {savedRecord.complianceReason}</p> : null}
      </section>

      <section className="advanced-management__section">
        <h3>Alertas y auditoría</h3>
        <div className="advanced-management__audit-list">
          {(savedRecord?.alerts ?? []).slice(0, 5).map((alert) => <p key={`${alert.type}-${alert.dueAt}`} className="muted">{alert.message} · {toDateInputValue(alert.dueAt)}</p>)}
          {(savedRecord?.auditHistory ?? []).slice(-5).reverse().map((entry) => (
            <p key={`${entry.changedAt}-${entry.field}`} className={entry.warning ? 'advanced-management__audit-warning' : 'muted'}>
              {entry.warning ? '⚠ ' : ''}{entry.field}: {entry.oldValue || '—'} → {entry.newValue || '—'} · {new Date(entry.changedAt).toLocaleString()}
            </p>
          ))}
        </div>
      </section>

      <div className="advanced-management__footer">
        {dirty ? <span className="advanced-management__dirty">Cambios sin guardar</span> : <span className="muted">Sin cambios pendientes</span>}
        <div className="actions">
          <Button type="button" variant="secondary" disabled={!dirty} onClick={() => setShowCloseModal(true)}>Descartar cambios</Button>
          <Button type="button" disabled={readOnly || loading} onClick={() => void save()}>Guardar</Button>
        </div>
      </div>

      <Modal isOpen={showCloseModal} title="Tienes cambios sin guardar" onClose={() => setShowCloseModal(false)}>
        <div className="form-grid">
          <p className="muted">Puedes guardar tus cambios, descartarlos o cancelar para seguir editando.</p>
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={() => void save()}>Guardar</Button>
            <Button type="button" variant="danger" onClick={discard}>Descartar</Button>
            <Button type="button" variant="secondary" onClick={() => setShowCloseModal(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ResourceAssignmentAdvancedPanel({ token, readOnly, onComplianceChange, onDirtyChange, saveRequest, discardRequest, onSaved }: { token: string; readOnly?: boolean; onComplianceChange: (status: ResponsableSstComplianceStatus) => void; onDirtyChange: (dirty: boolean) => void; saveRequest: number; discardRequest: number; onSaved: () => void }) {
  const [record, setRecord] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (!token) return; fetchResourceAssignmentAdvanced(token).then((r) => { setRecord(r); onComplianceChange(r.complianceStatus); }); }, [token, onComplianceChange]);
  const badge = complianceBadge(record?.complianceStatus);
  const updateRecord = (next: any) => { setRecord(next); setDirty(true); };
  const save = async () => {
    const saved = await updateResourceAssignmentAdvanced(token, record);
    setRecord(saved);
    onComplianceChange(saved.complianceStatus);
    setDirty(false);
    onSaved();
  };
  useEffect(() => { if (saveRequest > 0) void save(); }, [saveRequest]);
  useEffect(() => { if (discardRequest > 0) setDirty(false); }, [discardRequest]);
  if (!record) return <p className="muted">Cargando gestión avanzada...</p>;
  return <div className="advanced-management"><section className="advanced-management__hero"><h3>Asignación de Recursos SG-SST</h3><span className={badge.className}>{badge.label}</span></section><div className="advanced-management__badges">{['Presupuesto aprobado', 'Recursos asignados', 'Firma gerencial', 'Evidencias completas'].map((l) => <span key={l} className={`advanced-management__badge ${record.complianceStatus === 'COMPLIES' ? 'advanced-management__badge--success' : 'advanced-management__badge--warning'}`}>{record.complianceStatus === 'COMPLIES' ? '✅' : '⚠'} {l}</span>)}</div><section className="advanced-management__section"><h3>Recursos financieros</h3><table className="table"><thead><tr><th>Concepto</th><th>Descripción</th><th>Valor</th><th>Estado</th><th>Responsable</th><th>Fecha</th></tr></thead><tbody>{record.financialResources.map((row: any, i: number) => <tr key={i}><td><input className="input" disabled={readOnly} value={row.concept || ''} onChange={(e) => { const next = [...record.financialResources]; next[i] = { ...row, concept: e.target.value }; updateRecord({ ...record, financialResources: next }); }} /></td><td><input className="input" disabled={readOnly} value={row.description || ''} onChange={(e) => { const next = [...record.financialResources]; next[i] = { ...row, description: e.target.value }; updateRecord({ ...record, financialResources: next }); }} /></td><td><input className="input" disabled={readOnly} type="number" value={row.value || 0} onChange={(e) => { const next = [...record.financialResources]; next[i] = { ...row, value: Number(e.target.value) }; updateRecord({ ...record, financialResources: next }); }} /></td><td>{row.status || 'PENDIENTE'}</td><td><input className="input" disabled={readOnly} value={row.responsible || ''} onChange={(e) => { const next = [...record.financialResources]; next[i] = { ...row, responsible: e.target.value }; updateRecord({ ...record, financialResources: next }); }} /></td><td><input className="input" disabled={readOnly} type="date" value={toDateInputValue(row.date)} onChange={(e) => { const next = [...record.financialResources]; next[i] = { ...row, date: e.target.value }; updateRecord({ ...record, financialResources: next }); }} /></td></tr>)}</tbody></table><Button type="button" disabled={readOnly} onClick={() => updateRecord({ ...record, financialResources: [...record.financialResources, { concept: '', description: '', value: 0, status: 'PENDIENTE', responsible: '' }] })}>Agregar fila</Button></section><section className="advanced-management__section"><h3>Recursos humanos / técnicos / actividades</h3><p className="muted">Gestiona asignaciones usando employeeId, inventario técnico y actividades operativas SST.</p></section><section className="advanced-management__section"><h3>Aprobación gerencial</h3><label className="field"><span className="label">Firma digital (base64)</span><textarea className="input" disabled={readOnly} value={record.approval?.signatureImage || ''} onChange={(e) => updateRecord({ ...record, approval: { ...record.approval, signatureImage: e.target.value, approved: Boolean(e.target.value) } })} /></label></section><div className="advanced-management__footer"><div className="actions"><Button type="button" disabled={readOnly} onClick={() => void save()}>Guardar</Button></div></div></div>;
}

function ResponsibilitiesAdvancedPanel({ token, readOnly, onComplianceChange, onDirtyChange, saveRequest, discardRequest, onSaved }: { token: string; readOnly?: boolean; onComplianceChange: (status: ResponsableSstComplianceStatus) => void; onDirtyChange: (dirty: boolean) => void; saveRequest: number; discardRequest: number; onSaved: () => void }) {
  const defaults = useMemo(() => ([
    { category: 'Gerencia', role: 'MANAGER', title: 'Aprobar recursos SG-SST', employeeId: '', requiresSignature: true, active: true, status: 'PENDIENTE', signature: {} },
    { category: 'Gerencia', role: 'MANAGER', title: 'Revisar desempeño SST', employeeId: '', requiresSignature: true, active: true, status: 'PENDIENTE', signature: {} },
    { category: 'Responsable SST', role: 'ADMIN', title: 'Implementar SG-SST', employeeId: '', requiresSignature: true, active: true, status: 'PENDIENTE', signature: {} },
    { category: 'Trabajadores', role: 'MEMBER', title: 'Uso correcto EPP', employeeId: '', requiresSignature: true, active: true, status: 'PENDIENTE', signature: {} },
  ]), []);
  const [rows, setRows] = useState(defaults as any[]);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<ResponsableSstComplianceStatus>('PENDING');
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (!token) return; fetchResponsibilitiesAdvanced(token).then((r) => { setRows(r.responsibilities.length ? r.responsibilities as any[] : defaults); setStatus(r.complianceStatus); onComplianceChange(r.complianceStatus); }); }, [token, defaults, onComplianceChange]);
  const save = async () => { const saved = await updateResponsibilitiesAdvanced(token, rows as any); setStatus(saved.complianceStatus); onComplianceChange(saved.complianceStatus); setDirty(false); onSaved(); };
  useEffect(() => { if (saveRequest > 0) void save(); }, [saveRequest]);
  useEffect(() => { if (discardRequest > 0) { setRows(defaults); setDirty(false); } }, [discardRequest, defaults]);
  const badge = complianceBadge(status);
  return <div className="advanced-management"><section className="advanced-management__hero"><h3>Responsabilidades SG-SST</h3><span className={badge.className}>{badge.label}</span></section><p className="advanced-management__success">Tienes responsabilidades pendientes por firmar</p><table className="table"><thead><tr><th>Cargo / Rol</th><th>Responsabilidad</th><th>Usuario asignado</th><th>Requiere firma</th><th>Estado</th><th>Fecha firma</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.title}-${index}`}><td>{row.category} · {row.role}</td><td><input className="input" value={row.title} disabled={readOnly} onChange={(e) => { const next = [...rows]; next[index] = { ...row, title: e.target.value }; setRows(next); setDirty(true); }} /></td><td><input className="input" value={row.employeeId ?? ''} placeholder="employeeId" disabled={readOnly} onChange={(e) => { const next = [...rows]; next[index] = { ...row, employeeId: e.target.value }; setRows(next); setDirty(true); }} /></td><td>{row.requiresSignature ? 'Sí' : 'No'}</td><td>{row.status}</td><td>{row.signature?.signedAt ? new Date(row.signature.signedAt).toLocaleDateString() : 'Pendiente'}</td></tr>)}</tbody></table><div className="actions"><Button type="button" disabled={readOnly} onClick={() => { setRows([...rows, { category: 'COPASST', role: 'MEMBER', title: '', employeeId: '', requiresSignature: true, active: true, status: 'PENDIENTE', signature: {} }]); setDirty(true); }}>Agregar responsabilidad</Button><Button type="button" disabled={readOnly} onClick={() => void save()}>Guardar</Button></div></div>;
}

function ArlAffiliationsAdvancedPanel({ token, readOnly, onComplianceChange, onDirtyChange, saveRequest, discardRequest, onSaved }: { token: string; readOnly?: boolean; onComplianceChange: (status: ResponsableSstComplianceStatus) => void; onDirtyChange: (dirty: boolean) => void; saveRequest: number; discardRequest: number; onSaved: () => void }) {
  const [record, setRecord] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (!token) return; fetchArlAffiliationsAdvanced(token).then((r) => { setRecord(r); onComplianceChange(r.complianceStatus); }); }, [token, onComplianceChange]);
  const updateRecord = (next: any) => { setRecord(next); setDirty(true); };
  const save = async () => { const saved = await updateArlAffiliationsAdvanced(token, record); setRecord(saved); onComplianceChange(saved.complianceStatus); setDirty(false); onSaved(); };
  useEffect(() => { if (saveRequest > 0) void save(); }, [saveRequest]);
  useEffect(() => { if (discardRequest > 0) setDirty(false); }, [discardRequest]);
  if (!record) return <p className="muted">Cargando gestión avanzada...</p>;
  const badge = complianceBadge(record.complianceStatus);
  const rows = (record.employees || []).filter((r: any) => `${r.employeeName} ${r.document}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="advanced-management"><section className="advanced-management__hero"><h3>Afiliación al Sistema General de Riesgos Laborales</h3><span className={badge.className}>{badge.label}</span></section><div className="advanced-management__badges">{['Empleados afiliados', 'Seguridad social cargada', 'Alertas activas', 'Evidencias completas'].map((l: string) => <span key={l} className={`advanced-management__badge ${record.complianceStatus === 'COMPLIES' ? 'advanced-management__badge--success' : 'advanced-management__badge--warning'}`}>{record.complianceStatus === 'COMPLIES' ? '✅' : '⚠'} {l}</span>)}</div><section className="advanced-management__section"><h3>Afiliaciones por empleado</h3><div className="actions"><input className="input" placeholder="Buscar empleado o documento" value={search} onChange={(e) => setSearch(e.target.value)} /></div><table className="table"><thead><tr><th>Empleado</th><th>Documento</th><th>Cargo</th><th>ARL</th><th>Clase riesgo</th><th>Estado afiliación</th><th>Fecha afiliación</th><th>Fecha retiro</th><th>Seguridad social vigente</th><th>Evidencias</th></tr></thead><tbody>{rows.map((row: any, i: number) => <tr key={`${row.employeeId}-${i}`}><td><input className="input" disabled={readOnly} value={row.employeeName || ''} onChange={(e) => { const next=[...record.employees]; next[i]={...row, employeeName:e.target.value}; updateRecord({ ...record, employees: next }); }} /></td><td><input className="input" disabled={readOnly} value={row.document || ''} onChange={(e) => { const next=[...record.employees]; next[i]={...row, document:e.target.value}; updateRecord({ ...record, employees: next }); }} /></td><td><input className="input" disabled={readOnly} value={row.position || ''} onChange={(e) => { const next=[...record.employees]; next[i]={...row, position:e.target.value}; updateRecord({ ...record, employees: next }); }} /></td><td><input className="input" disabled={readOnly} value={row.arlName || ''} onChange={(e) => { const next=[...record.employees]; next[i]={...row, arlName:e.target.value}; updateRecord({ ...record, employees: next }); }} /></td><td><input className="input" disabled={readOnly} value={row.riskClass || ''} onChange={(e) => { const next=[...record.employees]; next[i]={...row, riskClass:e.target.value}; updateRecord({ ...record, employees: next }); }} /></td><td>{row.affiliationStatus || 'PENDING'}</td><td><input className="input" disabled={readOnly} type="date" value={toDateInputValue(row.affiliationDate)} onChange={(e) => { const next=[...record.employees]; next[i]={...row, affiliationDate:e.target.value}; updateRecord({ ...record, employees: next }); }} /></td><td><input className="input" disabled={readOnly} type="date" value={toDateInputValue(row.retirementDate)} onChange={(e) => { const next=[...record.employees]; next[i]={...row, retirementDate:e.target.value}; updateRecord({ ...record, employees: next }); }} /></td><td>{row.socialSecurityActive ? 'Sí' : 'No'}</td><td>{(row.evidences || []).length}</td></tr>)}</tbody></table><Button type="button" disabled={readOnly} onClick={() => updateRecord({ ...record, employees: [...(record.employees || []), { employeeId: `tmp-${Date.now()}`, employeeName: '', document: '', position: '', arlName: '', riskClass: '', affiliationStatus: 'PENDING', socialSecurityActive: false, evidences: [] }] })}>Agregar</Button></section><section className="advanced-management__section"><h3>Seguridad Social Empresa</h3><p className="muted">Gestiona PILA, planillas, soportes y certificados ARL a nivel compañía.</p></section><section className="advanced-management__section"><h3>Periodos seguridad social</h3><table className="table"><thead><tr><th>Periodo</th><th>Fecha pago</th><th>Estado</th><th>Documento soporte</th><th>Observaciones</th></tr></thead><tbody>{(record.socialSecurityPeriods || []).map((p: any, i: number) => <tr key={`${p.period}-${i}`}><td><input className="input" disabled={readOnly} value={p.period || ''} onChange={(e) => { const next=[...record.socialSecurityPeriods]; next[i]={...p, period:e.target.value}; updateRecord({ ...record, socialSecurityPeriods: next }); }} /></td><td><input className="input" disabled={readOnly} type="date" value={toDateInputValue(p.paymentDate)} onChange={(e) => { const next=[...record.socialSecurityPeriods]; next[i]={...p, paymentDate:e.target.value}; updateRecord({ ...record, socialSecurityPeriods: next }); }} /></td><td><input className="input" disabled={readOnly} value={p.status || ''} onChange={(e) => { const next=[...record.socialSecurityPeriods]; next[i]={...p, status:e.target.value}; updateRecord({ ...record, socialSecurityPeriods: next }); }} /></td><td><input className="input" disabled={readOnly} value={p.supportDocument || ''} onChange={(e) => { const next=[...record.socialSecurityPeriods]; next[i]={...p, supportDocument:e.target.value}; updateRecord({ ...record, socialSecurityPeriods: next }); }} /></td><td><input className="input" disabled={readOnly} value={p.observations || ''} onChange={(e) => { const next=[...record.socialSecurityPeriods]; next[i]={...p, observations:e.target.value}; updateRecord({ ...record, socialSecurityPeriods: next }); }} /></td></tr>)}</tbody></table></section><div className="advanced-management__footer"><Button type="button" disabled={readOnly} onClick={() => void save()}>Guardar</Button></div></div>;
}


function SpecialPensionAdvancedPanel({ token, readOnly, onComplianceChange, onDirtyChange, saveRequest, discardRequest, onSaved }: { token: string; readOnly?: boolean; onComplianceChange: (status: ResponsableSstComplianceStatus) => void; onDirtyChange: (dirty: boolean) => void; saveRequest: number; discardRequest: number; onSaved: () => void }) {
  const [record, setRecord] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { if (!token) return; fetchSpecialPensionAdvanced(token).then((r) => { setRecord(r); onComplianceChange(r.complianceStatus); }); }, [token, onComplianceChange]);
  const updateRecord = (next: any) => { setRecord(next); setDirty(true); };
  const save = async () => { const saved = await updateSpecialPensionAdvanced(token, record); setRecord(saved); onComplianceChange(saved.complianceStatus); setDirty(false); onSaved(); };
  useEffect(() => { if (saveRequest > 0) void save(); }, [saveRequest]);
  useEffect(() => { if (discardRequest > 0) setDirty(false); }, [discardRequest]);
  if (!record) return <p className="muted">Cargando gestión avanzada...</p>;
  const rows = (record.records || []).filter((r: any) => `${r.employeeName} ${r.position}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="advanced-management"><section className="advanced-management__hero"><h3>Cotización Especial de Pensión</h3><span className={complianceBadge(record.complianceStatus).className}>{complianceBadge(record.complianceStatus).label}</span></section><label className="field"><span className="label">¿La empresa maneja trabajadores con cotización especial de pensión?</span><select className="input" disabled={readOnly} value={record.enabled ? 'YES' : 'NO'} onChange={(e) => updateRecord({ ...record, enabled: e.target.value === 'YES' })}><option value="NO">No</option><option value="YES">Sí</option></select></label>{record.enabled ? <><div className="actions"><input className="input" placeholder="Buscar empleado o cargo" value={search} onChange={(e) => setSearch(e.target.value)} /></div><table className="table"><thead><tr><th>Empleado</th><th>Cargo</th><th>Tipo alto riesgo</th><th>Requiere cotización especial</th><th>Estado cotización</th><th>Fecha inicio</th><th>Observaciones</th><th>Documento soporte</th><th></th></tr></thead><tbody>{rows.map((row: any, i: number) => <tr key={`${row.employeeId}-${i}`}><td><input className="input" disabled={readOnly} value={row.employeeName || ''} onChange={(e) => { const next=[...record.records]; next[i]={...row, employeeName:e.target.value}; updateRecord({ ...record, records: next }); }} /></td><td><input className="input" disabled={readOnly} value={row.position || ''} onChange={(e) => { const next=[...record.records]; next[i]={...row, position:e.target.value}; updateRecord({ ...record, records: next }); }} /></td><td><input className="input" disabled={readOnly} value={row.highRiskType || ''} onChange={(e) => { const next=[...record.records]; next[i]={...row, highRiskType:e.target.value}; updateRecord({ ...record, records: next }); }} /></td><td>{row.requiresSpecialContribution ? 'Sí' : 'No'}</td><td><input className="input" disabled={readOnly} value={row.contributionStatus || ''} onChange={(e) => { const next=[...record.records]; next[i]={...row, contributionStatus:e.target.value}; updateRecord({ ...record, records: next }); }} /></td><td><input className="input" type="date" disabled={readOnly} value={toDateInputValue(row.startDate)} onChange={(e) => { const next=[...record.records]; next[i]={...row, startDate:e.target.value}; updateRecord({ ...record, records: next }); }} /></td><td><input className="input" disabled={readOnly} value={row.observations || ''} onChange={(e) => { const next=[...record.records]; next[i]={...row, observations:e.target.value}; updateRecord({ ...record, records: next }); }} /></td><td><input className="input" disabled={readOnly} value={row.supportDocument || ''} onChange={(e) => { const next=[...record.records]; next[i]={...row, supportDocument:e.target.value}; updateRecord({ ...record, records: next }); }} /></td><td><Button type="button" variant="danger" disabled={readOnly} onClick={() => updateRecord({ ...record, records: record.records.filter((_:any, idx:number) => idx !== i) })}>Quitar</Button></td></tr>)}</tbody></table><Button type="button" disabled={readOnly} onClick={() => updateRecord({ ...record, records: [...(record.records||[]), { employeeId: `tmp-${Date.now()}`, employeeName: '', position: '', highRiskType: '', requiresSpecialContribution: true, contributionStatus: 'PENDING', observations: '', supportDocument: '' }] })}>Agregar</Button><section className="advanced-management__section"><h3>Documentos</h3><p className="muted">Soporte cotización especial, Planilla seguridad social, PILA, Certificación fondo pensión, Documentos legales soporte.</p></section></> : <p className="muted">Cotización especial deshabilitada. Se omiten validaciones y cumplimiento asociado.</p>}<div className="advanced-management__footer"><Button type="button" disabled={readOnly} onClick={() => void save()}>Guardar</Button></div></div>;
}


function CommitteeAdvancedPanel({ token, committeeType, title, onComplianceChange }: { token: string; committeeType: 'COPASST'|'CONVIVENCIA'; title: string; onComplianceChange: (status: ResponsableSstComplianceStatus) => void }) {
  const [tab, setTab] = useState<'CONFORMACION'|'ELECCIONES'|'REUNIONES'|'REGLAMENTO'|'CONFIDENCIALIDAD'|'DOCUMENTOS'|'ALERTAS'|'HISTORIAL'>('CONFORMACION');
  const [period, setPeriod] = useState<any>(null); const [results, setResults] = useState<any>(null);
  useEffect(() => { if (!token) return; fetchCommitteeCurrent(token, committeeType).then((p) => { setPeriod(p); onComplianceChange(p.status === 'ACTIVO' && (p.members?.length||0) >= 4 ? 'COMPLIES' : 'PENDING'); }); }, [token, committeeType, onComplianceChange]);
  if (!period) return <p className='muted'>Cargando {title}...</p>;
  return <div className='advanced-management'><div className='actions' style={{gap:8,flexWrap:'wrap'}}>{['CONFORMACION','ELECCIONES','REUNIONES','REGLAMENTO','CONFIDENCIALIDAD','DOCUMENTOS','ALERTAS','HISTORIAL'].map((t)=><Button key={t} type='button' variant={tab===t?'primary':'secondary'} onClick={()=>setTab(t as any)}>{t}</Button>)}</div>{tab==='CONFORMACION'?<section><h3>Miembros {title}</h3><p className='muted'>Vigencia automática de 2 años. Estado: {period.status} · Inicio: {toDateInputValue(period.startDate)} · Fin: {toDateInputValue(period.endDate)}</p><table className='table'><thead><tr><th>Usuario</th><th>Cargo comité</th><th>Tipo representación</th><th>Principal/Suplente</th><th>Fecha inicio</th><th>Fecha fin</th><th>Estado</th></tr></thead><tbody>{(period.members||[]).map((m:any,i:number)=><tr key={i}><td>{m.userName}</td><td>{m.committeeRole}</td><td>{m.representationType}</td><td>{m.principalType}</td><td>{toDateInputValue(m.startDate)}</td><td>{toDateInputValue(m.endDate)}</td><td>{m.status}</td></tr>)}</tbody></table><Button type='button' onClick={async ()=>{const now=new Date().toISOString().slice(0,10); const next=await addCommitteeMember(token, period._id,{ userId:'000000000000000000000001', userName:'Pendiente asignar', committeeRole:'PRINCIPAL', representationType:'TRABAJADOR', principalType:'PRINCIPAL', startDate:now}); setPeriod(next);}}>Agregar miembro</Button></section>:null}{tab==='ELECCIONES'?<section><h3>Elecciones</h3><Button type='button' onClick={async()=>setResults(await fetchCommitteeResults(period._id))}>Ver resultados en tiempo real</Button>{results?<p>Total votos: {results.totalVotes} · Participación: {results.participation.toFixed(1)}%</p>:null}</section>:null}{tab==='REUNIONES'?<p className='muted'>Programación, actas mensuales, asistentes, firmas digitales y compromisos.</p>:null}{tab==='REGLAMENTO'?<p className='muted'>Versionado de reglamento, artículos y firmas de aceptación.</p>:null}{tab==='CONFIDENCIALIDAD'?<p className='muted'>Cláusulas versionadas, aceptación obligatoria y restricciones de acceso preparadas.</p>:null}{tab==='DOCUMENTOS'?<p className='muted'>Repositorio versionado de actas, reglamentos, acuerdos y evidencias.</p>:null}{tab==='ALERTAS'?<p className='muted'>Alertas por vencimientos, firmas pendientes, elecciones y confidencialidad.</p>:null}{tab==='HISTORIAL'?<table className='table'><thead><tr><th>Acción</th><th>Creado por</th><th>Fecha</th></tr></thead><tbody>{(period.auditHistory||[]).map((a:any,i:number)=><tr key={i}><td>{a.action}</td><td>{a.createdBy}</td><td>{new Date(a.createdAt).toLocaleString()}</td></tr>)}</tbody></table>:null}</div>;
}

function TrainingManagementAdvancedPanel({ token, readOnly, onComplianceChange, onDirtyChange, saveRequest, discardRequest, onSaved }: { token: string; readOnly?: boolean; onComplianceChange: (status: ResponsableSstComplianceStatus) => void; onDirtyChange: (dirty: boolean) => void; saveRequest: number; discardRequest: number; onSaved: () => void }) {
  const [record, setRecord] = useState<any>(null); const [dirty,setDirty]=useState(false); const [tab,setTab]=useState('Inducciones');
  useEffect(()=>{ onDirtyChange(dirty); },[dirty,onDirtyChange]);
  useEffect(()=>{ if(!token) return; fetchTrainingManagementAdvanced(token).then((r)=>{setRecord(r); onComplianceChange(r.complianceStatus);}); },[token,onComplianceChange]);
  const save=async()=>{ const saved=await updateTrainingManagementAdvanced(token, record); setRecord(saved); setDirty(false); onComplianceChange(saved.complianceStatus); onSaved(); };
  useEffect(()=>{ if(saveRequest>0) void save(); },[saveRequest]);
  useEffect(()=>{ if(discardRequest>0) setDirty(false); },[discardRequest]);
  if(!record) return <p className='muted'>Cargando gestión avanzada de capacitación...</p>;
  return <div className='advanced-management'><div className='actions' style={{gap:8,flexWrap:'wrap'}}>{['Inducciones','Reinducciones','Evaluaciones','Certificados','Evidencias','Alertas','Historial'].map((t)=><Button key={t} type='button' variant={tab===t?'primary':'secondary'} onClick={()=>setTab(t)}>{t}</Button>)}</div>
    {tab==='Inducciones'?<section><h3>Inducciones automáticas SG-SST</h3><p className='muted'>Alta de empleado genera inducción pendiente con responsable, fecha límite y checklist SST.</p><table className='table'><thead><tr><th>Empleado</th><th>Cargo/Área</th><th>Fecha</th><th>Responsable</th><th>Checklist SST</th><th>Evaluación</th><th>Firma</th><th>Evidencia</th><th>Estado</th></tr></thead><tbody>{(record.inductions||[]).map((r:any,i:number)=><tr key={i}><td>{r.employeeName || r.employeeId || '-'}</td><td>{r.position || '-'} / {r.area || '-'}</td><td>{toDateInputValue(r.scheduledDate)}</td><td>{r.responsible || '-'}</td><td>{(r.checklist||[]).length}</td><td>{r.evaluationStatus || 'Pendiente'}</td><td>{r.signatureStatus || 'Pendiente'}</td><td>{(r.evidences||[]).length}</td><td>{r.status || 'Pendiente'}</td></tr>)}</tbody></table></section>:null}
    {tab==='Reinducciones'?<section><h3>Reinducciones periódicas</h3><p className='muted'>Periodicidad configurable, cálculo automático anual y alertas de vencimiento para ADMIN/MANAGER/responsables.</p></section>:null}
    {tab==='Evaluaciones'?<section><h3>Evaluaciones estilo Moodle</h3><p className='muted'>Banco de preguntas, aleatorias, límite de tiempo, aprobación mínima, intentos y calificación automática.</p></section>:null}
    {tab==='Certificados'?<section><h3>Certificados digitales</h3><p className='muted'>Generación PDF con branding empresa, QR verificable y versionado histórico.</p></section>:null}
    {tab==='Evidencias'?<section><h3>Evidencias</h3><p className='muted'>Carga y visualización de PDF, Office, imágenes y videos vinculados al proceso.</p></section>:null}
    {tab==='Alertas'?<section><p className='muted'>Recordatorios automáticos: 30, 10, 8, 5, 2 días y vencida. Reprogramaciones notifican manager.</p><Button type='button' disabled={readOnly} onClick={async()=>{const saved=await approveTrainingManagementAdvanced(token,{status:'APPROVED',comments:'Aprobado gerencia'});setRecord(saved);onComplianceChange(saved.complianceStatus);}}>Aprobar gestión avanzada</Button></section>:null}
    {tab==='Historial'?<table className='table'><thead><tr><th>Acción</th><th>Usuario</th><th>Fecha</th></tr></thead><tbody>{(record.history||[]).map((h:any,i:number)=><tr key={i}><td>{h.action}</td><td>{h.createdBy}</td><td>{new Date(h.createdAt).toLocaleString()}</td></tr>)}</tbody></table>:<p className='muted'>Complete formularios por pestaña, adjunte evidencias multimedia y registre asistencia digital/escaneada.</p>}
  </div>;
}
function EvaluationSection({ title, items, children, sectionId, readOnly = false, onOpenAdvancedManagement }: { title: string; items: EvaluationEntry[]; children?: ReactNode; sectionId: string; readOnly?: boolean; onOpenAdvancedManagement?: (item: EvaluationEntry) => void }) {
  const { answers, missingCodes, sectionErrors, registerSection, setAnswerStatus } = useDocumentsEvaluation();

  useEffect(() => {
    registerSection(sectionId, { title, items: items.map((item) => ({ code: item.code, weight: item.weight })) });
  }, [items, registerSection, sectionId, title]);

  return (
    <Card title={title} className={sectionErrors.has(sectionId) ? 'card--error' : ''}>
      <div className="evaluation-list">
        {items.map((item, index) => (
          <div key={item.code} className="evaluation-list__row">
            <EvaluationItem
              {...item}
              status={(answers[item.code]?.status ?? '') as '' | 'Cumple totalmente' | 'No cumple' | 'No aplica'}
              hasError={missingCodes.has(item.code)}
              readOnly={readOnly}
              onStatusChange={(code, status) => setAnswerStatus(code, status)}
              headerAction={
                ['1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.8', '1.2.1', '1.2.2', '1.2.3', '2.1.1', '2.2.1', '2.3.1'].includes(item.code) ? (
                  <Button type="button" variant="ghost" className="advanced-management-trigger" onClick={() => onOpenAdvancedManagement?.(item)}>
                    ⚡ Entrar a Gestión avanzada
                  </Button>
                ) : null
              }
            />
            {index < items.length - 1 ? <hr className="evaluation-list__divider" /> : null}
          </div>
        ))}
      </div>
      {children}
    </Card>
  );
}

export function PlanPage({ readOnly = false, token = '' }: { readOnly?: boolean; token?: string }) {
  const navigate = useNavigate();
  const { totalCompliance, sectionCompliance, setAnswerStatus } = useDocumentsEvaluation();
  const [advancedManagementItem, setAdvancedManagementItem] = useState<EvaluationEntry | null>(null);
  const [advancedManagementDirty, setAdvancedManagementDirty] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [saveRequest, setSaveRequest] = useState(0);
  const [discardRequest, setDiscardRequest] = useState(0);
  const [closeAfterSave, setCloseAfterSave] = useState(false);

  const closeAdvancedManagement = () => {
    setAdvancedManagementItem(null);
    setShowUnsavedModal(false);
    setAdvancedManagementDirty(false);
    setCloseAfterSave(false);
  };

  const handleAdvancedComplianceChange = useCallback((status: ResponsableSstComplianceStatus) => {
    if (!advancedManagementItem) return;
    setAnswerStatus(advancedManagementItem.code, status === 'COMPLIES' ? 'Cumple totalmente' : 'No cumple');
  }, [setAnswerStatus, advancedManagementItem]);

  return (
    <div className="grid">
      <ComplianceProgress
        total={{ title: totalCompliance.title, percentage: totalCompliance.percentage }}
        sections={sectionCompliance.map((section) => ({ title: section.title, percentage: section.percentage }))}
      />
      {readOnly ? <p className="muted">Modo solo visualización para manager.</p> : null}
      <EvaluationSection
        title="Recursos financieros, técnicos, humanos... (4%)"
        items={financialResourcesItems}
        sectionId="plan-recursos"
        readOnly={readOnly}
        onOpenAdvancedManagement={setAdvancedManagementItem}
      />
      <EvaluationSection
        title="Capacitación en el SG-SST (6%)"
        items={trainingItems}
        sectionId="plan-capacitacion"
        readOnly={readOnly}
        onOpenAdvancedManagement={setAdvancedManagementItem}
      />
      <EvaluationSection title="Gestión Integral del SG-SST (15%)" items={integralManagementItems} sectionId="plan-gestion-integral" readOnly={readOnly} onOpenAdvancedManagement={setAdvancedManagementItem}>
        <div className="plan-next-action">
          <Button type="button" className="plan-next-action__button" onClick={() => navigate('/documents/do')}>
            Siguiente → Hacer
          </Button>
        </div>
      </EvaluationSection>
      <Sheet
        open={Boolean(advancedManagementItem)}
        title={advancedManagementItem ? `${advancedManagementItem.code} · ${advancedManagementItem.title}` : 'Gestión avanzada'}
        description="Panel lateral de mejora sin reemplazar el flujo simple de PHVA."
        onOpenChange={(open) => {
          if (!open && advancedManagementDirty) {
            setShowUnsavedModal(true);
            return;
          }
          if (!open) closeAdvancedManagement();
        }}
      >
        {advancedManagementItem ? (
          <AdvancedManagementPanel
            item={advancedManagementItem}
            token={token}
            readOnly={readOnly}
            onComplianceChange={handleAdvancedComplianceChange}
            onDirtyChange={setAdvancedManagementDirty}
            saveRequest={saveRequest}
            discardRequest={discardRequest}
            onSaved={() => {
              if (closeAfterSave) closeAdvancedManagement();
            }}
          />
        ) : null}
      </Sheet>
      <Modal isOpen={showUnsavedModal} title="Tienes cambios sin guardar" onClose={() => setShowUnsavedModal(false)}>
        <div className="form-grid">
          <p className="muted">Antes de cerrar la gestión avanzada, elige qué hacer con los cambios pendientes.</p>
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={() => { setCloseAfterSave(true); setSaveRequest((current) => current + 1); }}>Guardar</Button>
            <Button type="button" variant="danger" onClick={() => { setDiscardRequest((current) => current + 1); closeAdvancedManagement(); }}>Descartar</Button>
            <Button type="button" variant="secondary" onClick={() => setShowUnsavedModal(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
