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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AuthenticatedUser, RequestWithUser } from '../auth/auth.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
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
    @Req() request: RequestWithUser,
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    if (!request.companyId) {
      throw new ForbiddenException('Missing active company context');
    }

    return this.usersService.updateMemberForManager(user.uid, userId, dto, request.companyId);
  }

  @Delete('members/:id')
  @UseGuards(CompanyAccessGuard)
  async removeMember(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: RequestWithUser,
    @Param('id') userId: string,
  ): Promise<void> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    if (!request.companyId) {
      throw new ForbiddenException('Missing active company context');
    }

    return this.usersService.removeMemberForManager(user.uid, userId, request.companyId);
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

  @Get('me')
  async getMyProfile(
    @CurrentUser() authenticatedUser: AuthenticatedUser | undefined,
  ): Promise<User> {
    if (!authenticatedUser) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const user = await this.usersService.findByFirebaseUid(authenticatedUser.uid);

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return user;
  }

  @Patch('me')
  async updateMyProfile(
    @CurrentUser() authenticatedUser: AuthenticatedUser | undefined,
    @Body() dto: UpdateProfileDto,
  ): Promise<User> {
    if (!authenticatedUser) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.usersService.updateMyProfile(authenticatedUser.uid, dto);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadMyAvatar(
    @CurrentUser() authenticatedUser: AuthenticatedUser | undefined,
    @UploadedFile() file: any,
  ): Promise<User> {
    if (!authenticatedUser) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Avatar must be an image file');
    }

    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;

    return this.usersService.updateMyProfile(authenticatedUser.uid, { avatarUrl: dataUrl });
  }

  @Post('me/signature')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadMySignature(
    @CurrentUser() authenticatedUser: AuthenticatedUser | undefined,
    @UploadedFile() file: any,
  ): Promise<User> {
    if (!authenticatedUser) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    if (!file) {
      throw new BadRequestException('Signature file is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Signature must be an image file');
    }

    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;

    return this.usersService.updateMyProfile(authenticatedUser.uid, { signatureUrl: dataUrl });
  }
}
