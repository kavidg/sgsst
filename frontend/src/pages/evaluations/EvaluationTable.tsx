import { EvaluationModel } from '../../api';

interface EvaluationTableProps {
  evaluations: EvaluationModel[];
  onToggleComplies: (evaluation: EvaluationModel, complies: boolean) => Promise<void>;
  onChangeObservation: (evaluation: EvaluationModel, observation: string) => Promise<void>;
}

export function EvaluationTable({ evaluations, onToggleComplies, onChangeObservation }: EvaluationTableProps) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Estándar</th>
          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Descripción</th>
          <th style={{ textAlign: 'center', borderBottom: '1px solid #ddd' }}>Cumple</th>
          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Observación</th>
        </tr>
      </thead>
      <tbody>
        {evaluations.map((evaluation) => (
          <tr key={evaluation._id}>
            <td style={{ padding: '0.5rem 0' }}>{evaluation.standard}</td>
            <td style={{ padding: '0.5rem 0' }}>{evaluation.description}</td>
            <td style={{ textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={evaluation.complies}
                onChange={(event) => onToggleComplies(evaluation, event.target.checked)}
              />
            </td>
            <td>
              <input
                style={{ width: '100%' }}
                defaultValue={evaluation.observation ?? ''}
                onBlur={(event) => onChangeObservation(evaluation, event.target.value)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
