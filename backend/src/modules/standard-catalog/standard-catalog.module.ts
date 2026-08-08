import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { StandardCatalogController } from './standard-catalog.controller';
import { StandardCatalogService } from './standard-catalog.service';

/**
 * StandardCatalogModule — catálogo normativo de estándares SG-SST (SOLO LECTURA).
 *
 * Única fuente de verdad de los estándares mínimos aplicables según el nivel
 * de la empresa (7, 21 o 60 estándares, Resolución 0312 de 2019). Sin
 * forwardRef, sin dependencias circulares: consume solo catálogos estáticos
 * + AuthModule y el schema de User requerido por RolesGuard.
 */
@Module({
  imports: [
    AuthModule,
    // Schema de User requerido por RolesGuard para validar permisos.
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [StandardCatalogController],
  providers: [StandardCatalogService, RolesGuard],
  exports: [StandardCatalogService],
})
export class StandardCatalogModule {}
