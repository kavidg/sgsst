import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { BulkEmployeeItemDto } from './dto/bulk-create-employees.dto';
import { Employee, EmployeeDocument } from './schemas/employee.schema';

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
}
