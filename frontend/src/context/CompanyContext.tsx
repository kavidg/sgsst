import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { clearActiveCompanyId, getActiveCompanyId, setActiveCompanyId as persistActiveCompanyId } from '../api';

type CompanyContextValue = {
  companyId: string;
  setCompanyId: (nextCompanyId: string) => void;
};

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

type CompanyProviderProps = {
  children: ReactNode;
};

export function CompanyProvider({ children }: CompanyProviderProps) {
  const [companyId, setCompanyIdState] = useState(() => getActiveCompanyId() ?? '');

  const setCompanyId = (nextCompanyId: string) => {
    setCompanyIdState(nextCompanyId);

    if (nextCompanyId) {
      persistActiveCompanyId(nextCompanyId);
      return;
    }

    clearActiveCompanyId();
  };

  const value = useMemo(
    () => ({
      companyId,
      setCompanyId,
    }),
    [companyId],
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
