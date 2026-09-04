import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PhvaBackButton } from '../components/PhvaBackButton';
import AcquisitionsAdvancedPanel from '../components/AcquisitionsAdvancedPanel';

type Props = { token: string };

export function AcquisitionsPage({ token }: Props) {
  const location = useLocation();
  const sourceParam = (location.state as Record<string, unknown> | null)?.source;
  const isFromPhva291 = sourceParam === 'phva-2.9.1';

  const [, setComplianceStatus] = useState<string>('PENDING');

  return (
    <div className="acquisitions-page">
      <PhvaBackButton />
      {isFromPhva291 && (
        <div style={{
          padding: '.5rem 1rem',
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '.375rem',
          fontSize: '.85rem',
          color: '#0369a1',
          marginBottom: '1rem',
        }}>
          📋 Gestión de Adquisiciones — soporte para PHVA 2.9.1 «Adquisiciones»
        </div>
      )}
      <AcquisitionsAdvancedPanel
        token={token}
        onComplianceChange={setComplianceStatus}
      />
    </div>
  );
}
