import { EvaluationItem } from '../../components/EvaluationItem';
import { Card } from '../../components/ui/Card';

const evaluationItems = [
  {
    code: '1.1.1',
    title: 'Responsable del SG-SST',
    weight: 0.5,
    verificationMode: 'Documento firmado',
    criteria: 'Existe responsable designado',
  },
  {
    code: '1.1.2',
    title: 'Responsabilidades en SG-SST',
    weight: 0.5,
    verificationMode: 'Documento',
    criteria: 'Responsabilidades definidas',
  },
  {
    code: '1.1.3',
    title: 'Asignación de recursos',
    weight: 0.5,
    verificationMode: 'Presupuesto',
    criteria: 'Recursos asignados',
  },
  {
    code: '1.1.4',
    title: 'Afiliación a riesgos laborales',
    weight: 0.5,
    verificationMode: 'Certificado',
    criteria: 'Trabajadores afiliados',
  },
  {
    code: '1.1.5',
    title: 'Trabajadores alto riesgo',
    weight: 0.5,
    verificationMode: 'Listado',
    criteria: 'Identificación realizada',
  },
  {
    code: '1.1.6',
    title: 'Conformación COPASST',
    weight: 0.5,
    verificationMode: 'Acta',
    criteria: 'COPASST conformado',
  },
  {
    code: '1.1.7',
    title: 'Capacitación COPASST',
    weight: 0.5,
    verificationMode: 'Certificados',
    criteria: 'Capacitación realizada',
  },
  {
    code: '1.1.8',
    title: 'Comité de Convivencia',
    weight: 0.5,
    verificationMode: 'Acta',
    criteria: 'Comité conformado',
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
