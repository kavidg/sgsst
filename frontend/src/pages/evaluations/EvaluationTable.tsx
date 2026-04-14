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
          <th className="border border-black p-3">Estándar</th>
          <th className="border border-black p-3">Descripción</th>
          <th className="border border-black p-3" style={{ textAlign: 'center' }}>Cumple</th>
          <th className="border border-black p-3">Observación</th>
        </tr>
      </thead>
      <tbody>
        {evaluations.map((evaluation) => (
          <tr key={evaluation._id}>
            <td className="border border-black p-3">{evaluation.standard}</td>
            <td className="border border-black p-3">{evaluation.description}</td>
            <td className="border border-black p-3" style={{ textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={evaluation.complies}
                onChange={(event) => onToggleComplies(evaluation, event.target.checked)}
              />
            </td>
            <td className="border border-black p-3">
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
