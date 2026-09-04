import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PhvaBackButton } from '../components/PhvaBackButton';
import ChangeManagementPanel from '../components/change-management/ChangeManagementPanel';

type Props = { token: string };

export function ChangeManagementPage({ token }: Props) {
  const location = useLocation();
  const sourceParam = (location.state as Record<string, unknown> | null)?.source;
  const isFromPhva2111 = sourceParam === 'phva-2.11.1';

  const [, setComplianceStatus] = useState<string>('PENDING');

  return (
    <div className="acquisitions-page">
      <PhvaBackButton />
      {isFromPhva2111 && (
        <div style={{
          padding: '.5rem 1rem',
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '.375rem',
          fontSize: '.85rem',
          color: '#0369a1',
          marginBottom: '1rem',
        }}>
          📋 Gestión del Cambio — soporte para PHVA 2.11.1 «Gestión del cambio»
        </div>
      )}
      <ChangeManagementPanel
        token={token}
        onComplianceChange={setComplianceStatus}
      />
    </div>
  );
}
