import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompaniesService, MyCompanyResponse } from './companies.service';

@Controller('companies')
@UseGuards(FirebaseAuthGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() createCompanyDto: CreateCompanyDto,
  ) {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.companiesService.create(user.uid, createCompanyDto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.companiesService.findAllByOwner(user.uid);
  }

  @Get('my-companies')
  findMyCompanies(@CurrentUser() user: AuthenticatedUser | undefined): Promise<MyCompanyResponse[]> {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.companiesService.findMyCompanies(user.uid);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser | undefined, @Param('id') id: string) {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.companiesService.findOneByOwner(user.uid, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ) {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.companiesService.updateByOwner(user.uid, id, updateCompanyDto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser | undefined, @Param('id') id: string) {
    if (!user) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    return this.companiesService.removeByOwner(user.uid, id);
  }
}
