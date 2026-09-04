import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { BulkEmployeeItemDto } from './dto/bulk-create-employees.dto';
import { Employee, EmployeeDocument } from './schemas/employee.schema';

// ── Tipos para estadísticas sociodemográficas ──

interface DistributionEntry {
  label: string;
  count: number;
}

export interface SociodemographicStats {
  totalWorkers: number;
  completeProfiles: number;
  completionPercentage: number;
  ageRanges: DistributionEntry[];
  genderDistribution: DistributionEntry[];
  educationDistribution: DistributionEntry[];
  maritalStatusDistribution: DistributionEntry[];
  contractTypeDistribution: DistributionEntry[];
  workScheduleDistribution: DistributionEntry[];
  housingTypeDistribution: DistributionEntry[];
  ethnicGroupDistribution: DistributionEntry[];
  disabilityDistribution: { value: string; count: number }[];
  socioeconomicStratumDistribution: { stratum: number; count: number }[];
  dependentsDistribution: DistributionEntry[];
  recentUpdates: number;
}

interface BulkEmployeeError {
  row: number;
  message: string;
}

interface BulkEmployeesResult {
  inserted: number;
  failed: number;
  errors: BulkEmployeeError[];
}

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateEmployeeDto): Promise<Employee> {
    const created = new this.employeeModel({ ...dto, companyId });
    return created.save();
  }

  async bulkCreate(companyId: Types.ObjectId, employees: BulkEmployeeItemDto[]): Promise<BulkEmployeesResult> {
    const allowedStatus = new Set(['Activo', 'No activo']);
    const errors: BulkEmployeeError[] = [];
    const documentsInFile = new Set<string>();

    const existingDocuments = new Set(
      (
        await this.employeeModel
          .find({ companyId, document: { $in: employees.map((employee) => employee.document?.trim()) } })
          .select('document')
          .lean()
          .exec()
      ).map((employee) => employee.document),
    );

    const validEmployees = employees
      .map((employee, index) => {
        const row = index + 2;
        const name = employee.name?.trim();
        const document = employee.document?.trim();
        const position = employee.position?.trim();
        const area = employee.area?.trim();
        const contractType = employee.contractType?.trim();
        const status = employee.status?.trim();

        if (!name || !document || !position || !area || !contractType || !status) {
          errors.push({ row, message: 'Todos los campos son obligatorios.' });
          return null;
        }

        if (!allowedStatus.has(status)) {
          errors.push({ row, message: 'El estado debe ser "Activo" o "No activo".' });
          return null;
        }

        if (documentsInFile.has(document)) {
          errors.push({ row, message: `Documento duplicado en archivo: ${document}.` });
          return null;
        }

        if (existingDocuments.has(document)) {
          errors.push({ row, message: `Documento ya existe: ${document}.` });
          return null;
        }

        documentsInFile.add(document);

        const normalizedStatus = status === 'Activo';

        return {
          name,
          document,
          position,
          area,
          contractType,
          status: normalizedStatus ? 'Activo' : 'No activo',
          companyId,
        };
      })
      .filter((employee): employee is NonNullable<typeof employee> => employee !== null);

    if (validEmployees.length > 0) {
      await this.employeeModel.insertMany(validEmployees);
    }

    return {
      inserted: validEmployees.length,
      failed: errors.length,
      errors,
    };
  }

  async findAll(companyId: Types.ObjectId): Promise<Employee[]> {
    return this.employeeModel.find({ companyId }).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string, companyId: Types.ObjectId): Promise<Employee> {
    const employee = await this.employeeModel.findOne({ _id: id, companyId }).exec();

    if (!employee) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }

    return employee;
  }

  async update(id: string, companyId: Types.ObjectId, dto: UpdateEmployeeDto): Promise<Employee> {
    const employee = await this.employeeModel
      .findOneAndUpdate({ _id: id, companyId }, dto, { new: true, runValidators: true })
      .exec();

    if (!employee) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }

    return employee;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const result = await this.employeeModel.findOneAndDelete({ _id: id, companyId }).exec();

    if (!result) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }
  }

  // ==================== ESTADÍSTICAS SOCIODEMOGRÁFICAS (3.1.1) ====================

  /**
   * Calcula la edad real a partir de birthDate considerando año, mes y día.
   * No utiliza simplemente currentYear - birthYear.
   */
  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * Clasifica una edad en rangos predefinidos.
   */
  private ageRange(age: number): string {
    if (age < 18) return '< 18';
    if (age <= 25) return '18-25';
    if (age <= 35) return '26-35';
    if (age <= 45) return '36-45';
    if (age <= 55) return '46-55';
    return '56+';
  }

  /**
   * Construye una distribución de frecuencias a partir de un array de empleados.
   * Los campos undefined/null no se incluyen (no se inventan categorías).
   */
  private buildDistribution(
    employees: EmployeeDocument[],
    extractor: (emp: EmployeeDocument) => string | undefined | null,
  ): DistributionEntry[] {
    const counts = new Map<string, number>();
    for (const emp of employees) {
      const value = extractor(emp);
      if (value === undefined || value === null || value === '') continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Devuelve estadísticas sociodemográficas agregadas de los empleados de una empresa.
   *
   * Privacidad: solo retorna datos agregados. Nunca retorna:
   * - nombres
   * - documentos
   * - fechas de nacimiento individuales
   * - correos
   * - teléfonos
   */
  async getSociodemographicStats(companyId: Types.ObjectId): Promise<SociodemographicStats> {
    const employees = await this.employeeModel
      .find({ companyId })
      .exec();

    const totalWorkers = employees.length;

    if (totalWorkers === 0) {
      return {
        totalWorkers: 0,
        completeProfiles: 0,
        completionPercentage: 0,
        ageRanges: [],
        genderDistribution: [],
        educationDistribution: [],
        maritalStatusDistribution: [],
        contractTypeDistribution: [],
        workScheduleDistribution: [],
        housingTypeDistribution: [],
        ethnicGroupDistribution: [],
        disabilityDistribution: [],
        socioeconomicStratumDistribution: [],
        dependentsDistribution: [],
        recentUpdates: 0,
      };
    }

    // ── Perfil completo: birthDate + gender + maritalStatus + educationLevel ──
    let completeProfiles = 0;
    for (const emp of employees) {
      if (emp.birthDate && emp.gender && emp.maritalStatus && emp.educationLevel) {
        completeProfiles++;
      }
    }
    const completionPercentage = Math.round((completeProfiles / totalWorkers) * 100);

    // ── Rangos de edad ──
    const ageRangeCounts = new Map<string, number>();
    for (const emp of employees) {
      if (!emp.birthDate) continue;
      const age = this.calculateAge(emp.birthDate);
      const range = this.ageRange(age);
      ageRangeCounts.set(range, (ageRangeCounts.get(range) ?? 0) + 1);
    }
    const ageRanges = Array.from(ageRangeCounts.entries())
      .map(([label, count]) => ({ label, count }));

    // ── Distribuciones ──
    const genderDistribution = this.buildDistribution(employees, (e) => e.gender);
    const educationDistribution = this.buildDistribution(employees, (e) => e.educationLevel);
    const maritalStatusDistribution = this.buildDistribution(employees, (e) => e.maritalStatus);
    const contractTypeDistribution = this.buildDistribution(employees, (e) => e.contractType);
    const workScheduleDistribution = this.buildDistribution(employees, (e) => e.workSchedule);
    const housingTypeDistribution = this.buildDistribution(employees, (e) => e.housingType);
    const ethnicGroupDistribution = this.buildDistribution(employees, (e) => e.ethnicGroup);

    // Disability: conteo por valor (true/false) de los que tienen el campo definido
    const disabilityTrue = employees.filter((e) => e.disability === true).length;
    const disabilityFalse = employees.filter((e) => e.disability === false).length;
    const disabilityDistribution: { value: string; count: number }[] = [];
    if (disabilityTrue > 0) disabilityDistribution.push({ value: 'SÍ', count: disabilityTrue });
    if (disabilityFalse > 0) disabilityDistribution.push({ value: 'NO', count: disabilityFalse });

    // Socioeconomic stratum
    const stratumCounts = new Map<number, number>();
    for (const emp of employees) {
      if (emp.socioeconomicStratum === undefined || emp.socioeconomicStratum === null) continue;
      stratumCounts.set(emp.socioeconomicStratum, (stratumCounts.get(emp.socioeconomicStratum) ?? 0) + 1);
    }
    const socioeconomicStratumDistribution = Array.from(stratumCounts.entries())
      .map(([stratum, count]) => ({ stratum, count }))
      .sort((a, b) => a.stratum - b.stratum);

    // Dependents distribution
    const dependentsRanges = new Map<string, number>();
    for (const emp of employees) {
      if (emp.dependents === undefined || emp.dependents === null) continue;
      let range: string;
      if (emp.dependents === 0) range = '0';
      else if (emp.dependents <= 2) range = '1-2';
      else if (emp.dependents <= 4) range = '3-4';
      else range = '5+';
      dependentsRanges.set(range, (dependentsRanges.get(range) ?? 0) + 1);
    }
    const dependentsDistribution = Array.from(dependentsRanges.entries())
      .map(([label, count]) => ({ label, count }));

    // ── Recent updates: empleados actualizados en los últimos 30 días ──
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUpdates = employees.filter((e) => {
      const updatedAt = (e as unknown as { updatedAt?: Date }).updatedAt;
      return updatedAt && new Date(updatedAt).getTime() >= thirtyDaysAgo.getTime();
    }).length;

    return {
      totalWorkers,
      completeProfiles,
      completionPercentage,
      ageRanges,
      genderDistribution,
      educationDistribution,
      maritalStatusDistribution,
      contractTypeDistribution,
      workScheduleDistribution,
      housingTypeDistribution,
      ethnicGroupDistribution,
      disabilityDistribution,
      socioeconomicStratumDistribution,
      dependentsDistribution,
      recentUpdates,
    };
  }
}
