import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FirebaseAdminService } from '../auth/firebase-admin.service';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return this.userModel.findOne({ firebaseUid }).exec();
  }

  async createUserByRole(requestingUserUid: string, dto: CreateUserDto): Promise<User> {
    const requestingUser = await this.userModel
      .findOne({ firebaseUid: requestingUserUid })
      .exec();

    if (!requestingUser) {
      throw new NotFoundException(`Requesting user with firebase uid ${requestingUserUid} not found`);
    }

    if (requestingUser.role === 'member') {
      throw new ForbiddenException('Members are not allowed to create users');
    }

    if (requestingUser.role === 'owner' && dto.role !== 'admin') {
      throw new ForbiddenException('Owners can only create admin users');
    }

    if (requestingUser.role === 'admin' && dto.role !== 'member') {
      throw new ForbiddenException('Admins can only create member users');
    }

    if (requestingUser.role === 'admin' && dto.companyId) {
      throw new ForbiddenException('Admins cannot assign companyId when creating users');
    }

    const companyId = await this.resolveTargetCompanyId(requestingUser, dto);

    const existingUser = await this.userModel.findOne({ email: dto.email }).exec();

    if (existingUser) {
      throw new BadRequestException('A user with this email already exists in MongoDB');
    }

    const firebaseUser = await this.firebaseAdminService.createUser({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
    });

    return this.userModel.create({
      firebaseUid: firebaseUser.uid,
      email: dto.email,
      role: dto.role,
      companyId,
    });
  }

  private async resolveTargetCompanyId(
    requestingUser: UserDocument,
    dto: CreateUserDto,
  ): Promise<Types.ObjectId> {
    if (requestingUser.role === 'owner') {
      if (!dto.companyId) {
        throw new BadRequestException('Owners must provide companyId when creating admin users');
      }

      const company = await this.companyModel.findById(dto.companyId).exec();

      if (!company) {
        throw new NotFoundException(`Company with id ${dto.companyId} not found`);
      }

      return company._id;
    }

    return requestingUser.companyId;
  }
}
