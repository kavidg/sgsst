import { Injectable } from '@nestjs/common';
import { VariableContext } from '../types/document-generation.types';

/**
 * VariableResolverService: preparado para resolver variables dinámicas.
 *
 * Convierte una lista de variables ("company.name", "responsible.name") en un
 * objeto listo para el renderer. Soporta DOS formas de contexto:
 *
 *   - Nuevo (anidado):  { company: { name: "ABC" } }
 *   - Legado (plano):   { companyName: "ABC" }  o  { "company.name": "ABC" }
 *
 * La salida siempre es anidada por path ("company.name" → { company: { name } }),
 * que es lo que el parser de DocxRenderer resuelve punto a punto. Si una
 * variable no existe, devuelve null (sin lanzar excepción).
 */
@Injectable()
export class VariableResolverService {
  /**
   * Construye la estructura de variables a partir de la lista de la plantilla.
   *
   * @param variables - Variables declaradas por la plantilla (rutas con puntos).
   * @param context - Contexto opcional (anidado nuevo o plano legado).
   */
  resolve(variables: string[], context?: VariableContext | Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const variable of variables) {
      const path = this.splitPath(variable);
      this.assignPath(resolved, path, context);
    }

    return resolved;
  }

  private splitPath(variable: string): string[] {
    return variable
      .split('.')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  private assignPath(
    target: Record<string, unknown>,
    path: string[],
    context?: VariableContext,
  ): void {
    let cursor: Record<string, unknown> = target;

    for (let index = 0; index < path.length; index += 1) {
      const part = path[index];
      const isLeaf = index === path.length - 1;

      if (isLeaf) {
        cursor[part] = this.lookup(context, path);
        return;
      }

      const existing = cursor[part];

      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        cursor = existing as Record<string, unknown>;
      } else {
        const next: Record<string, unknown> = {};
        cursor[part] = next;
        cursor = next;
      }
    }
  }

  /**
   * Busca el valor de la variable completa en el contexto. Si no existe,
   * devuelve null (sin lanzar excepción).
   *
   * Estrategia de búsqueda:
   *   1. Clave plana legada: el frontend envía "company.name" como clave literal
   *      (GenerateTemplatePayload.data: Record<string, ...>).
   *   2. Contexto anidado nuevo: recorrer el path parte a parte.
   */
  private lookup(context: VariableContext | Record<string, unknown> | undefined, path: string[]): unknown {
    if (!context) {
      return null;
    }

    const record = context as Record<string, unknown>;
    const flatKey = path.join('.');

    // hasOwnProperty evita falsos positivos de la cadena de prototipos
    // (p. ej. una variable llamada literalmente "toString" o "constructor").
    if (Object.prototype.hasOwnProperty.call(record, flatKey)) {
      return record[flatKey];
    }

    let current: unknown = context;

    for (const part of path) {
      if (current === null || typeof current !== 'object') {
        return null;
      }

      const currentRecord = current as Record<string, unknown>;

      if (!(part in currentRecord)) {
        return null;
      }

      current = currentRecord[part];
    }

    return current;
  }
}
