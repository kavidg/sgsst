import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PhvaBackButton } from '../components/PhvaBackButton';
import { ContractingPanel } from '../components/contracting/ContractingPanel';

type Props = { token: string };

export function ContractingPage({ token }: Props) {
  const location = useLocation();
  const sourceParam = (location.state as Record<string, unknown> | null)?.source;
  const isFromPhva2101 = sourceParam === 'phva-2.10.1';

  const [, setComplianceStatus] = useState<string>('PENDING');

  return (
    <div className="acquisitions-page">
      <PhvaBackButton />
      {isFromPhva2101 && (
        <div style={{
          padding: '.5rem 1rem',
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '.375rem',
          fontSize: '.85rem',
          color: '#0369a1',
          marginBottom: '1rem',
        }}>
          📋 Gestión de Contratación — soporte para PHVA 2.10.1 «Contratación»
        </div>
      )}
      <ContractingPanel
        token={token}
        onComplianceChange={setComplianceStatus}
      />
    </div>
  );
}
