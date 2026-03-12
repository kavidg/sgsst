import { PartialType } from '../../../common/partial-type';
import { CreateEvaluationAnswerDto } from './create-evaluation-answer.dto';

export class UpdateEvaluationAnswerDto extends PartialType(CreateEvaluationAnswerDto) {}
