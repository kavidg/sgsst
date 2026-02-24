import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(FirebaseAuthGuard)
  async createUser(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: CreateUserDto): Promise<User> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.usersService.createUserByRole(user.uid, dto);
  }

  @Get('by-firebase/:uid')
  @UseGuards(FirebaseAuthGuard)
  async findByFirebaseUid(
    @CurrentUser() authenticatedUser: AuthenticatedUser | undefined,
    @Param('uid') uid: string,
  ): Promise<User> {
    if (!authenticatedUser) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    if (authenticatedUser.uid !== uid) {
      throw new UnauthorizedException('Firebase uid does not match authenticated user');
    }
    const user = await this.usersService.findByFirebaseUid(uid);

    if (!user) {
      throw new NotFoundException(`User with firebase uid ${uid} not found`);
    }

    return user;
  }
}
