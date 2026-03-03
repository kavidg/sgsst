import { MyCompanyModel } from './api';

interface CompanySelectorProps {
  companies: MyCompanyModel[];
  activeCompanyId: string;
  onSelectCompany: (companyId: string) => void;
}

export function CompanySelector({ companies, activeCompanyId, onSelectCompany }: CompanySelectorProps) {
  return (
    <label style={{ display: 'grid', gap: '0.25rem', maxWidth: 320 }}>
      Empresa activa
      <select value={activeCompanyId} onChange={(event) => onSelectCompany(event.target.value)}>
        <option value="">Selecciona una empresa</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
    </label>
  );
}
