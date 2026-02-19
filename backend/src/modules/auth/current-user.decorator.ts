import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser, RequestWithUser } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
