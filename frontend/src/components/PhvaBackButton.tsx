import { useNavigate } from 'react-router-dom';

/**
 * Reusable "← Volver al PHVA" button.
 *
 * Used across advanced management pages (2.5.1, 2.6.1, 2.7.1, 2.8.1) to
 * provide a consistent navigation path back to the PHVA evaluation view.
 *
 * Usage:
 *   <PhvaBackButton />
 */
export function PhvaBackButton() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/documents/plan')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '.35rem',
        padding: '.4rem .75rem',
        marginBottom: '.75rem',
        fontSize: '.85rem',
        color: '#0369a1',
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '.375rem',
        cursor: 'pointer',
        fontWeight: 500,
        transition: 'background .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#e0f2fe'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#f0f9ff'; }}
      aria-label="Volver al PHVA"
    >
      ← Volver al PHVA
    </button>
  );
}
