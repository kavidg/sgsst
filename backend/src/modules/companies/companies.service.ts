import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyUser, CompanyUserDocument } from './schemas/company-user.schema';
import { Company, CompanyDocument } from './schemas/company.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

export interface MyCompanyResponse {
  id: string;
  name: string;
  nit: string;
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(CompanyUser.name)
    private readonly companyUserModel: Model<CompanyUserDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(firebaseUid: string, createCompanyDto: CreateCompanyDto): Promise<Company> {
    const user = await this.ensureOwner(firebaseUid);

    const company = new this.companyModel({
      name: createCompanyDto.name,
      nit: createCompanyDto.nit,
      ownerId: user._id,
    });

    return company.save();
  }

  async findAllByOwner(firebaseUid: string): Promise<Company[]> {
    const owner = await this.ensureOwner(firebaseUid);

    return this.companyModel.find({ ownerId: owner._id }).sort({ createdAt: -1 }).exec();
  }

  async findMyCompanies(firebaseUid: string): Promise<MyCompanyResponse[]> {
    const user = await this.userModel.findOne({ firebaseUid }, { _id: 1 }).exec();

    if (!user) {
      throw new NotFoundException(`User with firebase uid ${firebaseUid} not found`);
    }

    const memberships = await this.companyUserModel
      .find({ userId: user._id })
      .populate<{ companyId: CompanyDocument }>('companyId')
      .exec();

    return memberships
      .filter((membership) => !!membership.companyId)
      .map((membership) => ({
        id: membership.companyId._id.toString(),
        name: membership.companyId.name,
        nit: membership.companyId.nit,
      }));
  }

  async findOneByOwner(firebaseUid: string, id: string): Promise<Company> {
    const owner = await this.ensureOwner(firebaseUid);
    const company = await this.companyModel.findOne({ _id: id, ownerId: owner._id }).exec();

    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    return company;
  }

  async updateByOwner(firebaseUid: string, id: string, updateCompanyDto: UpdateCompanyDto): Promise<Company> {
    const owner = await this.ensureOwner(firebaseUid);
    const company = await this.companyModel
      .findOneAndUpdate({ _id: id, ownerId: owner._id }, updateCompanyDto, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    return company;
  }

  async removeByOwner(firebaseUid: string, id: string): Promise<void> {
    const owner = await this.ensureOwner(firebaseUid);
    const result = await this.companyModel.findOneAndDelete({ _id: id, ownerId: owner._id }).exec();

    if (!result) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
  }

  private async ensureOwner(firebaseUid: string): Promise<UserDocument> {
    const user = await this.userModel.findOne({ firebaseUid }).exec();

    if (!user) {
      throw new NotFoundException(`User with firebase uid ${firebaseUid} not found`);
    }

    if (user.role !== 'owner') {
      throw new ForbiddenException('Only owners can perform this action');
    }

    return user;
  }
}
