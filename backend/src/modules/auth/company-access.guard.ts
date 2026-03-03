import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CompanyUser, CompanyUserDocument } from '../companies/schemas/company-user.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RequestWithUser } from './auth.types';

@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(CompanyUser.name)
    private readonly companyUserModel: Model<CompanyUserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authenticatedUser = request.user;

    if (!authenticatedUser) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const companyIdHeader = request.headers['x-company-id'];

    if (!companyIdHeader || typeof companyIdHeader !== 'string') {
      throw new ForbiddenException('Missing x-company-id header');
    }

    if (!Types.ObjectId.isValid(companyIdHeader)) {
      throw new ForbiddenException('Invalid x-company-id header');
    }

    const user = await this.userModel.findOne({ firebaseUid: authenticatedUser.uid }, { _id: 1 }).exec();

    if (!user) {
      throw new ForbiddenException('Authenticated user is not registered');
    }

    const membership = await this.companyUserModel
      .findOne({
        userId: user._id,
        companyId: new Types.ObjectId(companyIdHeader),
      })
      .exec();

    if (!membership) {
      throw new ForbiddenException('You do not belong to the requested company');
    }

    request.companyId = membership.companyId;

    return true;
  }
}
