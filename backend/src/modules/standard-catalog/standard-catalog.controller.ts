import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { StandardCatalogDto } from './dto/standard-catalog.dto';
import { StandardCatalogService } from './standard-catalog.service';

@Controller('standard-catalog')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class StandardCatalogController {
  constructor(private readonly catalogService: StandardCatalogService) {}

  /**
   * Devuelve el catálogo de estándares aplicables a un nivel de empresa.
   *
   * GET /standard-catalog/7 | /21 | /60
   *
   * Lectura normativa pura: cualquier rol autenticado puede consultarlo
   * (el catálogo no contiene datos de la empresa).
   */
  @Get(':level')
  @Roles('owner', 'admin', 'manager', 'member')
  getCatalog(@Param('level') level: string): StandardCatalogDto {
    if (!this.catalogService.isValidLevel(level)) {
      throw new BadRequestException(
        `Invalid standard level: ${level}. Expected one of: ${this.catalogService.levels.join(', ')}.`,
      );
    }

    // Tras el type guard isValidLevel, `level` ya está acotado a StandardLevel.
    return this.catalogService.getCatalog(level);
  }
}
