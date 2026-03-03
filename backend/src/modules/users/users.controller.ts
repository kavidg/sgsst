import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AuthenticatedUser, RequestWithUser } from '../auth/auth.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { CompanyAccessGuard } from '../auth/company-access.guard';

@Controller('users')
@UseGuards(FirebaseAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async createUser(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: CreateUserDto): Promise<User> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.usersService.createUserByRole(user.uid, dto);
  }

  @Get('admins')
  async findOwnerAdmins(@CurrentUser() user: AuthenticatedUser | undefined): Promise<User[]> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.usersService.listUsersByRoleForOwner(user.uid, 'admin');
  }

  @Post('admins')
  async createAdmin(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: CreateUserDto): Promise<User> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.usersService.createUserForOwner(user.uid, 'admin', dto);
  }

  @Patch('admins/:id')
  async updateAdmin(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.usersService.updateUserForOwner(user.uid, userId, 'admin', dto);
  }

  @Delete('admins/:id')
  async removeAdmin(@CurrentUser() user: AuthenticatedUser | undefined, @Param('id') userId: string): Promise<void> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.usersService.removeUserForOwner(user.uid, userId, 'admin');
  }

  @Get('members')
  @UseGuards(CompanyAccessGuard)
  async findOwnerMembers(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: RequestWithUser,
  ): Promise<User[]> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    if (!request.companyId) {
      throw new ForbiddenException('Missing active company context');
    }

    return this.usersService.listMembersForManager(user.uid, request.companyId);
  }

  @Post('members')
  @UseGuards(CompanyAccessGuard)
  async createMember(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: RequestWithUser,
    @Body() dto: CreateUserDto,
  ): Promise<User> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    if (!request.companyId) {
      throw new ForbiddenException('Missing active company context');
    }

    return this.usersService.createMemberForManager(user.uid, dto, request.companyId);
  }

  @Patch('members/:id')
  @UseGuards(CompanyAccessGuard)
  async updateMember(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.usersService.updateMemberForManager(user.uid, userId, dto);
  }

  @Delete('members/:id')
  @UseGuards(CompanyAccessGuard)
  async removeMember(@CurrentUser() user: AuthenticatedUser | undefined, @Param('id') userId: string): Promise<void> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.usersService.removeMemberForManager(user.uid, userId);
  }

  @Get('by-firebase/:uid')
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
