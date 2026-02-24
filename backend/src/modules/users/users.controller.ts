import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('by-firebase/:uid')
  async findByFirebaseUid(@Param('uid') uid: string): Promise<User> {
    const user = await this.usersService.findByFirebaseUid(uid);

    if (!user) {
      throw new NotFoundException(`User with firebase uid ${uid} not found`);
    }

    return user;
  }
}
