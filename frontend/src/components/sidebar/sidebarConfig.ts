import { UserRole } from '../../api';
import { Icons } from '../Icons';

// E1 — Buscador Sidebar: fuente única reutilizable para el menú lateral.
// El Sidebar y el buscador consumen ESTA configuración; no duplicar arrays.
// Las rutas, labels, iconos, orden y filtro de roles se preservan tal cual
// estaban inline en Sidebar.tsx (mismo comportamiento).

export type SidebarLink = {
  to: string;
  label: string;
  icon: () => JSX.Element;
  // E1 — Metadata opcional de búsqueda (fiel a la opción real; omitir si no
  // hay certeza). No altera el render del menú.
  description?: string;
  keywords?: string[];
  standardCode?: string;
  group?: string;
};

export type DocumentsSubmenuLink = {
  to: string;
  label: string;
};

// Grupo "raíz" del menú (fuera del acordeón PHVA).
export const SIDEBAR_ROOT_GROUP = 'Menú';

// Grupo del acordeón PHVA (sus entradas SÍ son navegables).
export const SIDEBAR_PHVA_GROUP = 'PHVA';

const links: SidebarLink[] = [
  { to: '/dashboard', label: 'Panel', icon: Icons.dashboard, group: SIDEBAR_ROOT_GROUP },
  { to: '/companies', label: 'Empresas', icon: Icons.companies, group: SIDEBAR_ROOT_GROUP, keywords: ['empresa', 'compañía', 'companias', 'compañias'] },
  { to: '/users', label: 'Usuarios', icon: Icons.users, group: SIDEBAR_ROOT_GROUP, keywords: ['usuario', 'usuarios', 'cuentas'] },
  { to: '/employees', label: 'Empleados', icon: Icons.users, group: SIDEBAR_ROOT_GROUP, keywords: ['empleado', 'empleados', 'trabajadores', 'personal'] },
  { to: '/job-profiles', label: 'Perfiles de cargo', icon: Icons.user, group: SIDEBAR_ROOT_GROUP, standardCode: '3.1.3', description: 'Perfiles y competencias del personal', keywords: ['cargo', 'cargos', 'perfil', 'perfiles', 'competencias'] },
  { to: '/health-promotion', label: 'Prom. y prevención', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '3.1.2', description: 'Promoción y prevención (módulo de salud)', keywords: ['promocion', 'prevencion', 'salud', 'estilos de vida'] },
  // FASE 32: 3.1.7 — Estilos de vida y entornos saludables (mismo módulo con
  // frontera normativa; la clasificación 3.1.7 vive en el backend).
  { to: '/health-promotion?standard=3.1.7', label: 'Estilos de vida', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '3.1.7', description: 'Estilos de vida y entornos saludables', keywords: ['estilos', 'vida', 'entornos', 'saludables'] },
  { to: '/occupational-medical-record-custody', label: 'Custodia HC', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '3.1.5', description: 'Custodia de historias clínicas ocupacionales', keywords: ['custodia', 'historia', 'clinica', 'historias', 'hc', 'historia clinica'] },
  // FASE 33: 3.1.6 — Restricciones y recomendaciones médico-laborales (owner/admin).
  { to: '/work-restrictions', label: 'Restricciones méd-lab', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '3.1.6', description: 'Restricciones y recomendaciones médico-laborales', keywords: ['restricciones', 'recomendaciones', 'medicas', 'laborales'] },
  // FASE 34B: 3.1.8 — Agua potable, servicios sanitarios y disposición de basuras (owner/admin).
  { to: '/workplace-sanitary-conditions', label: 'Condiciones sanitarias', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '3.1.8', description: 'Agua potable, servicios sanitarios y disposición de basuras', keywords: ['agua', 'potable', 'servicios', 'sanitarios', 'basuras', 'sanitarias'] },
  // FASE 34C: 3.1.9 — Eliminación adecuada de residuos sólidos, líquidos o gaseosos (owner/admin).
  { to: '/waste-management', label: 'Gestión de residuos', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '3.1.9', description: 'Eliminación adecuada de residuos sólidos, líquidos o gaseosos', keywords: ['residuos', 'solidos', 'liquidos', 'gaseosos', 'desechos'] },
  // FASE 35B: Casos estadísticos de enfermedad laboral (owner/admin; sin scoring — base 3.3.4/3.3.5).
  { to: '/occupational-disease-statistical-cases', label: 'Enfermedad laboral (casos)', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, description: 'Casos estadísticos de enfermedad laboral', keywords: ['enfermedad', 'laboral', 'casos', 'estadisticos'] },
  // E3 (3.2.3): registro y análisis estadístico de accidentalidad (owner/admin;
  // panel de solo lectura — fuente operativa: dominio Incident).
  { to: '/accident-statistics', label: 'Registro estadístico AT/EL', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '3.2.3', description: 'Registro y análisis estadístico de accidentalidad', keywords: ['accidentes', 'accidente', 'enfermedades', 'enfermedad', 'estadistica', 'estadistico', 'AT', 'EL'] },
  { to: '/company-configuration', label: 'Empresa', icon: Icons.building, group: SIDEBAR_ROOT_GROUP, keywords: ['configuracion', 'empresa', 'datos'] },
  { to: '/implementation-wizard', label: 'Implementación', icon: Icons.chart, group: SIDEBAR_ROOT_GROUP, keywords: ['implementacion', 'asistente', 'wizard'] },
  // LEGACY (FASE 3.4.1): la ruta /evaluations apunta a una página legacy rota
  // (EvaluationsPage usa contratos que ya no existen en el backend). Se oculta
  // temporalmente del menú sin borrar código; la migración posterior decidirá
  // si se elimina o se reconecta al módulo InitialEvaluation.
  // { to: '/evaluations', label: 'Evaluaciones', icon: Icons.chart },
  { to: '/incidents', label: 'Accidentalidad', icon: Icons.alert, group: SIDEBAR_ROOT_GROUP, description: 'Registro de accidentes e incidentes de trabajo', keywords: ['incidentes', 'accidentes', 'reportes'] },
  { to: '/alerts', label: 'Alertas', icon: Icons.bell, group: SIDEBAR_ROOT_GROUP, keywords: ['alertas', 'notificaciones', 'avisos'] },
  { to: '/absenteeism', label: 'Ausentismos', icon: Icons.chart, group: SIDEBAR_ROOT_GROUP, standardCode: '3.2.1', description: 'Control de ausentismo laboral', keywords: ['ausentismo', 'ausencias', 'inasistencias'] },
  { to: '/risks', label: 'Riesgos', icon: Icons.shield, group: SIDEBAR_ROOT_GROUP, keywords: ['riesgos', 'peligros', 'matriz', 'identificacion'] },
  { to: '/inspections', label: 'Inspecciones', icon: Icons.shield, group: SIDEBAR_ROOT_GROUP, keywords: ['inspecciones', 'checklist', 'planillas'] },
  // V1 4.2.5 — Mantenimiento (módulo propio; visible owner/admin/manager).
  { to: '/maintenance', label: 'Mantenimiento', icon: Icons.shield, group: SIDEBAR_ROOT_GROUP, standardCode: '4.2.5', description: 'Mantenimiento de instalaciones, equipos y herramientas', keywords: ['mantenimiento', 'equipos', 'herramientas', 'instalaciones'] },
  { to: '/epp', label: 'EPP', icon: Icons.shield, group: SIDEBAR_ROOT_GROUP, description: 'Elementos de protección personal', keywords: ['epp', 'proteccion', 'elementos', 'dotacion', 'personal'] },
  { to: '/emergencies', label: 'Emergencias', icon: Icons.alert, group: SIDEBAR_ROOT_GROUP, keywords: ['emergencias', 'brigada', 'simulacros'] },
  // E4-A (6.1.1) — Indicadores SG-SST: visible owner/admin/member (mismo patrón
  // que /emergencies); manager accede vía PHVA → Verificar. Escritura en backend
  // es owner/admin.
  { to: '/indicators', label: 'Indicadores', icon: Icons.chart, group: SIDEBAR_ROOT_GROUP, standardCode: '6.1.1', description: 'Indicadores SG-SST', keywords: ['indicadores', 'metricas', 'estadisticas'] },
  // E3 (6.1.2) — Auditoría anual: mismo patrón de visibilidad que /indicators
  // (owner/admin/member; manager accede vía PHVA → Verificar). Escritura en
  // backend es owner/admin.
  { to: '/annual-audit', label: 'Auditoría anual', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '6.1.2', description: 'Auditoría anual del SG-SST', keywords: ['auditoria', 'anual', 'auditorias'] },
  // E3 (6.1.3) — Revisión por la dirección: nombre normativo del estándar
  // (no "Reuniones"). Misma visibilidad que /indicators y /annual-audit.
  { to: '/management-review-direction', label: 'Revisión por la dirección', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '6.1.3', description: 'Revisión por la alta dirección', keywords: ['revision', 'direccion', 'gerencia', 'alta direccion'] },
  // E3 (6.1.4) — Planificación auditorías COPASST: mismo patrón de visibilidad
  // que /indicators y /annual-audit (owner/admin/member; manager accede vía
  // PHVA → Verificar). Escritura en backend es owner/admin.
  { to: '/copasst-audit-planning', label: 'Plan. auditorías COPASST', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '6.1.4', description: 'Planificación de auditorías del COPASST', keywords: ['copasst', 'auditorias', 'planificacion', 'comite'] },
  // E3 (7.1.1) — Acciones preventivas y correctivas: lectura owner/admin/manager
  // (backend GET); member SIN acceso (filtrado abajo); escritura owner/admin.
  { to: '/corrective-preventive-actions', label: 'Acciones prev./correctivas', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '7.1.1', description: 'Acciones preventivas y correctivas', keywords: ['acciones', 'preventivas', 'correctivas'] },
  // E3 (7.1.2) — Acciones de mejora de la alta dirección: lectura
  // owner/admin/manager (backend GET); member SIN acceso (filtrado abajo);
  // escritura owner/admin.
  { to: '/management-improvement-actions', label: 'Acciones de mejora', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '7.1.2', description: 'Acciones de mejora de la alta dirección', keywords: ['mejora', 'mejoramiento', 'acciones'] },
  // E3 (7.1.4) — Plan de mejoramiento: lectura owner/admin/manager (backend
  // GET); member SIN acceso (filtrado abajo); escritura owner/admin. Manager
  // accede vía PHVA → ACTUAR, igual patrón que 7.1.1/7.1.2.
  { to: '/improvement-plans', label: 'Plan de mejoramiento', icon: Icons.file, group: SIDEBAR_ROOT_GROUP, standardCode: '7.1.4', description: 'Plan de mejoramiento del SG-SST', keywords: ['plan', 'mejoramiento', 'mejora'] },
  { to: '/my-communications', label: 'Mis Comunic.', icon: Icons.bell, group: SIDEBAR_ROOT_GROUP, keywords: ['comunicaciones', 'comunicados', 'mensajes', 'mias'] },
  { to: '/intelligence-compliance', label: '🤖 Inteligencia', icon: Icons.chart, group: SIDEBAR_ROOT_GROUP, description: 'Inteligencia de cumplimiento (IA)', keywords: ['inteligencia', 'ia', 'cumplimiento', 'analisis'] },
];

// AJUSTE VISUAL/NAVEGACIÓN — el menú PHVA muestra las 4 fases del ciclo con sus
// pesos; las rutas se conservan intactas. (Aparecen bajo el acordeón PHVA del
// Sidebar; son navegables y por tanto entran al buscador como grupo PHVA.)
const documentsSubmenu: DocumentsSubmenuLink[] = [
  { to: '/documents/plan', label: 'PLANEAR (25%)' },
  { to: '/documents/do', label: 'HACER (60%)' },
  { to: '/documents/check', label: 'VERIFICAR (5%)' },
  { to: '/documents/act', label: 'ACTUAR (10%)' },
];

const managerLinks = [{ to: '/dashboard', label: 'Panel', icon: Icons.dashboard, group: SIDEBAR_ROOT_GROUP }];

// E1 — Entradas navegables del acordeón PHVA expresadas con el mismo shape del
// buscador. El botón acordeón que solo expande/colapsa NO es navegable y no va
// aquí. Fases con sus pesos normativos.
const documentsSubmenuLinks: SidebarLink[] = documentsSubmenu.map((link) => ({
  to: link.to,
  label: link.label,
  icon: Icons.file,
  group: SIDEBAR_PHVA_GROUP,
  keywords: [
    'phva',
    'ciclo',
    link.to.split('/').pop() ?? '',
    link.label.startsWith('PLANEAR') ? 'planear' : '',
    link.label.startsWith('HACER') ? 'hacer' : '',
    link.label.startsWith('VERIFICAR') ? 'verificar' : '',
    link.label.startsWith('ACTUAR') ? 'actuar' : '',
  ].filter(Boolean),
}));

// E1 — Fuente de verdad del filtro de roles (extraída 1:1 del Sidebar).
// manager usa managerLinks; el resto pasa por la cadena if-else por `to`
// exacto (incluye query strings como '/health-promotion?standard=3.1.7').
export function filterSidebarLinks(role: UserRole | undefined): SidebarLink[] {
  if (role === 'manager') {
    return managerLinks;
  }
  return links.filter((link) => {
    if (link.to === '/companies') return role === 'owner';
    if (link.to === '/job-profiles') return role === 'owner' || role === 'admin';
    if (link.to === '/health-promotion') return role === 'owner' || role === 'admin';
    // FASE 32: 3.1.7 — mismo módulo, alcance estilos de vida (owner/admin).
    if (link.to === '/health-promotion?standard=3.1.7') return role === 'owner' || role === 'admin';
    // FASE 33: 3.1.6 — Restricciones méd-lab (owner/admin).
    if (link.to === '/work-restrictions') return role === 'owner' || role === 'admin';
    // FASE 34B: 3.1.8 — Condiciones sanitarias (owner/admin).
    if (link.to === '/workplace-sanitary-conditions') return role === 'owner' || role === 'admin';
    // FASE 34C: 3.1.9 — Gestión de residuos (owner/admin).
    if (link.to === '/waste-management') return role === 'owner' || role === 'admin';
    // FASE 35B: Casos estadísticos de enfermedad laboral (owner/admin; lectura +manager en página).
    if (link.to === '/occupational-disease-statistical-cases') return role === 'owner' || role === 'admin';
    // E3 (3.2.3): registro estadístico AT/EL (owner/admin; lectura +manager
    // vía ruta — mismo patrón que los módulos avanzados).
    if (link.to === '/accident-statistics') return role === 'owner' || role === 'admin';
    // 3.1.5 (FASE 30G): visible para owner/admin (gestión); manager accede
    // vía PHVA — Hacer. Igual patrón que health-promotion.
    if (link.to === '/occupational-medical-record-custody') return role === 'owner' || role === 'admin';
    if (link.to === '/my-communications') return role === 'member';
    // E3 (7.1.1) — Acciones preventivas y correctivas: member sin acceso
    // (backend GET restringe a owner/admin/manager). En este filtro role ya
    // no puede ser 'manager' (usa managerLinks); manager accede vía PHVA →
    // ACTUAR, igual patrón que 6.1.4.
    if (link.to === '/corrective-preventive-actions') return role === 'owner' || role === 'admin';
    // E3 (7.1.2) — Acciones de mejora de la alta dirección: member sin acceso
    // (backend GET restringe a owner/admin/manager). En este filtro role ya
    // no puede ser 'manager' (usa managerLinks); manager accede vía PHVA →
    // ACTUAR, igual patrón que 7.1.1.
    if (link.to === '/management-improvement-actions') return role === 'owner' || role === 'admin';
    // E3 (7.1.4) — Plan de mejoramiento: member sin acceso (backend GET
    // restringe a owner/admin/manager). En este filtro role ya no puede ser
    // 'manager' (usa managerLinks); manager accede vía PHVA → ACTUAR, igual
    // patrón que 7.1.1/7.1.2.
    if (link.to === '/improvement-plans') return role === 'owner' || role === 'admin';
    return true;
  });
}

// E1 — Opciones disponibles para el BUSCADOR = opciones navegables visibles del
// Sidebar para el rol. Reutiliza filterSidebarLinks (sin lógica paralela) y
// añade las entradas navegables del acordeón PHVA, que el Sidebar renderiza
// para todos los roles. El botón acordeón (solo expande/colapsa) NO entra.
export function getSearchableSidebarLinks(role: UserRole | undefined): SidebarLink[] {
  return [...filterSidebarLinks(role), ...documentsSubmenuLinks];
}

// E1 — Links crudos para el render del menú (mismos objetos que antes vivían
// inline en Sidebar.tsx; el componente los filtra con filterSidebarLinks).
export const RAW_SIDEBAR_LINKS = links;
export const RAW_DOCUMENTS_SUBMENU = documentsSubmenu;
export const RAW_MANAGER_LINKS = managerLinks;
