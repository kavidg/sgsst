import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FirebaseAdminService } from '../auth/firebase-admin.service';
import { CompanyUser, CompanyUserDocument } from '../companies/schemas/company-user.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';

type ManagedRole = 'admin' | 'member' | 'manager';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(CompanyUser.name)
    private readonly companyUserModel: Model<CompanyUserDocument>,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return this.userModel.findOne({ firebaseUid }).exec();
  }

  async createUserByRole(requestingUserUid: string, dto: CreateUserDto): Promise<User> {
    const requestingUser = await this.userModel.findOne({ firebaseUid: requestingUserUid }).exec();

    if (!requestingUser) {
      throw new NotFoundException(`Requesting user with firebase uid ${requestingUserUid} not found`);
    }

    if (requestingUser.role === 'member' || requestingUser.role === 'manager') {
      throw new ForbiddenException('Members and managers are not allowed to create users');
    }

    if (requestingUser.role === 'owner' && dto.role !== 'admin') {
      throw new ForbiddenException('Owners can only create admin users');
    }

    if (requestingUser.role === 'admin' && dto.role !== 'member' && dto.role !== 'manager') {
      throw new ForbiddenException('Admins can only create member or manager users');
    }

    if (requestingUser.role === 'admin' && dto.companyId) {
      throw new ForbiddenException('Admins cannot assign companyId when creating users');
    }

    const companyId = await this.resolveTargetCompanyId(requestingUser, dto);

    return this.createFirebaseAndMongoUser(dto, companyId);
  }

  async listUsersByRoleForOwner(ownerUid: string, role: ManagedRole): Promise<User[]> {
    const owner = await this.ensureOwner(ownerUid);
    const companies = await this.companyModel.find({ ownerId: owner._id }, { _id: 1 }).exec();
    const companyIds = companies.map((company) => company._id);

    return this.userModel.find({ role, companyId: { $in: companyIds } }).sort({ createdAt: -1 }).exec();
  }

  async listMembersForManager(managerUid: string, activeCompanyId: Types.ObjectId): Promise<User[]> {
    const manager = await this.ensureOwnerOrAdmin(managerUid);

    if (manager.role === 'owner') {
      await this.ensureUserBelongsToOwnerCompanies(manager._id, activeCompanyId);
      return this.userModel.find({ role: 'member', companyId: activeCompanyId }).sort({ createdAt: -1 }).exec();
    }

    await this.ensureUserBelongsToCompany(manager._id, activeCompanyId);

    return this.userModel.find({ role: 'member', companyId: activeCompanyId }).sort({ createdAt: -1 }).exec();
  }

  async createUserForOwner(ownerUid: string, role: ManagedRole, dto: CreateUserDto): Promise<User> {
    await this.ensureOwner(ownerUid);

    if (dto.role !== role) {
      throw new BadRequestException(`Role must be ${role}`);
    }

    const companyId = await this.resolveOwnerCompanyId(ownerUid, dto.companyId);

    return this.createFirebaseAndMongoUser(dto, companyId);
  }

  async createMemberForManager(managerUid: string, dto: CreateUserDto, activeCompanyId: Types.ObjectId): Promise<User> {
    const manager = await this.ensureOwnerOrAdmin(managerUid);

    if (dto.role !== 'member') {
      throw new BadRequestException('Role must be member');
    }

    if (manager.role === 'owner') {
      await this.ensureUserBelongsToOwnerCompanies(manager._id, activeCompanyId);
    } else {
      await this.ensureUserBelongsToCompany(manager._id, activeCompanyId);
    }

    return this.createFirebaseAndMongoUser({ ...dto, companyId: undefined }, activeCompanyId);
  }

  async updateUserForOwner(
    ownerUid: string,
    userId: string,
    role: ManagedRole,
    dto: UpdateUserDto,
  ): Promise<User> {
    const owner = await this.ensureOwner(ownerUid);
    const targetUser = await this.userModel.findById(userId).exec();

    if (!targetUser || targetUser.role !== role) {
      throw new NotFoundException(`User with id ${userId} and role ${role} not found`);
    }

    await this.ensureUserBelongsToOwnerCompanies(owner._id, targetUser.companyId);

    if (dto.role && dto.role !== role) {
      throw new BadRequestException(`Role cannot be changed from ${role}`);
    }

    const updatePayload: Partial<User> = {};

    if (dto.companyId) {
      updatePayload.companyId = await this.resolveOwnerCompanyId(ownerUid, dto.companyId);
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, updatePayload, { new: true, runValidators: true })
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    return updatedUser;
  }

  async removeUserForOwner(ownerUid: string, userId: string, role: ManagedRole): Promise<void> {
    const owner = await this.ensureOwner(ownerUid);
    const user = await this.userModel.findById(userId).exec();

    if (!user || user.role !== role) {
      throw new NotFoundException(`User with id ${userId} and role ${role} not found`);
    }

    await this.ensureUserBelongsToOwnerCompanies(owner._id, user.companyId);

    await this.userModel.findByIdAndDelete(userId).exec();
  }

  async updateMemberForManager(
    managerUid: string,
    userId: string,
    dto: UpdateUserDto,
    activeCompanyId: Types.ObjectId,
  ): Promise<User> {
    const manager = await this.ensureOwnerOrAdmin(managerUid);
    const targetUser = await this.userModel.findById(userId).exec();

    if (!targetUser || targetUser.role !== 'member') {
      throw new NotFoundException(`User with id ${userId} and role member not found`);
    }

    const updatePayload: Partial<User> = {};

    if (dto.role && dto.role !== 'member') {
      throw new BadRequestException('Role cannot be changed from member');
    }

    if (manager.role === 'owner') {
      await this.ensureUserBelongsToOwnerCompanies(manager._id, targetUser.companyId);

      if (dto.companyId) {
        updatePayload.companyId = await this.resolveOwnerCompanyId(managerUid, dto.companyId);
      }
    } else {
      await this.ensureUserBelongsToCompany(manager._id, activeCompanyId);

      if (!targetUser.companyId.equals(activeCompanyId)) {
        throw new ForbiddenException('Target user does not belong to the active company');
      }

      if (dto.companyId && dto.companyId !== activeCompanyId.toString()) {
        throw new ForbiddenException('Admins can only manage members from their active company');
      }
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, updatePayload, { new: true, runValidators: true })
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    return updatedUser;
  }

  async removeMemberForManager(
    managerUid: string,
    userId: string,
    activeCompanyId: Types.ObjectId,
  ): Promise<void> {
    const manager = await this.ensureOwnerOrAdmin(managerUid);
    const user = await this.userModel.findById(userId).exec();

    if (!user || user.role !== 'member') {
      throw new NotFoundException(`User with id ${userId} and role member not found`);
    }

    if (manager.role === 'owner') {
      await this.ensureUserBelongsToOwnerCompanies(manager._id, user.companyId);
    } else {
      await this.ensureUserBelongsToCompany(manager._id, activeCompanyId);

      if (!user.companyId.equals(activeCompanyId)) {
        throw new ForbiddenException('Target user does not belong to the active company');
      }
    }

    await this.userModel.findByIdAndDelete(userId).exec();
  }

  private async createFirebaseAndMongoUser(dto: CreateUserDto, companyId: Types.ObjectId): Promise<User> {
    const existingUser = await this.userModel.findOne({ email: dto.email }).exec();

    if (existingUser) {
      throw new BadRequestException('A user with this email already exists in MongoDB');
    }

    const firebaseUser = await this.firebaseAdminService.createUser({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
    });

    const user = await this.userModel.create({
      firebaseUid: firebaseUser.uid,
      email: dto.email,
      role: dto.role,
      companyId,
    });

    await this.companyUserModel.updateOne(
      { companyId, userId: user._id },
      { $setOnInsert: { companyId, userId: user._id } },
      { upsert: true },
    );

    return user;
  }

  private async ensureOwner(uid: string): Promise<UserDocument> {
    const user = await this.userModel.findOne({ firebaseUid: uid }).exec();

    if (!user) {
      throw new NotFoundException(`User with firebase uid ${uid} not found`);
    }

    if (user.role !== 'owner') {
      throw new ForbiddenException('Only owners can perform this action');
    }

    return user;
  }

  private async ensureOwnerOrAdmin(uid: string): Promise<UserDocument> {
    const user = await this.userModel.findOne({ firebaseUid: uid }).exec();

    if (!user) {
      throw new NotFoundException(`User with firebase uid ${uid} not found`);
    }

    if (user.role !== 'owner' && user.role !== 'admin') {
      throw new ForbiddenException('Only owners or admins can perform this action');
    }

    return user;
  }

  private async ensureUserBelongsToOwnerCompanies(ownerId: Types.ObjectId, companyId: Types.ObjectId): Promise<void> {
    const company = await this.companyModel.findOne({ _id: companyId, ownerId }).exec();

    if (!company) {
      throw new ForbiddenException('Target user does not belong to one of your companies');
    }
  }

  private async ensureUserBelongsToCompany(userId: Types.ObjectId, companyId: Types.ObjectId): Promise<void> {
    const membership = await this.companyUserModel.findOne({ userId, companyId }).exec();

    if (!membership) {
      throw new ForbiddenException('You do not belong to the requested company');
    }
  }

  private async resolveOwnerCompanyId(ownerUid: string, companyId: string | undefined): Promise<Types.ObjectId> {
    if (!companyId) {
      throw new BadRequestException('companyId is required');
    }

    const owner = await this.ensureOwner(ownerUid);
    const company = await this.companyModel.findOne({ _id: companyId, ownerId: owner._id }).exec();

    if (!company) {
      throw new NotFoundException(`Company with id ${companyId} not found for owner`);
    }

    return company._id;
  }

  private async resolveTargetCompanyId(requestingUser: UserDocument, dto: CreateUserDto): Promise<Types.ObjectId> {
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

    const adminCompanyMembership = await this.companyUserModel
      .findOne({ userId: requestingUser._id, companyId: requestingUser.companyId })
      .exec();

    if (!adminCompanyMembership) {
      throw new ForbiddenException('Admin user is not linked to the target company');
    }

    return requestingUser.companyId;
  }
}
