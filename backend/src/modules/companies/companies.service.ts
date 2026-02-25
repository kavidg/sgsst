import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company, CompanyDocument } from './schemas/company.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(firebaseUid: string, createCompanyDto: CreateCompanyDto): Promise<Company> {
    const user = await this.userModel.findOne({ firebaseUid }).exec();

    if (!user) {
      throw new NotFoundException(`User with firebase uid ${firebaseUid} not found`);
    }

    if (user.role !== 'owner') {
      throw new ForbiddenException('Only owners can create companies');
    }

    const company = new this.companyModel({
      name: createCompanyDto.name,
      nit: createCompanyDto.nit,
      ownerId: user._id,
    });

    return company.save();
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
  }

  async remove(id: string): Promise<void> {
    const result = await this.companyModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
  }
}
