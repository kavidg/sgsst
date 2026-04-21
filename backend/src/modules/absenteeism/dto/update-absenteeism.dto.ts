import { PartialType } from '../../../common/partial-type';
import { CreateAbsenteeismDto } from './create-absenteeism.dto';

export class UpdateAbsenteeismDto extends PartialType(CreateAbsenteeismDto) {}
