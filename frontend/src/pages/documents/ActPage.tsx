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
  /** Sección del PHVA desde el StandardCatalog (opcional — FASE 7.6). */
  section?: StandardSection;
};

const actuarItems: EvaluationEntry[] = [
  {
    code: '7.1.1',
    title: 'Acciones preventivas y correctivas',
    weight: 2.5,
    modeReview:
      'Verificar evidencias de acciones preventivas y correctivas derivadas de hallazgos, con responsables, fechas y seguimiento al cierre.',
    criteria:
      'La organización define, ejecuta y verifica acciones preventivas y correctivas para evitar la recurrencia de no conformidades en el SG-SST.',
  },
  {
    code: '7.1.2',
    title: 'Acciones mejora alta dirección',
    weight: 2.5,
    modeReview:
      'Revisar decisiones de la alta dirección orientadas al mejoramiento continuo del SG-SST, incluyendo recursos, prioridades y metas.',
    criteria:
      'Se evidencian acciones de mejora aprobadas por la alta dirección con seguimiento a su implementación y efectividad.',
  },
  {
    code: '7.1.3',
    title: 'Acciones por accidentes',
    weight: 2.5,
    modeReview:
      'Solicitar investigaciones de accidentes e incidentes y validar que los planes de acción asociados se ejecuten y verifiquen.',
    criteria:
      'Los accidentes e incidentes generan acciones de mejora con análisis causal, responsables definidos y cierre documentado.',
  },
  {
    code: '7.1.4',
    title: 'Plan de mejoramiento',
    weight: 2.5,
    modeReview:
      'Validar la existencia de un plan de mejoramiento consolidado del SG-SST con priorización, cronograma, responsables e indicadores.',
    criteria:
      'Existe plan de mejoramiento del SG-SST implementado y monitoreado periódicamente para garantizar la mejora continua.',
  },
];

export function ActPage({ readOnly = false }: { readOnly?: boolean }) {
  const navigate = useNavigate();
  const { answers, missingCodes, sectionErrors, registerSection, setAnswerStatus, validateAll, totalCompliance, sectionCompliance } = useDocumentsEvaluation();

  // ────────────────────────────────────────────────────────────────────────
  // FASE 7.6 — Migración piloto: StandardCatalog como fuente de datos.
  //
  // Se consume usePhvaCatalog() y se filtran únicamente los estándares de la
  // fase ACTUAR (fuente única de verdad: cada página consume SOLO su fase, sin
  // excepciones cross-phase). El array legacy (actuarItems) NO se elimina:
  // permanece como respaldo cuando el catálogo falla o está vacío (la pantalla
  // nunca queda vacía) y como referencia del orden actual.
  //
  // Para cada estándar, si el catálogo ACTUAR contiene criteria/modeReview/
  // section se usan esos valores; si no existen, se mantienen los textos
  // legacy. registerSection, validateAll y el flujo de Finalizar se mantienen
  // intactos (los códigos y pesos son idénticos entre legacy y merge).
  // ────────────────────────────────────────────────────────────────────────
  const { catalog, error } = usePhvaCatalog();

  const actuarCatalogByCode = useMemo(() => {
    const byCode = new Map<string, PhvaCatalogItem>();
    for (const item of catalog) {
      if (item.phva === 'ACTUAR') byCode.set(item.code, item);
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
  // la completitud del catálogo del nivel para la fase ACTUAR (sin conteos
  // fijos). Si la fase tiene todos sus estándares con metadata completa, la
  // sección renderiza los ítems del catálogo agrupados por section.id (misma
  // interfaz {code, title, weight, criteria, modeReview, section}). Si no, se
  // usan los arrays legacy con el merge de metadata (fallback — la pantalla
  // nunca queda vacía).
  const catalogGroups = useMemo(() => groupCatalogItems(catalog), [catalog]);
  const useCatalogSet =
    shouldUseCatalogSet('ACTUAR', catalog) &&
    hasCatalogSectionItems(catalogGroups, ['act-mejoramiento']);

  // Array memoizado (referencia estable) para evitar re-renders. Si el
  // catálogo no está disponible se usa el array legacy tal cual (FASE 7.7.B.2
  // — merge consolidado en mergeCatalogItems).
  const actuarItemsMerged = useMemo(
    () =>
      useCatalogSet
        ? (catalogGroups['act-mejoramiento']?.items ?? []).map(catalogItemToEvaluationItem)
        : mergeCatalogItems(actuarItems, actuarCatalogByCode, useCatalog),
    [useCatalogSet, catalogGroups, actuarCatalogByCode, useCatalog],
  );

  useEffect(() => {
    registerSection('act-mejoramiento', {
      title: 'Mejoramiento (10%)',
      items: actuarItems.map((item) => ({ code: item.code, weight: item.weight })),
    });
  }, [registerSection]);

  const handleFinish = () => {
    if (readOnly) {
      return;
    }

    const validationResult = validateAll();

    if (!validationResult.isValid) {
      window.alert('Faltan campos pendientes por diligenciar');
      return;
    }

    console.log('Form ready');
  };

  return (
    <div className="grid">
      <ComplianceProgress
        total={{ title: totalCompliance.title, percentage: totalCompliance.percentage }}
        sections={sectionCompliance.map((section) => ({ title: section.title, percentage: section.percentage }))}
      />
      {readOnly ? <p className="muted">Modo solo visualización para manager.</p> : null}
      <Card title={catalogSections['act-mejoramiento']?.title ?? 'Mejoramiento (10%)'} className={sectionErrors.has('act-mejoramiento') ? 'card--error' : ''}>
        <div className="evaluation-list">
          {actuarItemsMerged.map((item, index) => (
            <div key={item.code} className="evaluation-list__row">
              <EvaluationItem
                {...item}
                status={(answers[item.code]?.status ?? '') as '' | 'Cumple totalmente' | 'No cumple' | 'No aplica'}
                hasError={missingCodes.has(item.code)}
                readOnly={readOnly}
                onStatusChange={(code, status) => setAnswerStatus(code, status)}
              />
              {index < actuarItemsMerged.length - 1 ? <hr className="evaluation-list__divider" /> : null}
            </div>
          ))}
        </div>

        <div className="plan-next-action plan-next-action--between">
          <Button type="button" className="plan-next-action__button" variant="secondary" onClick={() => navigate('/documents/check')}>
            ← Regresar (Verificar)
          </Button>
          <Button type="button" className="plan-next-action__button" onClick={handleFinish} disabled={readOnly}>
            Finalizar
          </Button>
        </div>
      </Card>
    </div>
  );
}
