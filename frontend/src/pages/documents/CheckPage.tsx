import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { EvaluationItem } from '../../components/EvaluationItem';
import { ComplianceProgress } from '../../components/ComplianceProgress';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useDocumentsEvaluation } from './evaluationState';
import { usePhvaCatalog } from '../../hooks/usePhvaCatalog';
import { mergeCatalogItems } from './utils/mergeCatalogItems';
import { groupCatalogItems } from './utils/groupCatalogItems';
import { shouldUseCatalogSet, hasCatalogSectionItems, catalogItemToEvaluationItem } from './utils/shouldUseCatalogSet';
import type { StandardSection } from '../../models/standard-catalog';
import type { PhvaCatalogItem } from '../../services/phva-catalog.service';

type EvaluationEntry = {
  code: string;
  title: string;
  weight: number;
  modeReview: string;
  criteria: string;
  /** Sección del PHVA desde el StandardCatalog (opcional — FASE 7.5). */
  section?: StandardSection;
};

const verificacionItems: EvaluationEntry[] = [
  {
    code: '6.1.1',
    title: 'Indicadores SG-SST',
    weight: 1.25,
    modeReview:
      'Solicitar los indicadores definidos del SG-SST y verificar su medición periódica (estructura, proceso y resultado), fórmula, meta, responsable y análisis de tendencias.',
    criteria:
      'La organización cuenta con indicadores del SG-SST medidos y analizados periódicamente, con evidencia de decisiones tomadas para mantener o mejorar su desempeño.',
  },
  {
    code: '6.1.2',
    title: 'Auditoría anual',
    weight: 1.25,
    modeReview:
      'Revisar el programa y el informe de auditoría interna anual del SG-SST, validando alcance, criterios, competencias del auditor, hallazgos y plan de acción.',
    criteria:
      'Se evidencia ejecución de auditoría anual al SG-SST con hallazgos documentados, responsables definidos y seguimiento al cierre de acciones.',
  },
  {
    code: '6.1.3',
    title: 'Revisión alta dirección',
    weight: 1.25,
    modeReview:
      'Verificar acta o informe de revisión por la alta dirección con análisis de resultados del SG-SST, cumplimiento de objetivos, recursos y definición de mejoras.',
    criteria:
      'La alta dirección realiza revisión periódica del SG-SST y deja evidencia de decisiones y compromisos para su mejora continua.',
  },
  {
    code: '6.1.4',
    title: 'Planificación auditorías COPASST',
    weight: 1.25,
    modeReview:
      'Solicitar la planificación de auditorías o verificaciones con participación del COPASST, incluyendo cronograma, alcance y seguimiento a recomendaciones.',
    criteria:
      'Existe planificación documentada de auditorías o verificaciones con participación del COPASST y trazabilidad de resultados y acciones de mejora.',
  },
];

export function CheckPage({ readOnly = false }: { readOnly?: boolean }) {
  const navigate = useNavigate();
  const { answers, missingCodes, sectionErrors, registerSection, setAnswerStatus, totalCompliance, sectionCompliance } = useDocumentsEvaluation();

  // ────────────────────────────────────────────────────────────────────────
  // FASE 7.5 — Migración piloto: StandardCatalog como fuente de datos.
  //
  // Se consume usePhvaCatalog() y se filtran únicamente los estándares de la
  // fase VERIFICAR (fuente única de verdad: cada página consume SOLO su fase,
  // sin excepciones cross-phase). El array legacy (verificacionItems) NO se
  // elimina: permanece como respaldo cuando el catálogo falla o está vacío
  // (la pantalla nunca queda vacía) y como referencia del orden actual.
  //
  // Para cada estándar, si el catálogo VERIFICAR contiene criteria/modeReview/
  // section se usan esos valores; si no existen, se mantienen los textos
  // legacy. registerSection se mantiene exactamente igual (los códigos y pesos
  // son idénticos entre legacy y merge).
  // ────────────────────────────────────────────────────────────────────────
  const { catalog, error } = usePhvaCatalog();

  const verificarCatalogByCode = useMemo(() => {
    const byCode = new Map<string, PhvaCatalogItem>();
    for (const item of catalog) {
      if (item.phva === 'VERIFICAR') byCode.set(item.code, item);
    }
    return byCode;
  }, [catalog]);

  const useCatalog = !error && catalog.length > 0;

  // FASE 7.7.F — Metadata de secciones desde el StandardCatalog. groupCatalogItems
  // agrupa los estándares del catálogo por section.id (título y porcentaje). El
  // título del catálogo es byte-idéntico al hardcodeado de la página (copiado en
  // 7.7.B.1), por lo que el cambio visual es nulo. Si el catálogo falla o está
  // vacío, se usa exactamente el título legacy actual.
  const catalogSections = useMemo(() => (useCatalog ? groupCatalogItems(catalog) : {}), [catalog, useCatalog]);

  // FASE 7.7.G — Migración controlada del set PHVA. shouldUseCatalogSet valida
  // la completitud del catálogo del nivel para la fase VERIFICAR (sin conteos
  // fijos). Si la fase tiene todos sus estándares con metadata completa, la
  // sección renderiza los ítems del catálogo agrupados por section.id (misma
  // interfaz {code, title, weight, criteria, modeReview, section}). Si no, se
  // usan los arrays legacy con el merge de metadata (fallback — la pantalla
  // nunca queda vacía).
  const catalogGroups = useMemo(() => groupCatalogItems(catalog), [catalog]);
  const useCatalogSet =
    shouldUseCatalogSet('VERIFICAR', catalog) &&
    hasCatalogSectionItems(catalogGroups, ['check-verificacion']);

  // Array memoizado (referencia estable) para evitar re-renders. Si el
  // catálogo no está disponible se usa el array legacy tal cual (FASE 7.7.B.2
  // — merge consolidado en mergeCatalogItems).
  const verificacionItemsMerged = useMemo(
    () =>
      useCatalogSet
        ? (catalogGroups['check-verificacion']?.items ?? []).map(catalogItemToEvaluationItem)
        : mergeCatalogItems(verificacionItems, verificarCatalogByCode, useCatalog),
    [useCatalogSet, catalogGroups, verificarCatalogByCode, useCatalog],
  );

  useEffect(() => {
    registerSection('check-verificacion', {
      title: 'Verificación del Sistema de Gestión de Seguridad y Salud en el Trabajo (5%)',
      items: verificacionItems.map((item) => ({ code: item.code, weight: item.weight })),
    });
  }, [registerSection]);

  return (
    <div className="grid">
      <ComplianceProgress
        total={{ title: totalCompliance.title, percentage: totalCompliance.percentage }}
        sections={sectionCompliance.map((section) => ({ title: section.title, percentage: section.percentage }))}
      />
      {readOnly ? <p className="muted">Modo solo visualización para manager.</p> : null}
      <Card title={catalogSections['check-verificacion']?.title ?? 'Verificación del Sistema de Gestión de Seguridad y Salud en el Trabajo (5%)'} className={sectionErrors.has('check-verificacion') ? 'card--error' : ''}>
        <p className="muted">Gestión y resultados del SG-SST (5%)</p>
        <div className="evaluation-list" style={{ marginTop: '1rem' }}>
          {verificacionItemsMerged.map((item, index) => (
            <div key={item.code} className="evaluation-list__row">
              <EvaluationItem
                {...item}
                status={(answers[item.code]?.status ?? '') as '' | 'Cumple totalmente' | 'No cumple' | 'No aplica'}
                hasError={missingCodes.has(item.code)}
                readOnly={readOnly}
                onStatusChange={(code, status) => setAnswerStatus(code, status)}
              />
              {index < verificacionItemsMerged.length - 1 ? <hr className="evaluation-list__divider" /> : null}
            </div>
          ))}
        </div>
        <div className="plan-next-action plan-next-action--between">
          <Button type="button" className="plan-next-action__button" variant="secondary" onClick={() => navigate('/documents/do')}>
            ← Regresar (Hacer)
          </Button>
          <Button type="button" className="plan-next-action__button" onClick={() => navigate('/documents/act')}>
            Siguiente → Actuar
          </Button>
        </div>
      </Card>
    </div>
  );
}
