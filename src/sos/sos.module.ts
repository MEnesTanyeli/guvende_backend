import { Module } from '@nestjs/common';
import { SosService } from './sos.service';
import { SosController } from './sos.controller';
import { LocationsModule } from '../locations/locations.module';

@Module({
  imports: [LocationsModule],
  providers: [SosService],
  controllers: [SosController],
  exports: [SosService],
})
export class SosModule {}
