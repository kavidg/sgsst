import { useEffect, useState } from 'react';
import {
  ComplianceResponse,
  EvaluationModel,
  createEvaluation,
  fetchComplianceByCompany,
  fetchEvaluationsByCompany,
  updateEvaluation,
} from '../../api';
import { Card } from '../../components/ui/Card';
import { EvaluationForm } from './EvaluationForm';
import { EvaluationTable } from './EvaluationTable';

const baseStandards = [
  { standard: '1.1.1', description: 'Política SST' },
  { standard: '1.1.2', description: 'Objetivos SST' },
  { standard: '1.2.1', description: 'Responsabilidades SST' },
  { standard: '2.1.1', description: 'Identificación de peligros' },
  { standard: '2.2.1', description: 'Evaluación de riesgos' },
];

interface EvaluationsPageProps {
  token: string;
  companyId: string;
}

export function EvaluationsPage({ token, companyId }: EvaluationsPageProps) {
  const [evaluations, setEvaluations] = useState<EvaluationModel[]>([]);
  const [compliance, setCompliance] = useState<ComplianceResponse>({ total: 0, complies: 0, percentage: 0 });
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!token || !companyId) {
      return;
    }

    setLoading(true);
    try {
      let currentEvaluations = await fetchEvaluationsByCompany(token, companyId);

      if (currentEvaluations.length === 0) {
        for (const standard of baseStandards) {
          await createEvaluation(token, {
            companyId,
            standard: standard.standard,
            description: standard.description,
            complies: false,
            observation: '',
          });
        }
        currentEvaluations = await fetchEvaluationsByCompany(token, companyId);
      }

      const complianceData = await fetchComplianceByCompany(token, companyId);

      setEvaluations(currentEvaluations);
      setCompliance(complianceData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token, companyId]);

  const handleToggleComplies = async (evaluation: EvaluationModel, complies: boolean) => {
    await updateEvaluation(token, evaluation._id, { complies });
    await loadData();
  };

  const handleObservationChange = async (evaluation: EvaluationModel, observation: string) => {
    if ((evaluation.observation ?? '') === observation) {
      return;
    }

    await updateEvaluation(token, evaluation._id, { observation });
    await loadData();
  };

  const handleAddStandard = async ({ standard, description }: { standard: string; description: string }) => {
    await createEvaluation(token, {
      companyId,
      standard,
      description,
      complies: false,
      observation: '',
    });
    await loadData();
  };

  return (
    <Card title="Evaluación SG-SST">
      <p style={{ marginTop: 0 }}><strong>Cumplimiento SG-SST: {compliance.percentage}%</strong></p>
      {loading ? <p className="muted">Cargando evaluaciones...</p> : null}
      <EvaluationForm onAdd={handleAddStandard} />
      <EvaluationTable
        evaluations={evaluations}
        onToggleComplies={handleToggleComplies}
        onChangeObservation={handleObservationChange}
      />
    </Card>
  );
}
