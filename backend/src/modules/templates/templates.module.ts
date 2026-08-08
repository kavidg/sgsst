import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { DocumentGenerationModule } from '../document-generation/document-generation.module';
import { RolesGuard } from '../questions/roles.guard';
import { UsersModule } from '../users/users.module';
import { Template, TemplateSchema } from './schemas/template.schema';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([{ name: Template.name, schema: TemplateSchema }]),
    // El controller genera DOCX delegando en el Document Generation Engine.
    forwardRef(() => DocumentGenerationModule),
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService, RolesGuard],
  exports: [TemplatesService],
})
export class TemplatesModule {}
