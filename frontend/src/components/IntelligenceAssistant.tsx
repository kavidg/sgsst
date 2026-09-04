import { useState, useCallback } from 'react';
import { queryAiOrchestrator } from '../api';
import type { AiOrchestratorResponse } from '../api';

type Props = {
  token: string;
};

const QUICK_QUESTIONS = [
  '¿Cómo está el cumplimiento general del SG-SST?',
  '¿Cuáles son los principales hallazgos?',
  '¿Qué estándares necesitan atención?',
  '¿Cómo está la gestión del cambio?',
  '¿Cómo está la contratación?',
  '¿Cómo están las adquisiciones?',
  '¿Qué debería mejorar la empresa?',
];

export function IntelligenceAssistant({ token }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiOrchestratorResponse | null>(null);

  const handleQuery = useCallback(async (question: string) => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await queryAiOrchestrator(token, question.trim());
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible procesar la consulta.');
    } finally {
      setLoading(false);
    }
  }, [token, loading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleQuery(query);
  };

  return (
    <div className="cai-card">
      <div className="cai-header">
        <span className="cai-header__icon">🤖</span>
        <div>
          <h4 className="cai-header__title">Asistente IA — SG-SST</h4>
          <p className="cai-header__subtitle">Consulta inteligente sobre cualquier estándar del sistema</p>
        </div>
      </div>

      {/* Quick suggestions */}
      {!result && !loading && (
        <div className="cai-section">
          <h5 className="cai-section__title">Preguntas sugeridas</h5>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '.5rem' }}>
            {QUICK_QUESTIONS.map((q, i) => (
              <button
                key={i}
                type="button"
                className="acq-badge"
                style={{
                  cursor: 'pointer',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #bfdbfe',
                  padding: '.375rem .75rem',
                  fontSize: '.8rem',
                  borderRadius: '9999px',
                  transition: 'background-color .15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#dbeafe'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#eff6ff'; }}
                onClick={() => { setQuery(q); void handleQuery(q); }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="acq-form" style={{ marginTop: '.75rem' }}>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <input
            className="input"
            placeholder="Escribe tu pregunta sobre el SG-SST..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
            style={{ flex: 1 }}
            aria-label="Consulta al asistente IA global"
          />
          <button
            type="submit"
            className="btn"
            disabled={loading || !query.trim()}
            style={{
              padding: '.5rem 1rem',
              backgroundColor: loading ? '#94a3b8' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '.375rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '.875rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '⏳ Consultando...' : '🔍 Consultar'}
          </button>
        </div>
      </form>

      {/* Loading */}
      {loading && (
        <div className="cai-skeleton" style={{ marginTop: '.75rem' }} />
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: '.75rem', padding: '.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '.375rem' }}>
          <p style={{ margin: 0, color: '#991b1b', fontSize: '.85rem' }}>❌ {error}</p>
          <button
            type="button"
            onClick={() => { setError(''); void handleQuery(query); }}
            style={{ marginTop: '.5rem', padding: '.25rem .75rem', fontSize: '.8rem', cursor: 'pointer', border: '1px solid #fecaca', borderRadius: '.25rem', background: '#fff', color: '#991b1b' }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Response */}
      {result && (
        <div className="cai-section" style={{ marginTop: '.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem', fontSize: '.75rem', color: '#64748b' }}>
            <span>📌 Módulo: <strong>{result.module}</strong></span>
            <span>•</span>
            <span>Confianza: <strong>{Math.round(result.confidence * 100)}%</strong></span>
          </div>

          <div style={{ padding: '.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '.375rem', marginBottom: '.75rem' }}>
            <p style={{ margin: 0, fontSize: '.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{result.response}</p>
          </div>

          {result.suggestions.length > 0 && (
            <div>
              <h5 className="cai-section__title">Acciones sugeridas por la IA</h5>
              <ul className="cai-list">
                {result.suggestions.map((s, i) => (
                  <li key={i} className="cai-list__item cai-list__item--win">
                    <span className="cai-list__check">✅</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => { setResult(null); setQuery(''); }}
            style={{ marginTop: '.75rem', padding: '.375rem .75rem', fontSize: '.8rem', cursor: 'pointer', border: '1px solid #e2e8f0', borderRadius: '.25rem', background: '#fff', color: '#475569' }}
          >
            🔄 Nueva consulta
          </button>
        </div>
      )}
    </div>
  );
}
