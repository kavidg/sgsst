import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FirebaseAdminService } from './firebase-admin.service';
import { RequestWithUser } from './auth.types';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [scheme, token] = authorizationHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    try {
      const decodedToken = await this.firebaseAdminService.verifyIdToken(token);
      request.user = { uid: decodedToken.uid };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid Firebase token');
    }
  }
}
