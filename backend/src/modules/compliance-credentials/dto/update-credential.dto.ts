import { PartialType } from '../../../common/partial-type';
import { CreateCredentialDto } from './create-credential.dto';

export class UpdateCredentialDto extends PartialType(CreateCredentialDto) {}
