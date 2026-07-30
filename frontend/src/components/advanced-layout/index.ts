/**
 * ====================================================================
 *  ARQUITECTURA ESTÁNDAR - PÁGINAS DE GESTIÓN AVANZADA
 * ====================================================================
 *
 * Todas las páginas de Gestión Avanzada del sistema DEBEN seguir
 * el siguiente orden de componentes:
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  AdvancedPageLayout                                     │
 * │  ┌───────────────────────────────────────────────────┐  │
 * │  │  AdvancedHeader                                    │  │
 * │  │  • Breadcrumb ("← Volver a Implementación")       │  │
 * │  │  • Badge "Módulo {código}"                        │  │
 * │  │  • Título                                          │  │
 * │  │  • Descripción / metadata                         │  │
 * │  │  • Badge de estado (cumplimiento)                 │  │
 * │  │  • Botones de acción (Exportar PDF, Guardar, etc) │  │
 * │  └───────────────────────────────────────────────────┘  │
 * │                                                          │
 * │  ┌───────────────────────────────────────────────────┐  │
 * │  │  AdvancedKpiGrid                                   │  │
 * │  │  • Tarjetas KPI con variantes de color            │  │
 * │  │  • Columns: 3 | 4 | 6                             │  │
 * │  └───────────────────────────────────────────────────┘  │
 * │                                                          │
 * │  ┌───────────────────────────────────────────────────┐  │
 * │  │  Filtros (propios de cada módulo)                 │  │
 * │  └───────────────────────────────────────────────────┘  │
 * │                                                          │
 * │  ┌───────────────────────────────────────────────────┐  │
 * │  │  Contenido principal                                │  │
 * │  │  • AdvancedTabsSidebar + AdvancedTabsContent       │  │
 * │  │  • AdvancedSection para cada sección               │  │
 * │  │  • Tablas, formularios, tarjetas, etc.             │  │
 * │  └───────────────────────────────────────────────────┘  │
 * │                                                          │
 * │  ┌───────────────────────────────────────────────────┐  │
 * │  │  Historial (timeline de cambios)                  │  │
 * │  └───────────────────────────────────────────────────┘  │
 * │                                                          │
 * │  ┌───────────────────────────────────────────────────┐  │
 * │  │  Auditoría (registro de acciones)                 │  │
 * │  └───────────────────────────────────────────────────┘  │
 * │                                                          │
 * │  ┌───────────────────────────────────────────────────┐  │
 * │  │  Comentarios / Observaciones                      │  │
 * │  └───────────────────────────────────────────────────┘  │
 * │                                                          │
 * │  ┌───────────────────────────────────────────────────┐  │
 * │  │  Última actualización (timestamp)                 │  │
 * │  └───────────────────────────────────────────────────┘  │
 * └─────────────────────────────────────────────────────────┘
 *
 * ====================================================================
 *  EJEMPLO DE USO
 * ====================================================================
 *
 * import {
 *   AdvancedPageLayout,
 *   AdvancedHeader,
 *   type HeaderAction,
 *   AdvancedKpiGrid,
 *   AdvancedSection,
 *   AdvancedTabsSidebar,
 *   AdvancedTabsContent,
 *   type SidebarTabItem,
 *   AdvancedProgressBar,
 * } from '../components/advanced-layout';
 *
 * export function MiModuloPage({ token }: { token: string }) {
 *   return (
 *     <AdvancedPageLayout>
 *       <AdvancedHeader
 *         backPath="/documents/plan"
 *         backLabel="← Volver a Implementación"
 *         moduleCode="X.X.X"
 *         moduleTitle="Título del Módulo"
 *         description="Descripción breve del módulo"
 *         statusBadge={<span className="badge badge--success">✅ Cumple</span>}
 *         actions={[
 *           { label: '📄 Exportar PDF', onClick: () => {}, variant: 'secondary' },
 *           { label: '💾 Guardar', onClick: () => {}, variant: 'primary' },
 *         ]}
 *         lastSaved="Último guardado: ..."
 *       />
 *
 *       <AdvancedKpiGrid
 *         items={[
 *           { label: 'Indicador 1', value: 100, variant: 'success' },
 *           { label: 'Indicador 2', value: '50%', variant: 'warning' },
 *         ]}
 *         columns={4}
 *       />
 *
 *       <div>~~ FILTROS ESPECÍFICOS DEL MÓDULO ~~</div>
 *
 *       <div className="flex gap-6">
 *         <AdvancedTabsSidebar items={sidebarItems} activeId={activeTab} onSelect={setActiveTab} />
 *         <AdvancedTabsContent>
 *           <AdvancedSection title="Sección" description="...">
 *             ~~ CONTENIDO ~~
 *           </AdvancedSection>
 *         </AdvancedTabsContent>
 *       </div>
 *
 *       ~~ HISTORIAL, AUDITORÍA, COMENTARIOS, ÚLTIMA ACTUALIZACIÓN ~~
 *     </AdvancedPageLayout>
 *   );
 * }
 *
 * ====================================================================
 */

export { AdvancedPageLayout } from './AdvancedPageLayout';
export { AdvancedHeader } from './AdvancedHeader';
export type { HeaderAction } from './AdvancedHeader';
export { AdvancedKpiGrid } from './AdvancedKpiGrid';
export { AdvancedSection } from './AdvancedSection';
export { AdvancedTabsSidebar, AdvancedTabsContent } from './AdvancedTabsSidebar';
export type { SidebarTabItem } from './AdvancedTabsSidebar';
export { AdvancedProgressBar } from './AdvancedProgressBar';
