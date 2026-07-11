import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  fetchPublicWorkerByToken,
  validatePublicIdentity,
  sendPublicOtp,
  validatePublicOtp,
  fetchPublicDocument,
  signPublicDocument,
} from '../api';
import { Button } from '../components/ui/Button';

type Step = 'loading' | 'error' | 'identity' | 'otp' | 'document' | 'sign' | 'completed';

export function WorkerSignPage() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>('loading');
  const [worker, setWorker] = useState<{ name: string; identification: string; position?: string; area?: string } | null>(null);
  const [document, setDocument] = useState<any>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [identification, setIdentification] = useState('');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [hasRead, setHasRead] = useState(false);
  const [signatureData, setSignatureData] = useState('');
  const [signatureMethod, setSignatureMethod] = useState<'TYPED' | 'DRAWN'>('TYPED');
  const [signing, setSigning] = useState(false);
  const [signResult, setSignResult] = useState<any>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (!token) { setError('Token no proporcionado.'); setStep('error'); return; }
    fetchPublicWorkerByToken(token)
      .then((data) => {
        setWorker(data.worker);
        setStep('identity');
      })
      .catch((err) => {
        setError(err.message || 'Token inválido o expirado.');
        setStep('error');
      });
  }, [token]);

  const handleValidateIdentity = async () => {
    if (!token || !identification) return;
    try {
      const result = await validatePublicIdentity(token, identification, phone || undefined);
      if (result.valid) {
        setWorker(result.worker);
        setStep('otp');
      }
    } catch (err: any) {
      setError(err.message || 'Identificación no válida.');
    }
  };

  const handleSendOtp = async () => {
    if (!token) return;
    try {
      const result = await sendPublicOtp(token);
      if (!result.required) {
        // OTP not required, skip to document
        await loadDocument();
        return;
      }
      setOtpSent(true);
      setMessage(result.message);
    } catch (err: any) {
      setError(err.message || 'Error al enviar OTP.');
    }
  };

  const handleValidateOtp = async () => {
    if (!token || !otpCode) return;
    try {
      await validatePublicOtp(token, otpCode);
      await loadDocument();
    } catch (err: any) {
      setError(err.message || 'Código OTP inválido.');
    }
  };

  const loadDocument = async () => {
    if (!token) return;
    try {
      const doc = await fetchPublicDocument(token);
      setDocument(doc);
      setStep('document');
    } catch (err: any) {
      setError(err.message || 'Error al cargar documento.');
      setStep('error');
    }
  };

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2;
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
    if (canvas) {
      setSignatureData(canvas.toDataURL());
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData('');
  };

  const handleSign = async () => {
    if (!token) return;
    setSigning(true);
    try {
      const payload: any = { hasRead };
      payload.signatureMethod = signatureMethod;
      if (signatureMethod === 'TYPED') payload.signatureData = signatureData;
      else if (signatureMethod === 'DRAWN') payload.signatureData = signatureData;
      payload.ipAddress = '';
      payload.userAgent = navigator.userAgent;
      payload.browser = navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other';
      payload.os = navigator.userAgent.includes('Mac') ? 'macOS' : navigator.userAgent.includes('Win') ? 'Windows' : 'Other';

      const result = await signPublicDocument(token, payload);
      setSignResult(result);
      if (result.evidence) {
        setVerificationCode(result.evidence.verificationCode);
      }
      setStep('completed');
    } catch (err: any) {
      setError(err.message || 'Error al firmar.');
      setSigning(false);
    }
  };

  const stepIndicator = (current: Step) => {
    const steps = [
      { id: 'identity', label: 'Identidad' },
      { id: 'otp', label: 'Validación' },
      { id: 'document', label: 'Revisión' },
      { id: 'sign', label: 'Firma' },
      { id: 'completed', label: 'Completado' },
    ];
    const currentIdx = steps.findIndex((s) => s.id === current || (current === 'document' && ['document', 'sign'].includes(s.id)));
    return (
      <div className="actions" style={{ justifyContent: 'center', gap: '1rem', marginBottom: '2rem' }}>
        {steps.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <span style={{
              width: '28px', height: '28px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '.8rem', fontWeight: 600,
              background: i <= currentIdx ? '#2563eb' : '#e5e7eb',
              color: i <= currentIdx ? 'white' : '#9ca3af',
            }}>{i + 1}</span>
            <span style={{ fontSize: '.85rem', color: i <= currentIdx ? '#111' : '#9ca3af', fontWeight: i <= currentIdx ? 600 : 400 }}>{s.label}</span>
          </div>
        ))}
      </div>
    );
  };

  // STYLES
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    background: '#f9fafb', fontFamily: 'system-ui, -apple-system, sans-serif',
  };
  const cardStyle: React.CSSProperties = {
    maxWidth: '640px', width: '90%', margin: '2rem auto',
    background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,.1), 0 1px 2px rgba(0,0,0,.06)',
    padding: '2rem',
  };

  if (step === 'loading') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            <p>Verificando enlace...</p>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
            <h2>Enlace inválido o expirado</h2>
            <p style={{ color: '#6b7280' }}>{error}</p>
            <p style={{ color: '#9ca3af', fontSize: '.85rem', marginTop: '1rem' }}>
              Contacta al área de SST de tu empresa para recibir un nuevo enlace.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <header style={{ background: '#1e40af', color: 'white', padding: '1.5rem', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>📋 Firma Digital de Documentos SG-SST</h1>
        <p style={{ margin: '.5rem 0 0', opacity: .8, fontSize: '.9rem' }}>
          Sistema de Gestión de Seguridad y Salud en el Trabajo
        </p>
      </header>

      <div style={cardStyle}>
        {stepIndicator(step)}

        {error && (
          <div className="advanced-management__alert" style={{ marginBottom: '1rem' }}>
            <strong>Error:</strong> {error}
            <Button type="button" variant="ghost" onClick={() => setError('')} style={{ marginLeft: '1rem' }}>Cerrar</Button>
          </div>
        )}

        {/* Step: Identity Validation */}
        {step === 'identity' && (
          <div>
            <h2 style={{ marginTop: 0 }}>Validar identidad</h2>
            <p className="muted">Ingresa tu número de identificación para comenzar.</p>
            {worker && <p style={{ background: '#f0fdf4', padding: '.75rem', borderRadius: '6px' }}>Bienvenido, <strong>{worker.name}</strong></p>}
            <div className="form-grid">
              <label className="field">
                <span className="label">Número de identificación</span>
                <input className="input" value={identification} onChange={(e) => setIdentification(e.target.value)} placeholder="Ej: 1234567890" autoFocus />
              </label>
              <label className="field">
                <span className="label">Teléfono (opcional)</span>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Para validación adicional" />
              </label>
              <Button type="button" variant="primary" disabled={!identification} onClick={handleValidateIdentity}>
                Validar identidad
              </Button>
            </div>
          </div>
        )}

        {/* Step: OTP Validation */}
        {step === 'otp' && (
          <div>
            <h2 style={{ marginTop: 0 }}>Validación de seguridad</h2>
            {!otpSent ? (
              <div>
                <p className="muted">Se enviará un código de verificación para confirmar tu identidad.</p>
                <Button type="button" variant="primary" onClick={handleSendOtp}>
                  Enviar código de verificación
                </Button>
              </div>
            ) : (
              <div>
                <p className="muted">{message || 'Ingresa el código enviado a tu teléfono/correo.'}</p>
                <div className="form-grid">
                  <label className="field">
                    <span className="label">Código OTP</span>
                    <input className="input" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="000000" maxLength={6} autoFocus />
                  </label>
                  <Button type="button" variant="primary" disabled={otpCode.length < 4} onClick={handleValidateOtp}>
                    Validar código
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Document Review */}
        {step === 'document' && document && (
          <div>
            <h2 style={{ marginTop: 0 }}>Revisar documento</h2>

            <div className="advanced-doc-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
              <article className="advanced-doc-card" style={{ flexDirection: 'column' }}>
                <strong>Documento</strong>
                <span>{document.document.name}</span>
              </article>
              <article className="advanced-doc-card" style={{ flexDirection: 'column' }}>
                <strong>Versión</strong>
                <span>{document.document.version || '1.0'}</span>
              </article>
              <article className="advanced-doc-card" style={{ flexDirection: 'column' }}>
                <strong>Tipo</strong>
                <span>{document.document.type}</span>
              </article>
              <article className="advanced-doc-card" style={{ flexDirection: 'column' }}>
                <strong>Empresa</strong>
                <span>{document.company.name}</span>
              </article>
            </div>

            {document.document.description && (
              <p className="muted" style={{ marginBottom: '1rem' }}>{document.document.description}</p>
            )}

            {document.document.content && (
              <div style={{
                background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px',
                padding: '1rem', maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem',
                whiteSpace: 'pre-wrap', fontSize: '.9rem', lineHeight: 1.6,
              }}>
                {document.document.content}
              </div>
            )}

            {document.requireSignature && (
              <div>
                <div style={{ padding: '1rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac', marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={hasRead} onChange={(e) => {
                      setHasRead(e.target.checked);
                      if (e.target.checked) setStep('sign');
                    }} style={{ marginTop: '.25rem', transform: 'scale(1.2)' }} />
                    <span><strong>☑ He leído y comprendido este documento.</strong></span>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Sign */}
        {step === 'sign' && (
          <div>
            <h2 style={{ marginTop: 0 }}>Firma digital</h2>
            <p className="muted">Selecciona el método de firma y completa el proceso.</p>

            <div className="actions" style={{ marginBottom: '1rem' }}>
              <Button type="button" variant={signatureMethod === 'TYPED' ? 'primary' : 'secondary'} onClick={() => setSignatureMethod('TYPED')}>
                ⌨️ Escribir nombre
              </Button>
              <Button type="button" variant={signatureMethod === 'DRAWN' ? 'primary' : 'secondary'} onClick={() => setSignatureMethod('DRAWN')}>
                ✍️ Dibujar firma
              </Button>
            </div>

            {signatureMethod === 'TYPED' && (
              <label className="field">
                <span className="label">Escribe tu nombre completo</span>
                <input className="input" value={signatureData} onChange={(e) => setSignatureData(e.target.value)} placeholder="Nombre y apellido" autoFocus />
              </label>
            )}

            {signatureMethod === 'DRAWN' && (
              <div>
                <p className="muted">Dibuja tu firma en el recuadro</p>
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={150}
                  style={{ width: '100%', height: '120px', border: '2px dashed #d1d5db', borderRadius: '6px', cursor: 'crosshair', touchAction: 'none' }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                <Button type="button" variant="ghost" onClick={clearCanvas}>Limpiar</Button>
              </div>
            )}

            <div className="actions" style={{ marginTop: '1rem', justifyContent: 'flex-end' }}>
              <Button type="button" variant="primary" disabled={!signatureData || signing} onClick={handleSign}>
                {signing ? 'Firmando...' : '✅ Firmar documento'}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Completed */}
        {step === 'completed' && (
          <div style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h2>Documento firmado exitosamente</h2>
            {signResult?.evidence && (
              <div style={{ textAlign: 'left', marginTop: '1.5rem' }}>
                <div className="advanced-doc-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <article className="advanced-doc-card" style={{ flexDirection: 'column' }}>
                    <strong>Trabajador</strong>
                    <span>{signResult.evidence.workerName}</span>
                  </article>
                  <article className="advanced-doc-card" style={{ flexDirection: 'column' }}>
                    <strong>Identificación</strong>
                    <span>{signResult.evidence.workerIdentification}</span>
                  </article>
                  <article className="advanced-doc-card" style={{ flexDirection: 'column' }}>
                    <strong>Documento</strong>
                    <span>{signResult.evidence.documentType}</span>
                  </article>
                  <article className="advanced-doc-card" style={{ flexDirection: 'column' }}>
                    <strong>Fecha</strong>
                    <span>{new Date(signResult.evidence.signedAt).toLocaleString()}</span>
                  </article>
                </div>

                <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '.85rem', color: '#6b7280' }}>Código único de verificación</p>
                  <code style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a', letterSpacing: '2px' }}>
                    {verificationCode}
                  </code>
                </div>

                <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '6px', fontSize: '.85rem' }}>
                  <p className="muted" style={{ margin: 0 }}>
                    Hash de firma: <code style={{ fontSize: '.75rem' }}>{signResult.evidence.signatureHash.slice(0, 20)}...</code>
                  </p>
                </div>
              </div>
            )}
            <p style={{ color: '#6b7280', marginTop: '1.5rem' }}>
              Puedes cerrar esta página. Recibirás una copia del certificado de firma por los medios registrados.
            </p>
          </div>
        )}
      </div>

      <footer style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '.8rem' }}>
        <p>Sistema de Gestión de Seguridad y Salud en el Trabajo · Powered by Codebuff</p>
      </footer>
    </div>
  );
}

export default WorkerSignPage;
