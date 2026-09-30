import { Module } from '@nestjs/common';
import { OfflineSosService } from './offline-sos.service';

@Module({
  providers: [OfflineSosService],
  exports: [OfflineSosService],
})
export class OfflineSosModule {}
