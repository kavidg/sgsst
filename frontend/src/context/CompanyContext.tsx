import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import {
  clearActiveCompanyId,
  clearActiveCompanyStandardsType,
  getActiveCompanyId,
  getActiveCompanyStandardsType,
  setActiveCompanyId as persistActiveCompanyId,
  setActiveCompanyStandardsType as persistActiveCompanyStandardsType,
} from '../api';

type CompanyContextValue = {
  companyId: string;
  setCompanyId: (nextCompanyId: string) => void;
  /**
   * Tipo de estándares de la empresa activa ('7' | '21' | '60').
   * Persistido junto con la empresa activa. Fallback '60' si no existe
   * empresa activa o no hay valor persistido (FASE 7.2).
   */
  standardsType: string;
  setStandardsType: (nextStandardsType: string) => void;
};

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

type CompanyProviderProps = {
  children: ReactNode;
};

export function CompanyProvider({ children }: CompanyProviderProps) {
  const [companyId, setCompanyIdState] = useState(() => getActiveCompanyId() ?? '');
  const [standardsType, setStandardsTypeState] = useState(() => getActiveCompanyStandardsType() ?? '60');

  const setCompanyId = useCallback((nextCompanyId: string) => {
    setCompanyIdState(nextCompanyId);

    if (nextCompanyId) {
      persistActiveCompanyId(nextCompanyId);
      return;
    }

    clearActiveCompanyId();
    clearActiveCompanyStandardsType();
  }, []);

  const setStandardsType = useCallback((nextStandardsType: string) => {
    setStandardsTypeState(nextStandardsType);
    persistActiveCompanyStandardsType(nextStandardsType);
  }, []);

  const value = useMemo(
    () => ({
      companyId,
      setCompanyId,
      standardsType: companyId ? standardsType : '60',
      setStandardsType,
    }),
    [companyId, setCompanyId, setStandardsType, standardsType],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanyContext() {
  const context = useContext(CompanyContext);

  if (!context) {
    throw new Error('useCompanyContext debe usarse dentro de CompanyProvider');
  }

  return context;
}
