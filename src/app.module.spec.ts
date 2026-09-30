import { MODULE_METADATA } from '@nestjs/common/constants';
import { ScheduleModule } from '@nestjs/schedule';
import { AppModule } from './app.module';
import { CronModule } from './cron/cron.module';

describe('AppModule test isolation', () => {
  it('does not register scheduled jobs while Jest runs in the test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
    const imports: Array<unknown> =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];

    expect(imports).not.toContain(CronModule);
    expect(
      imports.some(
        (item: any) => item === ScheduleModule || item?.module === ScheduleModule,
      ),
    ).toBe(false);
  });
});
