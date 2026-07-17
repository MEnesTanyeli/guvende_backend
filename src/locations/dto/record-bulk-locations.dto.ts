import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RecordLocationDto } from './record-location.dto';

export class RecordBulkLocationsDto {
  @IsArray({ message: 'Konumlar bir liste (array) olmalıdır.' })
  @ValidateNested({ each: true })
  @Type(() => RecordLocationDto)
  locations!: RecordLocationDto[];
}
