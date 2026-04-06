import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EvaluationItem } from '../../components/EvaluationItem';
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

const actuarItems: EvaluationEntry[] = [
  {
    code: '7.1.1',
    title: 'Acciones preventivas y correctivas',
    weight: 2.5,
    modeReview:
      'Verificar evidencias de acciones preventivas y correctivas derivadas de hallazgos, con responsables, fechas y seguimiento al cierre.',
    criteria:
      'La organización define, ejecuta y verifica acciones preventivas y correctivas para evitar la recurrencia de no conformidades en el SG-SST.',
  },
  {
    code: '7.1.2',
    title: 'Acciones mejora alta dirección',
    weight: 2.5,
    modeReview:
      'Revisar decisiones de la alta dirección orientadas al mejoramiento continuo del SG-SST, incluyendo recursos, prioridades y metas.',
    criteria:
      'Se evidencian acciones de mejora aprobadas por la alta dirección con seguimiento a su implementación y efectividad.',
  },
  {
    code: '7.1.3',
    title: 'Acciones por accidentes',
    weight: 2.5,
    modeReview:
      'Solicitar investigaciones de accidentes e incidentes y validar que los planes de acción asociados se ejecuten y verifiquen.',
    criteria:
      'Los accidentes e incidentes generan acciones de mejora con análisis causal, responsables definidos y cierre documentado.',
  },
  {
    code: '7.1.4',
    title: 'Plan de mejoramiento',
    weight: 2.5,
    modeReview:
      'Validar la existencia de un plan de mejoramiento consolidado del SG-SST con priorización, cronograma, responsables e indicadores.',
    criteria:
      'Existe plan de mejoramiento del SG-SST implementado y monitoreado periódicamente para garantizar la mejora continua.',
  },
];

export function ActPage() {
  const navigate = useNavigate();
  const { answers, missingCodes, sectionErrors, registerSection, setAnswerStatus, validateAll } = useDocumentsEvaluation();

  useEffect(() => {
    registerSection(
      'act-mejoramiento',
      actuarItems.map((item) => item.code),
    );
  }, [registerSection]);

  const handleFinish = () => {
    const validationResult = validateAll();

    if (!validationResult.isValid) {
      window.alert('Faltan campos pendientes por diligenciar');
      return;
    }

    console.log('Form ready');
  };

  return (
    <div className="grid">
      <Card title="Mejoramiento (10%)" className={sectionErrors.has('act-mejoramiento') ? 'card--error' : ''}>
        <div className="evaluation-list">
          {actuarItems.map((item, index) => (
            <div key={item.code} className="evaluation-list__row">
              <EvaluationItem
                {...item}
                status={(answers[item.code]?.status ?? '') as '' | 'Cumple totalmente' | 'No cumple' | 'No aplica'}
                hasError={missingCodes.has(item.code)}
                onStatusChange={(code, status) => setAnswerStatus(code, status)}
              />
              {index < actuarItems.length - 1 ? <hr className="evaluation-list__divider" /> : null}
            </div>
          ))}
        </div>

        <div className="plan-next-action plan-next-action--between">
          <Button type="button" className="plan-next-action__button" variant="secondary" onClick={() => navigate('/documents/check')}>
            ← Regresar (Verificar)
          </Button>
          <Button type="button" className="plan-next-action__button" onClick={handleFinish}>
            Finalizar
          </Button>
        </div>
      </Card>
    </div>
  );
}
