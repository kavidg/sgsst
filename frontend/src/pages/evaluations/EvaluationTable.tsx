import { EvaluationModel } from '../../api';
import { Table } from '../../components/ui/Table';

interface EvaluationTableProps {
  evaluations: EvaluationModel[];
  onToggleComplies: (evaluation: EvaluationModel, complies: boolean) => Promise<void>;
  onChangeObservation: (evaluation: EvaluationModel, observation: string) => Promise<void>;
}

export function EvaluationTable({ evaluations, onToggleComplies, onChangeObservation }: EvaluationTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <th>Estándar</th>
          <th>Descripción</th>
          <th style={{ textAlign: 'center' }}>Cumple</th>
          <th>Observación</th>
        </tr>
      </thead>
      <tbody>
        {evaluations.map((evaluation) => (
          <tr key={evaluation._id}>
            <td>{evaluation.standard}</td>
            <td>{evaluation.description}</td>
            <td style={{ textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={evaluation.complies}
                onChange={(event) => onToggleComplies(evaluation, event.target.checked)}
              />
            </td>
            <td>
              <input
                className="input"
                defaultValue={evaluation.observation ?? ''}
                onBlur={(event) => onChangeObservation(evaluation, event.target.value)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
