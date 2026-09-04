import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PhvaBackButton } from '../components/PhvaBackButton';
import CommunicationAdvancedPanel from '../components/CommunicationAdvancedPanel';
import type { ResponsableSstComplianceStatus } from '../api';

type Props = { token: string };

export function CommunicationPage({ token }: Props) {
  const location = useLocation();
  const sourceParam = (location.state as Record<string, unknown> | null)?.source;
  const isFromPhva281 = sourceParam === 'phva-2.8.1';

  const [, setComplianceStatus] = useState<ResponsableSstComplianceStatus>('PENDING');

  return (
    <div className="communication-page">
      <PhvaBackButton />
      {isFromPhva281 && (
        <div style={{
          padding: '.5rem 1rem',
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '.375rem',
          fontSize: '.85rem',
          color: '#0369a1',
          marginBottom: '1rem',
        }}>
          📋 Gestión de Comunicación — soporte para PHVA 2.8.1 «Comunicación»
        </div>
      )}
      <CommunicationAdvancedPanel
        token={token}
        readOnly={false}
        onComplianceChange={setComplianceStatus}
        onDirtyChange={() => {}}
        onSaved={() => {}}
      />
    </div>
  );
}
