import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import {
  getSocializationPublicData,
  openSocializationLink,
  trackSocializationSlideView,
  completeSocializationPresentation,
  signSocialization,
  SocializationPublicData,
} from '../api';

type Step = 'loading' | 'error' | 'presentation' | 'acknowledge' | 'sign' | 'completed';

export default function SocializationPage() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>('loading');
  const [data, setData] = useState<SocializationPublicData | null>(null);
  const [error, setError] = useState('');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewedSlides, setViewedSlides] = useState<number[]>([0]);
  const [viewingTime, setViewingTime] = useState(0);
  const [completionPercent, setCompletionPercent] = useState(0);
  const [hasRead, setHasRead] = useState(false);
  const [signatureMethod, setSignatureMethod] = useState<'TYPED' | 'DRAWN'>('TYPED');
  const [signatureData, setSignatureData] = useState('');
  const [signing, setSigning] = useState(false);
  const [signResult, setSignResult] = useState<any>(null);
  const timerRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const totalSlides = data?.presentation?.totalSlides || 5;

  // Load data
  useEffect(() => {
    if (!token) { setError('Token no proporcionado.'); setStep('error'); return; }
    getSocializationPublicData(token)
      .then(async (d) => {
        setData(d);
        // Open link
        await openSocializationLink(token);
        setStep('presentation');
      })
      .catch((err) => {
        setError(err.message || 'Enlace inválido o expirado.');
        setStep('error');
      });
  }, [token]);

  // Track viewing time
  useEffect(() => {
    if (step !== 'presentation') return;
    timerRef.current = setInterval(() => {
      setViewingTime((t) => t + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [step]);

  // Track slide view
  const trackSlide = useCallback(async (slide: number) => {
    if (!token) return;
    const newViewed = [...new Set([...viewedSlides, slide])];
    setViewedSlides(newViewed);
    setCurrentSlide(slide);
    const pct = Math.min(100, Math.round((newViewed.length / totalSlides) * 100));
    setCompletionPercent(pct);
    try {
      await trackSocializationSlideView(token, {
        currentSlide: slide,
        viewedSlides: newViewed,
        viewingTimeSeconds: viewingTime,
      });
    } catch { /* silent */ }
  }, [token, viewedSlides, viewingTime, totalSlides]);

  const handleCompletePresentation = async () => {
    if (!token) return;
    try {
      await completeSocializationPresentation(token, { viewingTimeSeconds: viewingTime });
      setStep('acknowledge');
    } catch { setStep('acknowledge'); }
  };

  const handleSign = async () => {
    if (!token || !hasRead) return;
    let sigValue = signatureData;
    if (signatureMethod === 'DRAWN' && canvasRef.current) {
      sigValue = canvasRef.current.toDataURL();
    }
    if (!sigValue) { return; }
    setSigning(true);
    try {
      const result = await signSocialization(token, {
        hasRead,
        signatureMethod,
        signatureData: sigValue,
        userAgent: navigator.userAgent,
        browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other',
        os: navigator.userAgent.includes('Mac') ? 'macOS' : navigator.userAgent.includes('Win') ? 'Windows' : 'Other',
      });
      setSignResult(result.evidence);
      setStep('completed');
    } catch (err: any) {
      setError(err.message || 'Error al firmar.');
    } finally { setSigning(false); }
  };

  // Canvas drawing
  const startDrawing = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = e.touches ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = e.touches ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.touches ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = e.touches ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) setSignatureData(canvas.toDataURL());
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData('');
  };

  // Styles
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    background: '#f3f4f6', fontFamily: 'system-ui, -apple-system, sans-serif',
  };
  const headerStyle: React.CSSProperties = {
    background: '#1e40af', color: 'white', padding: '1.25rem', textAlign: 'center',
  };
  const cardStyle: React.CSSProperties = {
    maxWidth: '480px', width: '92%', margin: '1rem auto',
    background: 'white', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.1)',
    padding: '1.5rem',
  };

  // Progress bar
  const progressBar = (percent: number) => (
    <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, marginBottom: '1rem', overflow: 'hidden' }}>
      <div style={{ width: `${percent}%`, height: '100%', background: percent >= 100 ? '#22c55e' : '#2563eb', borderRadius: 4, transition: 'width .3s ease' }} />
    </div>
  );

  if (step === 'loading') {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
          <p style={{ color: '#6b7280' }}>Cargando información...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div style={pageStyle}>
        <div style={headerStyle}>
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>Socialización SG-SST</h1>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '.5rem' }}>Enlace inválido o expirado</h2>
          <p style={{ color: '#6b7280', fontSize: '.9rem', marginBottom: '1rem' }}>{error}</p>
          <p style={{ color: '#9ca3af', fontSize: '.8rem' }}>Contacta al área de SST de tu empresa para recibir un nuevo enlace.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: '1.2rem' }}>📢 Socialización SG-SST</h1>
        <p style={{ margin: '.35rem 0 0', opacity: .85, fontSize: '.85rem' }}>
          Responsabilidades en Seguridad y Salud en el Trabajo
        </p>
        {data?.session && (
          <p style={{ margin: '.25rem 0 0', opacity: .7, fontSize: '.75rem' }}>
            v{data.session.documentVersion}
          </p>
        )}
      </header>

      {error && (
        <div style={{ ...cardStyle, padding: '.75rem', background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p style={{ margin: 0, color: '#dc2626', fontSize: '.85rem' }}>{error}</p>
          <Button type="button" variant="ghost" onClick={() => setError('')} style={{ marginTop: '.25rem' }}>Cerrar</Button>
        </div>
      )}

      {/* Step: Presentation */}
      {step === 'presentation' && (
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 .5rem', fontSize: '1.1rem' }}>
            {data?.presentation?.title || 'Presentación de Responsabilidades SG-SST'}
          </h2>
          {data?.presentation?.description && (
            <p className="muted" style={{ fontSize: '.85rem', marginBottom: '.75rem' }}>{data.presentation.description}</p>
          )}

          {progressBar(completionPercent)}

          <p style={{ fontSize: '.8rem', color: '#6b7280', marginBottom: '.5rem' }}>
            Diapositiva {currentSlide + 1} de {totalSlides} · {Math.round(viewingTime / 60)}:{String(viewingTime % 60).padStart(2, '0')} min
          </p>

          {/* Slide viewer */}
          <div style={{
            background: '#f9fafb', borderRadius: '12px', padding: '2rem 1rem',
            minHeight: '200px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            border: '2px solid #e5e7eb', marginBottom: '1rem',
          }}>
            {data?.presentation?.fileUrl ? (
              data.presentation.fileType === 'PDF' ? (
                <object data={data.presentation.fileUrl} type="application/pdf" style={{ width: '100%', height: '250px', borderRadius: '8px' }}>
                  <p style={{ color: '#6b7280', fontSize: '.85rem', textAlign: 'center' }}>Vista previa de PDF no disponible. <a href={data.presentation.fileUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Abrir PDF</a></p>
                </object>
              ) : data.presentation.fileType === 'IMAGE' ? (
                <img src={data.presentation.fileUrl} alt={`Slide ${currentSlide + 1}`} style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '8px', objectFit: 'contain' }} />
              ) : (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '.5rem' }}>📊</div>
                  <p style={{ color: '#6b7280', fontSize: '.85rem' }}>Presentación cargada. Descarga para ver: <a href={data.presentation.fileUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>Abrir archivo</a></p>
                </div>
              )
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>📄</div>
                <p style={{ color: '#6b7280', fontSize: '.9rem' }}>Revisa la información de responsabilidades SG-SST</p>
                <p style={{ color: '#9ca3af', fontSize: '.8rem' }}>Navega por las diapositivas usando los botones</p>
              </div>
            )}
          </div>

          {/* Navigation controls */}
          <div className="actions" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Button
              type="button"
              variant="secondary"
              disabled={currentSlide === 0}
              onClick={() => trackSlide(currentSlide - 1)}
              style={{ minWidth: '80px', padding: '.75rem 1rem', fontSize: '1rem' }}
            >
              ← Anterior
            </Button>
            <span style={{ fontSize: '.85rem', fontWeight: 600, color: '#6b7280' }}>
              {completionPercent}%
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={currentSlide >= totalSlides - 1 && completionPercent < 100}
              onClick={() => currentSlide < totalSlides - 1 ? trackSlide(currentSlide + 1) : null}
              style={{ minWidth: '80px', padding: '.75rem 1rem', fontSize: '1rem' }}
            >
              Siguiente →
            </Button>
          </div>

          {/* Slide dots */}
          <div className="actions" style={{ justifyContent: 'center', gap: '.35rem', marginBottom: '1rem' }}>
            {Array.from({ length: totalSlides }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => trackSlide(i)}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: '2px solid',
                  borderColor: viewedSlides.includes(i) ? '#22c55e' : '#d1d5db',
                  background: currentSlide === i ? '#2563eb' : viewedSlides.includes(i) ? '#22c55e' : '#fff',
                  color: currentSlide === i ? '#fff' : viewedSlides.includes(i) ? '#fff' : '#6b7280',
                  fontSize: '.7rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* Complete button */}
          {completionPercent >= 100 && (
            <Button type="button" onClick={handleCompletePresentation} style={{ width: '100%', padding: '.75rem', fontSize: '1rem' }}>
              ✅ He revisado toda la información — Continuar
            </Button>
          )}
          {completionPercent < 100 && (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '.8rem' }}>
              Navega por todas las diapositivas para continuar ({totalSlides - viewedSlides.length} restantes)
            </p>
          )}
        </div>
      )}

      {/* Step: Acknowledge */}
      {step === 'acknowledge' && (
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>📋 Declaración de conocimiento</h2>

          <div style={{
            padding: '1rem', background: '#f0fdf4', borderRadius: '12px',
            border: '1px solid #86efac', marginBottom: '1rem',
          }}>
            <p style={{ margin: 0, fontSize: '.9rem', lineHeight: 1.6 }}>
              <strong>Declaro que:</strong> He revisado el material de Socialización de Responsabilidades SG-SST, 
              comprendo mis responsabilidades y me comprometo a cumplirlas.
            </p>
          </div>

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: '.75rem',
            padding: '1rem', background: '#f9fafb', borderRadius: '12px',
            cursor: 'pointer', marginBottom: '1rem',
          }}>
            <input
              type="checkbox"
              checked={hasRead}
              onChange={(e) => setHasRead(e.target.checked)}
              style={{ marginTop: '.2rem', transform: 'scale(1.3)', flexShrink: 0 }}
            />
            <span style={{ fontSize: '.9rem', lineHeight: 1.4 }}>
              <strong>He leído y comprendido la información presentada.</strong>
            </span>
          </label>

          {hasRead && (
            <Button type="button" onClick={() => setStep('sign')} style={{ width: '100%', padding: '.75rem', fontSize: '1rem' }}>
              ✍ Continuar a la firma
            </Button>
          )}
        </div>
      )}

      {/* Step: Sign */}
      {step === 'sign' && (
        <div style={cardStyle}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>✍ Firma digital</h2>

          <div className="actions" style={{ marginBottom: '1rem', gap: '.5rem' }}>
            <Button
              type="button"
              variant={signatureMethod === 'TYPED' ? 'primary' : 'secondary'}
              onClick={() => setSignatureMethod('TYPED')}
              style={{ flex: 1, padding: '.75rem' }}
            >
              ⌨️ Escribir
            </Button>
            <Button
              type="button"
              variant={signatureMethod === 'DRAWN' ? 'primary' : 'secondary'}
              onClick={() => setSignatureMethod('DRAWN')}
              style={{ flex: 1, padding: '.75rem' }}
            >
              ✍️ Dibujar
            </Button>
          </div>

          {signatureMethod === 'TYPED' && (
            <input
              className="input"
              value={signatureData}
              onChange={(e) => setSignatureData(e.target.value)}
              placeholder="Escribe tu nombre completo"
              style={{ width: '100%', padding: '.75rem', fontSize: '1rem', borderRadius: '8px', marginBottom: '1rem' }}
              autoFocus
            />
          )}

          {signatureMethod === 'DRAWN' && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '.85rem', color: '#6b7280', marginBottom: '.5rem' }}>Dibuja tu firma</p>
              <canvas
                ref={canvasRef}
                width={400}
                height={120}
                style={{ width: '100%', height: '100px', border: '2px dashed #d1d5db', borderRadius: '12px', cursor: 'crosshair', touchAction: 'none' }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              <Button type="button" variant="ghost" onClick={clearCanvas} style={{ marginTop: '.25rem' }}>
                🗑️ Limpiar
              </Button>
            </div>
          )}

          <Button
            type="button"
            disabled={!signatureData || signing}
            onClick={handleSign}
            style={{ width: '100%', padding: '.75rem', fontSize: '1rem' }}
          >
            {signing ? 'Firmando...' : '✅ Firmar y completar'}
          </Button>
        </div>
      )}

      {/* Step: Completed */}
      {step === 'completed' && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>✅</div>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '.5rem' }}>¡Gracias!</h2>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            Tu participación ha sido registrada exitosamente.
          </p>

          {signResult && (
            <div style={{ textAlign: 'left', background: '#f0fdf4', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'grid', gap: '.5rem', fontSize: '.85rem' }}>
                <div><strong>Nombre:</strong> {signResult.employeeName}</div>
                <div><strong>Documento:</strong> {signResult.employeeIdentification}</div>
                <div><strong>Versión:</strong> v{signResult.documentVersion}</div>
                <div><strong>Fecha:</strong> {new Date(signResult.signedAt).toLocaleString()}</div>
                <div><strong>Visualización:</strong> {signResult.slideCompletionPercent}%</div>
                {signResult.totalViewingTimeSeconds > 0 && (
                  <div><strong>Tiempo:</strong> {Math.round(signResult.totalViewingTimeSeconds / 60)} min</div>
                )}
              </div>

              <div style={{ marginTop: '.75rem', padding: '.75rem', background: '#fff', borderRadius: '8px', textAlign: 'center', border: '1px solid #86efac' }}>
                <p style={{ margin: '0 0 .25rem', fontSize: '.75rem', color: '#6b7280' }}>Código único de verificación</p>
                <code style={{ fontSize: '1.3rem', fontWeight: 700, color: '#16a34a', letterSpacing: '2px' }}>
                  {signResult.verificationCode}
                </code>
              </div>
            </div>
          )}

          <p style={{ color: '#9ca3af', fontSize: '.8rem' }}>
            Puedes cerrar esta página. Recibirás un comprobante de tu participación.
          </p>
        </div>
      )}

      <footer style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '.75rem' }}>
        <p>Sistema de Gestión de Seguridad y Salud en el Trabajo</p>
      </footer>
    </div>
  );
}
