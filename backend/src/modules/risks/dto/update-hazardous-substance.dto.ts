import { PartialType } from '../../../common/partial-type';
import { CreateHazardousSubstanceDto } from './create-hazardous-substance.dto';

export class UpdateHazardousSubstanceDto extends PartialType(CreateHazardousSubstanceDto) {}
