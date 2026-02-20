import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company, CompanyDocument } from './schemas/company.schema';

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
  ) {}

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    try {
      const company = new this.companyModel(createCompanyDto);
      return await company.save();
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        throw new ConflictException('A company with this NIT already exists');
      }
      throw error;
    }
  }

  findAll(): Promise<Company[]> {
    return this.companyModel.find().exec();
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.companyModel.findById(id).exec();

    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto): Promise<Company> {
    try {
      const company = await this.companyModel
        .findByIdAndUpdate(id, updateCompanyDto, {
          new: true,
          runValidators: true,
        })
        .exec();

      if (!company) {
        throw new NotFoundException(`Company with id ${id} not found`);
      }

      return company;
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        throw new ConflictException('A company with this NIT already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.companyModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
  }
}
