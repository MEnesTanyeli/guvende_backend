import { forwardRef, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { LocationsModule } from '../locations/locations.module';
import { OfflineSosModule } from '../offline-sos/offline-sos.module';

@Module({
  imports: [forwardRef(() => LocationsModule), OfflineSosModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
