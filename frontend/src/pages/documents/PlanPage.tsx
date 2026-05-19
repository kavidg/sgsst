import type { ReactNode } from 'react';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsableSstAdvancedModel,
  ResponsableSstComplianceStatus,
  ResponsableSstDocumentType,
  fetchResponsableSstAdvanced,
  fetchResponsibilitiesAdvanced,
  updateResponsableSstAdvanced,
  updateResponsibilitiesAdvanced,
  uploadResponsableSstDocument,
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
  if (item.code === '1.1.2') {
    return <ResponsibilitiesAdvancedPanel token={token} readOnly={readOnly} onComplianceChange={onComplianceChange} onDirtyChange={onDirtyChange} saveRequest={saveRequest} discardRequest={discardRequest} onSaved={onSaved} />;
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
                ['1.1.1', '1.1.2'].includes(item.code) ? (
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
    setAnswerStatus('1.1.1', status === 'COMPLIES' ? 'Cumple totalmente' : 'No cumple');
  }, [setAnswerStatus]);

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
      <EvaluationSection title="Capacitación en el SG-SST (6%)" items={trainingItems} sectionId="plan-capacitacion" readOnly={readOnly} />
      <EvaluationSection title="Gestión Integral del SG-SST (15%)" items={integralManagementItems} sectionId="plan-gestion-integral" readOnly={readOnly}>
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
