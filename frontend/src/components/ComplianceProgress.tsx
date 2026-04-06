import { Card } from './ui/Card';

type ComplianceMetric = {
  title: string;
  percentage: number;
};

interface ComplianceProgressProps {
  total: ComplianceMetric;
  sections: ComplianceMetric[];
}

function ProgressRow({ title, percentage }: ComplianceMetric) {
  return (
    <div className="compliance-progress__row">
      <div className="compliance-progress__row-header">
        <span>{title}</span>
        <strong>{percentage}%</strong>
      </div>
      <div className="compliance-progress__bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
        <div className="compliance-progress__bar-fill" style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }} />
      </div>
    </div>
  );
}

export function ComplianceProgress({ total, sections }: ComplianceProgressProps) {
  return (
    <Card title="Cumplimiento SG-SST">
      <div className="compliance-progress">
        <ProgressRow {...total} />
        {sections.length ? <hr className="evaluation-list__divider" /> : null}
        {sections.map((section) => (
          <ProgressRow key={section.title} {...section} />
        ))}
      </div>
    </Card>
  );
}
