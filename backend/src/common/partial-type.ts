import { IsOptional, getMetadataStorage } from 'class-validator';

type Constructor<T = object> = new (...args: any[]) => T;

export function PartialType<TBase extends Constructor>(BaseClass: TBase) {
  abstract class PartialClass extends BaseClass {}

  const metadataStorage = getMetadataStorage();
  const validationMetadata = metadataStorage.getTargetValidationMetadatas(BaseClass, '', false, false);
  const properties = new Set(validationMetadata.map((item) => item.propertyName));

  properties.forEach((propertyKey) => {
    IsOptional()(PartialClass.prototype, propertyKey);
  });

  return PartialClass as Constructor<Partial<InstanceType<TBase>>>;
}
