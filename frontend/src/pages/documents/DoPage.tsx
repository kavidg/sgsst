import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EvaluationItem } from '../../components/EvaluationItem';
import { ComplianceProgress } from '../../components/ComplianceProgress';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useDocumentsEvaluation } from './evaluationState';

type EvaluationEntry = {
  code: string;
  title: string;
  weight: number;
  modeReview: string;
  criteria: string;
};

const condicionesSalud: EvaluationEntry[] = [
  {
    code: '3.1.1',
    title: 'Perfil sociodemográfico actualizado',
    weight: 3,
    modeReview:
      'Verificar que la empresa cuente con una caracterización sociodemográfica de su población trabajadora y que se actualice como mínimo una vez al año o ante cambios relevantes en el personal.',
    criteria:
      'Existe perfil sociodemográfico documentado, actualizado y utilizado como insumo para la planificación de actividades de promoción y prevención en salud laboral.',
  },
  {
    code: '3.1.2',
    title: 'Exámenes médicos ocupacionales',
    weight: 3,
    modeReview:
      'Solicitar evidencias de exámenes médicos de ingreso, periódicos y de egreso según el riesgo del cargo, verificando cumplimiento de periodicidad y custodia de historias clínicas ocupacionales.',
    criteria:
      'La organización ejecuta evaluaciones médicas ocupacionales conforme a la normatividad y garantiza confidencialidad, trazabilidad y seguimiento de resultados.',
  },
  {
    code: '3.1.3',
    title: 'Seguimiento a recomendaciones médicas',
    weight: 3,
    modeReview:
      'Revisar el mecanismo para gestionar recomendaciones o restricciones médicas y confirmar evidencia de ajustes laborales, reubicaciones o controles implementados.',
    criteria:
      'Se evidencia gestión oportuna de recomendaciones médicas ocupacionales, con acciones documentadas y monitoreo de su efectividad.',
  },
];

const registroInvestigacion: EvaluationEntry[] = [
  {
    code: '3.2.1',
    title: 'Registro de ausentismo',
    weight: 2.5,
    modeReview:
      'Validar que exista consolidado de ausentismo por causa médica y no médica, con análisis periódico de tendencias y variables críticas (área, cargo, diagnóstico general).',
    criteria:
      'La empresa mantiene registro sistemático de ausentismo y utiliza la información para orientar decisiones de intervención en SST.',
  },
  {
    code: '3.2.2',
    title: 'Investigación de enfermedades laborales',
    weight: 2.5,
    modeReview:
      'Solicitar investigaciones de casos reportados de enfermedad laboral o sospecha, verificando análisis causal, medidas de intervención y seguimiento al cierre de acciones.',
    criteria:
      'Los eventos relacionados con enfermedad laboral se investigan de forma documentada, con planes de acción y verificación de eficacia.',
  },
];

const vigilanciaSalud: EvaluationEntry[] = [
  {
    code: '3.3.1',
    title: 'Programas de vigilancia epidemiológica',
    weight: 2,
    modeReview:
      'Revisar los PVE priorizados según matriz de peligros (biomecánico, psicosocial, químico u otros), su diseño metodológico, indicadores y ejecución.',
    criteria:
      'La organización implementa programas de vigilancia epidemiológica alineados con riesgos prioritarios y evidencia seguimiento de resultados.',
  },
  {
    code: '3.3.2',
    title: 'Medición y análisis de indicadores de salud',
    weight: 2,
    modeReview:
      'Verificar indicadores de salud laboral (incidencia, prevalencia, severidad, frecuencia de eventos y ausentismo) y su análisis para toma de decisiones.',
    criteria:
      'Se calcula, analiza y comunica periódicamente indicadores de salud laboral para definir acciones preventivas y correctivas.',
  },
  {
    code: '3.3.3',
    title: 'Intervención y seguimiento de casos',
    weight: 2,
    modeReview:
      'Evaluar soportes de intervención sobre casos identificados en vigilancia de la salud y evidencias de seguimiento por medicina laboral y SST.',
    criteria:
      'Existe gestión integral de casos de salud laboral con trazabilidad de acciones, responsables y verificación de cierre.',
  },
];

const identificacionPeligros: EvaluationEntry[] = [
  {
    code: '4.1.1',
    title: 'Metodología',
    weight: 4,
    modeReview:
      'Verificar que la organización cuente con una metodología documentada para la identificación de peligros, evaluación y valoración de riesgos, aplicable a todos los procesos y cargos.',
    criteria:
      'Existe metodología formal para identificar peligros y valorar riesgos, actualizada y aplicada de manera consistente en la organización.',
  },
  {
    code: '4.1.2',
    title: 'Participación trabajadores',
    weight: 4,
    modeReview:
      'Revisar evidencias de participación de trabajadores y representantes en la identificación de peligros y valoración de riesgos, incluyendo reuniones, inspecciones y reportes.',
    criteria:
      'La identificación de peligros incorpora participación activa de los trabajadores y deja trazabilidad de sus aportes.',
  },
  {
    code: '4.1.3',
    title: 'Sustancias peligrosas',
    weight: 3,
    modeReview:
      'Validar inventario de sustancias químicas peligrosas, hojas de datos de seguridad y controles implementados para su manipulación, almacenamiento y disposición.',
    criteria:
      'La empresa identifica y gestiona los riesgos asociados a sustancias peligrosas con soportes documentales y medidas de control.',
  },
  {
    code: '4.1.4',
    title: 'Mediciones ambientales',
    weight: 4,
    modeReview:
      'Solicitar mediciones higiénicas ambientales (físicos, químicos, biológicos u otros) según riesgos priorizados y verificar su periodicidad, análisis y acciones derivadas.',
    criteria:
      'Se realizan mediciones ambientales cuando aplica, con análisis de resultados y ejecución de acciones de intervención.',
  },
];

const medidasControl: EvaluationEntry[] = [
  {
    code: '4.2.1',
    title: 'Implementación medidas',
    weight: 2.5,
    modeReview:
      'Revisar el plan de intervención para riesgos priorizados y verificar implementación de controles de ingeniería, administrativos y de protección personal.',
    criteria:
      'La organización implementa medidas de prevención y control acordes con la jerarquía de controles y riesgos identificados.',
  },
  {
    code: '4.2.2',
    title: 'Verificación aplicación',
    weight: 2.5,
    modeReview:
      'Evaluar evidencias de seguimiento al cumplimiento y efectividad de las medidas implementadas mediante inspecciones, observaciones y registros.',
    criteria:
      'Existe verificación periódica de la aplicación de controles y seguimiento al cierre de hallazgos.',
  },
  {
    code: '4.2.3',
    title: 'Procedimientos e instructivos',
    weight: 2.5,
    modeReview:
      'Solicitar procedimientos e instructivos seguros para tareas críticas, verificando actualización, divulgación y comprensión por parte de los trabajadores.',
    criteria:
      'La empresa dispone de procedimientos e instructivos de trabajo seguro vigentes y aplicados en actividades de riesgo.',
  },
  {
    code: '4.2.4',
    title: 'Inspecciones',
    weight: 2.5,
    modeReview:
      'Revisar programa de inspecciones planeadas de seguridad, frecuencia, cobertura y seguimiento a condiciones subestándar detectadas.',
    criteria:
      'Se ejecutan inspecciones periódicas con registro de hallazgos, responsables y verificación de acciones correctivas.',
  },
  {
    code: '4.2.5',
    title: 'Mantenimiento',
    weight: 2.5,
    modeReview:
      'Verificar programa de mantenimiento preventivo y correctivo de equipos, instalaciones y herramientas con impacto en SST.',
    criteria:
      'La organización realiza mantenimiento con trazabilidad documental para prevenir fallas que generen riesgos laborales.',
  },
  {
    code: '4.2.6',
    title: 'EPP',
    weight: 2.5,
    modeReview:
      'Comprobar matriz de EPP por cargo o tarea, entrega, reposición, capacitación y supervisión del uso adecuado.',
    criteria:
      'Se gestiona integralmente el uso de EPP con criterios técnicos, registros de entrega y evidencia de uso efectivo.',
  },
];

const gestionAmenazas: EvaluationEntry[] = [
  {
    code: '5.1.1',
    title: 'Plan de emergencias',
    weight: 5,
    modeReview:
      'Revisar que exista plan de prevención, preparación y respuesta ante emergencias, con identificación de amenazas, recursos, rutas de evacuación, responsables y mecanismos de actualización.',
    criteria:
      'La organización cuenta con plan de emergencias documentado, socializado y actualizado, con acciones preventivas y procedimientos de respuesta definidos.',
  },
  {
    code: '5.1.2',
    title: 'Brigada de emergencia',
    weight: 5,
    modeReview:
      'Verificar la conformación de la brigada de emergencia, perfiles de brigadistas, capacitación, entrenamiento, simulacros y disponibilidad de equipos para atención de incidentes.',
    criteria:
      'Existe brigada de emergencia conformada y entrenada, con evidencias de preparación y capacidad de respuesta ante escenarios de emergencia.',
  },
];

function EvaluationSection({ title, items, children, sectionId }: { title: string; items: EvaluationEntry[]; children?: ReactNode; sectionId: string }) {
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
              onStatusChange={(code, status) => setAnswerStatus(code, status)}
            />
            {index < items.length - 1 ? <hr className="evaluation-list__divider" /> : null}
          </div>
        ))}
      </div>
      {children}
    </Card>
  );
}

export function DoPage() {
  const navigate = useNavigate();
  const { totalCompliance, sectionCompliance } = useDocumentsEvaluation();

  return (
    <div className="grid">
      <ComplianceProgress
        total={{ title: totalCompliance.title, percentage: totalCompliance.percentage }}
        sections={sectionCompliance.map((section) => ({ title: section.title, percentage: section.percentage }))}
      />
      <Card title="II. Hacer (60%)">
        <p className="muted">Gestión de la Salud (20%)</p>
      </Card>

      <EvaluationSection title="Condiciones de salud en el trabajo (9%)" items={condicionesSalud} sectionId="do-condiciones-salud" />
      <EvaluationSection title="Registro e investigación (5%)" items={registroInvestigacion} sectionId="do-registro-investigacion" />
      <EvaluationSection title="Vigilancia de la salud (6%)" items={vigilanciaSalud} sectionId="do-vigilancia-salud" />

      <Card title="Gestión de Peligros y Riesgos (30%)">
        <p className="muted">Control de peligros y riesgos prioritarios</p>
      </Card>
      <EvaluationSection title="Identificación de peligros (15%)" items={identificacionPeligros} sectionId="do-identificacion-peligros" />
      <EvaluationSection title="Medidas de prevención y control (15%)" items={medidasControl} sectionId="do-medidas-control" />

      <Card title="Gestión de Amenazas (10%)">
        <p className="muted">Prevención, preparación y respuesta ante emergencias</p>
      </Card>
      <EvaluationSection title="Plan de Prevención, Preparación y Respuesta ante Emergencias (10%)" items={gestionAmenazas} sectionId="do-gestion-amenazas">
        <div className="plan-next-action plan-next-action--between">
          <Button type="button" className="plan-next-action__button" variant="secondary" onClick={() => navigate('/documents/plan')}>
            ← Regresar (Planear)
          </Button>
          <Button type="button" className="plan-next-action__button" onClick={() => navigate('/documents/check')}>
            Siguiente → Verificar
          </Button>
        </div>
      </EvaluationSection>
    </div>
  );
}
