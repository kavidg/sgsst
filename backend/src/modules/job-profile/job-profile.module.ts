import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Risk, RiskSchema } from '../risks/schemas/risk.schema';
import { RolesGuard } from '../questions/roles.guard';
import { JobProfileController } from './job-profile.controller';
import { JobProfileService } from './job-profile.service';
import { JobProfile, JobProfileSchema } from './schemas/job-profile.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Risk.name, schema: RiskSchema },
      { name: JobProfile.name, schema: JobProfileSchema },
    ]),
    UsersModule,
  ],
  controllers: [JobProfileController],
  providers: [JobProfileService, RolesGuard],
  exports: [JobProfileService],
})
export class JobProfileModule {}
