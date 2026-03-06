import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { Incident, IncidentSchema } from './schemas/incident.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Incident.name, schema: IncidentSchema }]),
    UsersModule,
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule {}
