import { EvaluationItem } from '../../components/EvaluationItem';
import { Card } from '../../components/ui/Card';

const evaluationItems = [
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

export function PlanPage() {
  return (
    <Card title="Recursos financieros, técnicos, humanos... (4%)">
      <div className="evaluation-list">
        {evaluationItems.map((item, index) => (
          <div key={item.code} className="evaluation-list__row">
            <EvaluationItem {...item} />
            {index < evaluationItems.length - 1 ? <hr className="evaluation-list__divider" /> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
