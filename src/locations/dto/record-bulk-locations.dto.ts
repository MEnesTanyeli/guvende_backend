import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RecordLocationDto } from './record-location.dto';

export const MAX_BULK_LOCATION_POINTS = 250;

export class RecordBulkLocationsDto {
  @IsArray({ message: 'Konumlar bir liste (array) olmalıdır.' })
  @ArrayMaxSize(MAX_BULK_LOCATION_POINTS, {
    message: `Tek bir toplu konum isteği en fazla ${MAX_BULK_LOCATION_POINTS} nokta içerebilir.`,
  })
  @ValidateNested({ each: true })
  @Type(() => RecordLocationDto)
  locations!: RecordLocationDto[];
}
