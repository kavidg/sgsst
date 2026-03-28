import { MyCompanyModel } from './api';
import { Select } from './components/ui/Select';

interface CompanySelectorProps {
  companies: MyCompanyModel[];
  activeCompanyId: string;
  onSelectCompany: (companyId: string) => void;
}

export function CompanySelector({ companies, activeCompanyId, onSelectCompany }: CompanySelectorProps) {
  return (
    <label className="field" style={{ maxWidth: 360 }}>
      <span className="label">Empresa activa</span>
      <Select value={activeCompanyId} onChange={(event) => onSelectCompany(event.target.value)}>
        <option value="">Selecciona una empresa</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
