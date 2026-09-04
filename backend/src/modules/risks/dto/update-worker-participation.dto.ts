import { PartialType } from '../../../common/partial-type';
import { CreateWorkerParticipationDto } from './create-worker-participation.dto';

export class UpdateWorkerParticipationDto extends PartialType(CreateWorkerParticipationDto) {}
