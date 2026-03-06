import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Employee, EmployeeDocument } from './schemas/employee.schema';

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
