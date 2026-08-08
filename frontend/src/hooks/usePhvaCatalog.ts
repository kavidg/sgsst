/**
 * Hook del PHVA Catalog (FASE 7.2 — conexión frontend con StandardCatalog).
 *
 * Obtiene el standardsType de la empresa activa (CompanyContext), obtiene el
 * token Firebase y consume fetchPhvaCatalog().
 *
 * Fallback: si el endpoint falla NO lanza excepción — retorna `catalog = []`
 * y `error = true`, de modo que la fase siguiente pueda seguir usando los
 * arrays legacy del PHVA sin romper ninguna pantalla.
 */
import { useCallback, useEffect, useState } from 'react';
import { useCompanyContext } from '../context/CompanyContext';
import { getCurrentUserIdToken } from '../firebase';
import { fetchPhvaCatalog, PhvaCatalogItem } from '../services/phva-catalog.service';

export type UsePhvaCatalogResult = {
  /** Catálogo PHVA del nivel de la empresa activa ([] si el endpoint falla). */
  catalog: PhvaCatalogItem[];
  /** true mientras se realiza la petición. */
  loading: boolean;
  /** true si el endpoint falló (catalog queda []). */
  error: boolean;
  /** Refresca el catálogo manualmente. */
  refresh: () => Promise<void>;
};

/**
 * @param token Token Firebase opcional. Si no se provee, el hook lo obtiene
 * de la sesión actual (`auth().currentUser`).
 */
export function usePhvaCatalog(token?: string): UsePhvaCatalogResult {
  const { standardsType } = useCompanyContext();
  const [catalog, setCatalog] = useState<PhvaCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const resolvedToken = token ?? (await getCurrentUserIdToken());
      if (!resolvedToken) {
        // Sin sesión activa: no hay catálogo disponible (fallback silencioso).
        setCatalog([]);
        setError(true);
        return;
      }

      setLoading(true);
      setError(false);
      const items = await fetchPhvaCatalog(standardsType, resolvedToken);
      setCatalog(items);
    } catch {
      // El endpoint falló: NO lanzamos excepción. La siguiente fase seguirá
      // usando los arrays legacy del PHVA.
      setCatalog([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [standardsType, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { catalog, loading, error, refresh };
}
