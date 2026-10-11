import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
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
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
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
      // User.companyId is required for company-bound roles and set at
      // registration time.
      if (!user.companyId) {
        if (user.role === 'owner') {
          // Superadmin GLOBAL: la regla de negocio es owner ⇢ companyId NO
          // obligatorio (administra múltiples empresas; NO se le inventa una).
          // Cargarle datos de una empresa concreta es decisión del frontend
          // (empresa activa); para admins/managers/members el error se
          // conserva íntegro (COMPANY-ACCESS-04).
          request.companyId = undefined;
          return true;
        }
        throw new ForbiddenException('User has no associated company');
      }
      companyId = user.companyId;
    }

    if (user.role === 'owner' && !companyIdHeader) {
      // Owner SIN header: su universo son las empresas que posee
      // (Company.ownerId), no CompanyUser. No se le exige membership y NO se
      // restringe al companyId de su perfil (es global).
      request.companyId = undefined;
      return true;
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
      // Owner CON header (empresa activa elegida en el panel): la vinculación
      // del Superadmin es propietaria (Company.ownerId), no CompanyUser.
      if (user.role === 'owner') {
        const ownedCompany = await this.companyModel
          .findOne({ _id: companyId, ownerId: user._id })
          .select({ _id: 1 })
          .exec();
        if (ownedCompany) {
          request.companyId = ownedCompany._id as Types.ObjectId;
          return true;
        }
        throw new ForbiddenException('You do not belong to the requested company');
      }
      throw new ForbiddenException('You do not belong to the requested company');
    }

    request.companyId = membership.companyId;

    return true;
  }
}
