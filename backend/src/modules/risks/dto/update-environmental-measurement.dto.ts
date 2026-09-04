import { PartialType } from '../../../common/partial-type';
import { CreateEnvironmentalMeasurementDto } from './create-environmental-measurement.dto';

export class UpdateEnvironmentalMeasurementDto extends PartialType(CreateEnvironmentalMeasurementDto) {}
