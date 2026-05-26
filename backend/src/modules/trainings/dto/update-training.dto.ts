import { PartialType } from '../../../common/partial-type';
import { CreateTrainingDto } from './create-training.dto';

export class UpdateTrainingDto extends PartialType(CreateTrainingDto) {}
