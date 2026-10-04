// E1 — Buscador Sidebar: utilidades PURAS (fáciles de probar y de reutilizar).
// No acceden a React, ni a API, ni a backend. Solo texto + config del menú.

import { SidebarLink } from './sidebarConfig';

// Normalización para V1: case-insensitive + tolerante a acentos (NFD y
// eliminación de diacríticos). Sin fuzzy search externo: substring basta.
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export type MenuSearchMatch = {
  link: SidebarLink;
  score: number;
};

// Ranking determinista (mayor score primero). Prioridad:
// 1) label exacto; 2) label empieza por la búsqueda; 3) label contiene;
// 4) standardCode; 5) keywords; 6) description; 7) ruta.
const SCORE_EXACT_LABEL = 100;
const SCORE_LABEL_STARTS_WITH = 80;
const SCORE_LABEL_CONTAINS = 60;
const SCORE_STANDARD_CODE = 50;
const SCORE_KEYWORD = 40;
const SCORE_DESCRIPTION = 30;
const SCORE_PATH = 20;
const SCORE_TIEBREAK_ORIGINAL_ORDER = 0;

export function searchSidebarLinks(links: SidebarLink[], rawQuery: string): MenuSearchMatch[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return [];
  }

  const matches: MenuSearchMatch[] = [];

  links.forEach((link, index) => {
    const label = normalizeSearchText(link.label);
    const standardCode = link.standardCode ? normalizeSearchText(link.standardCode) : '';
    const keywords = (link.keywords ?? []).map((keyword) => normalizeSearchText(keyword));
    const description = link.description ? normalizeSearchText(link.description) : '';
    const path = normalizeSearchText(link.to);

    // Prioridad 1: coincidencia exacta del label.
    if (label === query) {
      matches.push({ link, score: SCORE_EXACT_LABEL + SCORE_TIEBREAK_ORIGINAL_ORDER - index });
      return;
    }

    // Prioridad 2: el label empieza por la búsqueda.
    if (label.startsWith(query)) {
      matches.push({ link, score: SCORE_LABEL_STARTS_WITH - index });
      return;
    }

    // Prioridad 3: el label contiene la búsqueda.
    if (label.includes(query)) {
      matches.push({ link, score: SCORE_LABEL_CONTAINS - index });
      return;
    }

    // Prioridad 4: coincidencia en el código de estándar.
    if (standardCode && standardCode.includes(query)) {
      matches.push({ link, score: SCORE_STANDARD_CODE - index });
      return;
    }

    // Prioridad 5: coincidencia en keywords (parcial dentro del keyword).
    if (keywords.some((keyword) => keyword.includes(query))) {
      matches.push({ link, score: SCORE_KEYWORD - index });
      return;
    }

    // Prioridad 6: coincidencia en description.
    if (description.includes(query)) {
      matches.push({ link, score: SCORE_DESCRIPTION - index });
      return;
    }

    // Prioridad 7: coincidencia en la ruta (útil para "3.2.3" → ?standard=3.2.3 o /accident-statistics).
    if (path.includes(query)) {
      matches.push({ link, score: SCORE_PATH - index });
      return;
    }
  });

  return matches.sort((a, b) => b.score - a.score);
}
