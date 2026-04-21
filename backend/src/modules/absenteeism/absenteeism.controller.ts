import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CreateAbsenteeismDto } from './dto/create-absenteeism.dto';
import { UpdateAbsenteeismDto } from './dto/update-absenteeism.dto';
import { AbsenteeismService } from './absenteeism.service';

@Controller('absenteeism')
@UseGuards(FirebaseAuthGuard)
export class AbsenteeismController {
  constructor(private readonly absenteeismService: AbsenteeismService) {}

  @Post()
  create(@Body() createAbsenteeismDto: CreateAbsenteeismDto) {
    return this.absenteeismService.create(createAbsenteeismDto);
  }

  @Get('company/:companyId')
  findAllByCompany(@Param('companyId') companyId: string) {
    return this.absenteeismService.findAllByCompany(companyId);
  }

  @Get('user/:userId')
  findAllByUser(@Param('userId') userId: string) {
    return this.absenteeismService.findAllByUser(userId);
  }

  @Get('stats/company/:companyId')
  getCompanyStats(@Param('companyId') companyId: string) {
    return this.absenteeismService.getCompanyStats(companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAbsenteeismDto: UpdateAbsenteeismDto) {
    return this.absenteeismService.update(id, updateAbsenteeismDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.absenteeismService.remove(id);
  }
}
