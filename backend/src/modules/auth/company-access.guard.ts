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

    const user = await this.userModel.findOne({ firebaseUid: authenticatedUser.uid }).exec();

    if (!user) {
      throw new ForbiddenException('Authenticated user is not registered');
    }

    // Enrich request.user with MongoDB _id, email and role so controllers can use them
    request.user = {
      ...authenticatedUser,
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    // Resolve companyId: prefer x-company-id header if provided (backward
    // compatibility), otherwise derive from the authenticated user's profile.
    // The header path validates membership via CompanyUser. The auto-derive
    // path ALSO validates membership — so tenant isolation is enforced either
    // way and the header can never be used to access another company.
    const companyIdHeader = request.headers['x-company-id'];

    let companyId: Types.ObjectId;

    if (companyIdHeader && typeof companyIdHeader === 'string') {
      // Header provided: validate it's a valid ObjectId
      if (!Types.ObjectId.isValid(companyIdHeader)) {
        throw new ForbiddenException('Invalid x-company-id header');
      }
      companyId = new Types.ObjectId(companyIdHeader);
    } else {
      // No header: auto-derive from the user's own companyId.
      // User.companyId is required in the schema and set at registration time.
      if (!user.companyId) {
        throw new ForbiddenException('User has no associated company');
      }
      companyId = user.companyId;
    }

    // ALWAYS validate membership via CompanyUser — even when companyId comes
    // from the user's own profile. This prevents stale companyId values and
    // ensures the user is an active member of the company.
    const membership = await this.companyUserModel
      .findOne({
        userId: user._id,
        companyId,
      })
      .exec();

    if (!membership) {
      throw new ForbiddenException('You do not belong to the requested company');
    }

    request.companyId = membership.companyId;

    return true;
  }
}
