import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { RolesGuard } from '../questions/roles.guard';
// FASE 1 — consolidación del upload: StorageService vive en el Document
// Generation Module (forwardRef ante ciclos, convención del repo).
import { DocumentGenerationModule } from '../document-generation/document-generation.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { Document, DocumentSchema } from './schemas/document.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => DocumentGenerationModule),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: Document.name, schema: DocumentSchema }]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, RolesGuard],
})
export class DocumentsModule {}
