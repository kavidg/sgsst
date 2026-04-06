import { useNavigate } from 'react-router-dom';
import { EvaluationItem } from '../../components/EvaluationItem';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

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

function EvaluationSection({ title, items }: { title: string; items: EvaluationEntry[] }) {
  return (
    <Card title={title}>
      <div className="evaluation-list">
        {items.map((item, index) => (
          <div key={item.code} className="evaluation-list__row">
            <EvaluationItem {...item} />
            {index < items.length - 1 ? <hr className="evaluation-list__divider" /> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function DoPage() {
  const navigate = useNavigate();

  return (
    <div className="grid">
      <Card title="II. Hacer (60%)">
        <p className="muted">Gestión de la Salud (20%)</p>
      </Card>

      <EvaluationSection title="Condiciones de salud en el trabajo (9%)" items={condicionesSalud} />
      <EvaluationSection title="Registro e investigación (5%)" items={registroInvestigacion} />

      <Card title="Vigilancia de la salud (6%)">
        <div className="evaluation-list">
          {vigilanciaSalud.map((item, index) => (
            <div key={item.code} className="evaluation-list__row">
              <EvaluationItem {...item} />
              {index < vigilanciaSalud.length - 1 ? <hr className="evaluation-list__divider" /> : null}
            </div>
          ))}
        </div>

        <div className="plan-next-action">
          <Button type="button" className="plan-next-action__button" onClick={() => navigate('/documents/check')}>
            Siguiente → (siguiente módulo de Hacer)
          </Button>
        </div>
      </Card>
    </div>
  );
}
