import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EvaluationItem } from '../../components/EvaluationItem';
import { ComplianceProgress } from '../../components/ComplianceProgress';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
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
  responsibleName: string;
  licenseNumber: string;
  assignmentDate: string;
  courseExpiresAt: string;
  evidenceFileName: string;
  appointmentDocument: boolean;
  resumeSupports: boolean;
  validLicense: boolean;
  fiftyHourCourse: boolean;
};

const initialAdvancedManagementForm: AdvancedManagementForm = {
  responsibleName: '',
  licenseNumber: '',
  assignmentDate: '',
  courseExpiresAt: '',
  evidenceFileName: '',
  appointmentDocument: false,
  resumeSupports: false,
  validLicense: false,
  fiftyHourCourse: false,
};


function AdvancedManagementPanel({ item }: { item: EvaluationEntry }) {
  const [form, setForm] = useState<AdvancedManagementForm>(initialAdvancedManagementForm);

  const validationMessages = useMemo(() => {
    const messages: string[] = [];

    if (!form.responsibleName.trim()) messages.push('Registra el nombre del responsable asignado.');
    if (!form.licenseNumber.trim()) messages.push('La licencia SST vigente es obligatoria.');
    if (!form.appointmentDocument) messages.push('Adjunta o confirma el acto de designación con responsabilidades.');
    if (!form.validLicense || !form.fiftyHourCourse) messages.push('Valida licencia vigente y curso virtual de 50 horas.');

    return messages;
  }, [form]);

  const checklist = [
    { key: 'appointmentDocument', label: 'Acto de designación firmado y con responsabilidades definidas' },
    { key: 'resumeSupports', label: 'Hoja de vida con soportes académicos y experiencia en SST' },
    { key: 'validLicense', label: 'Licencia de Seguridad y Salud en el Trabajo vigente' },
    { key: 'fiftyHourCourse', label: 'Certificado del curso virtual de 50 horas del SG-SST' },
  ] as const;

  return (
    <div className="advanced-management">
      <section className="advanced-management__alert" role="alert">
        <strong>Alerta de control documental:</strong> la asignación del responsable del SG-SST solo debe marcarse como lista cuando exista trazabilidad del nombramiento, perfil y soportes vigentes.
      </section>

      <section className="advanced-management__section">
        <h3>Formulario detallado</h3>
        <div className="form-grid">
          <label className="field">
            <span className="label">Responsable asignado</span>
            <input
              className="input"
              value={form.responsibleName}
              onChange={(event) => setForm((current) => ({ ...current, responsibleName: event.target.value }))}
              placeholder="Nombre completo"
            />
          </label>
          <label className="field">
            <span className="label">Número de licencia SST</span>
            <input
              className="input"
              value={form.licenseNumber}
              onChange={(event) => setForm((current) => ({ ...current, licenseNumber: event.target.value }))}
              placeholder="Ej. Resolución / licencia"
            />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span className="label">Fecha de asignación</span>
              <input
                type="date"
                className="input"
                value={form.assignmentDate}
                onChange={(event) => setForm((current) => ({ ...current, assignmentDate: event.target.value }))}
              />
            </label>
            <label className="field">
              <span className="label">Vigencia del curso 50 horas</span>
              <input
                type="date"
                className="input"
                value={form.courseExpiresAt}
                onChange={(event) => setForm((current) => ({ ...current, courseExpiresAt: event.target.value }))}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="advanced-management__section">
        <h3>Carga de evidencias</h3>
        <label className="upload-zone">
          <input
            type="file"
            className="upload-zone__input"
            onChange={(event) => setForm((current) => ({ ...current, evidenceFileName: event.target.files?.[0]?.name ?? '' }))}
          />
          <span className="upload-zone__title">Subir designación, hoja de vida, licencia o certificado</span>
          <span className="muted">PDF, imagen o documento editable.</span>
          {form.evidenceFileName ? <span className="upload-zone__file">Archivo: {form.evidenceFileName}</span> : null}
        </label>
      </section>

      <section className="advanced-management__section">
        <h3>Lista de verificación avanzada</h3>
        <div className="advanced-management__checklist">
          {checklist.map((check) => (
            <label key={check.key} className="advanced-management__check">
              <input
                type="checkbox"
                checked={form[check.key]}
                onChange={(event) => setForm((current) => ({ ...current, [check.key]: event.target.checked }))}
              />
              <span>{check.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="advanced-management__section">
        <h3>Validaciones avanzadas</h3>
        {validationMessages.length ? (
          <ul className="advanced-management__validations">
            {validationMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : (
          <p className="advanced-management__success">Validaciones mínimas completas para revisión del punto {item.code}.</p>
        )}
      </section>

      <section className="advanced-management__section advanced-management__related">
        <h3>Información relacionada</h3>
        <p className="muted whitespace-pre-line">{item.criteria}</p>
        <p className="muted whitespace-pre-line">{item.modeReview}</p>
      </section>
    </div>
  );
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
                item.code === '1.1.1' ? (
                  <Button type="button" variant="ghost" className="advanced-management-trigger" onClick={() => onOpenAdvancedManagement?.(item)}>
                    Entrar a Gestión avanzada
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

export function PlanPage({ readOnly = false }: { readOnly?: boolean }) {
  const navigate = useNavigate();
  const { totalCompliance, sectionCompliance } = useDocumentsEvaluation();
  const [advancedManagementItem, setAdvancedManagementItem] = useState<EvaluationEntry | null>(null);

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
          if (!open) setAdvancedManagementItem(null);
        }}
      >
        {advancedManagementItem ? <AdvancedManagementPanel item={advancedManagementItem} /> : null}
      </Sheet>
    </div>
  );
}
