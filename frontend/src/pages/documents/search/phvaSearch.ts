/**
 * E4 — Búsqueda PURA sobre el índice del buscador PHVA.
 *
 * Funciones puras sin fetch, sin React, sin CompanyContext, sin Firebase:
 * reciben el índice ya construido (`buildPhvaSearchIndex`) como argumento.
 * La integración futura (E5/E6) debe pasarle las entradas derivadas del
 * `usePhvaCatalog()` que ya consume la página — no se duplica ningún fetch.
 *
 * Normalización: case-insensitive + sin diacríticos + espacios colapsados
 * (mismas reglas del buscador del menú E1: substring + normalización, sin
 * fuzzy search). Se implementa LOCAL en PHVA (opción B del E4 §19) para no
 * acoplar este módulo a `components/sidebar/`; ver informe E4 §10.
 *
 * Búsqueda limitada SEMÁNTICAMENTE al PHVA (E4 §15): solo código, título,
 * descripción, criteria, modeReview, section.title, chapter y phase. Nunca
 * rutas generales, empresas, usuarios ni otros módulos.
 */

import type { PhvaSearchEntry, PhvaSearchPhase } from './phvaSearchConfig';

/** Normaliza texto para búsqueda: lowercase, sin diacríticos, espacios simple. */
export function normalizePhvaSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resultado de búsqueda: la entrada + su puntaje (solo para depuración/tests). */
export interface PhvaSearchMatch {
  entry: PhvaSearchEntry;
  score: number;
}

/** Opciones de búsqueda: filtro opcional por fase PHVA (E4 §17). */
export interface PhvaSearchOptions {
  phase?: PhvaSearchPhase;
}

// Ranking determinista (mayor score primero). Orden exacto del E4 §16.
const SCORE_CODE_EXACT = 1000;
const SCORE_CODE_STARTS_WITH = 900;
const SCORE_TITLE_EXACT = 800;
const SCORE_TITLE_STARTS_WITH = 700;
const SCORE_TITLE_CONTAINS = 600;
const SCORE_CRITERIA_CONTAINS = 500;
const SCORE_DESCRIPTION_CONTAINS = 400;
const SCORE_SECTION_CONTAINS = 300;
const SCORE_CHAPTER_CONTAINS = 200;
const SCORE_PHASE_CONTAINS = 100;

/**
 * Busca sobre el índice PHVA y devuelve los matches ordenados por el ranking
 * determinista (desempate por `catalogIndex`).
 *
 * Con filtro `options.phase` busca solo dentro de esa fase SIN duplicar
 * lógica: el filtrado se aplica al índice antes de rankear.
 *
 * Query vacía/solo espacios → [] (la UI en E5/E6 decide qué mostrar).
 * Los duplicados NO se eliminan: si los textos/códigos coinciden, aparecen
 * varios resultados (p. ej. buscar "1.1.3" puede devolver 1.1.3, 1.1.9 y
 * 1.1.10 si su texto realmente coincide — E4 §18).
 */
export function searchPhvaEntries(
  entries: readonly PhvaSearchEntry[],
  rawQuery: string,
  options?: PhvaSearchOptions,
): PhvaSearchMatch[] {
  const query = normalizePhvaSearchText(rawQuery);
  if (!query) {
    return [];
  }

  const pool = options?.phase ? entries.filter((entry) => entry.phase === options.phase) : entries;

  const matches: PhvaSearchMatch[] = [];

  pool.forEach((entry) => {
    const code = normalizePhvaSearchText(entry.code);
    const title = normalizePhvaSearchText(entry.title);
    const description = normalizePhvaSearchText(entry.description);
    const criteria = normalizePhvaSearchText(entry.criteria ?? '');
    const modeReview = normalizePhvaSearchText(entry.modeReview ?? '');
    const sectionTitle = normalizePhvaSearchText(entry.section?.title ?? '');
    const chapter = normalizePhvaSearchText(entry.chapter);
    // La fase se busca por su forma legible ('PLANEAR' → 'planear').
    const phase = normalizePhvaSearchText(entry.phase);
    // Capa "requisito" del ranking (§16.6): criteria + modeReview juntos,
    // para que ambos textos sean buscables cuando el estándar tenga ambos.
    const requirementText = [criteria, modeReview].filter(Boolean).join(' ');

    const tiebreak = -entry.catalogIndex;

    // 1) código exacto.
    if (code === query) {
      matches.push({ entry, score: SCORE_CODE_EXACT + tiebreak });
      return;
    }
    // 2) código empieza por (soporta búsquedas parciales tipo '3.1').
    if (code.startsWith(query)) {
      matches.push({ entry, score: SCORE_CODE_STARTS_WITH + tiebreak });
      return;
    }
    // 3) título exacto.
    if (title === query) {
      matches.push({ entry, score: SCORE_TITLE_EXACT + tiebreak });
      return;
    }
    // 4) título empieza por.
    if (title.startsWith(query)) {
      matches.push({ entry, score: SCORE_TITLE_STARTS_WITH + tiebreak });
      return;
    }
    // 5) título contiene.
    if (title.includes(query)) {
      matches.push({ entry, score: SCORE_TITLE_CONTAINS + tiebreak });
      return;
    }
    // 6) criteria/modeReview contiene.
    if (requirementText.includes(query)) {
      matches.push({ entry, score: SCORE_CRITERIA_CONTAINS + tiebreak });
      return;
    }
    // 7) descripción contiene.
    if (description.includes(query)) {
      matches.push({ entry, score: SCORE_DESCRIPTION_CONTAINS + tiebreak });
      return;
    }
    // 8) section.title contiene.
    if (sectionTitle.includes(query)) {
      matches.push({ entry, score: SCORE_SECTION_CONTAINS + tiebreak });
      return;
    }
    // 9) chapter contiene.
    if (chapter.includes(query)) {
      matches.push({ entry, score: SCORE_CHAPTER_CONTAINS + tiebreak });
      return;
    }
    // 10) phase contiene.
    if (phase.includes(query)) {
      matches.push({ entry, score: SCORE_PHASE_CONTAINS + tiebreak });
    }
  });

  return matches.sort((a, b) => b.score - a.score);
}
