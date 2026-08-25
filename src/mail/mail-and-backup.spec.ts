import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MailService } from './mail.service';

describe('External service failure handling', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not call Brevo when the API key is missing', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = new MailService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);
    await service.sendVerificationCodeEmail('user@example.com', '123456');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when Brevo returns an error response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    } as Response);
    const service = new MailService({
      get: jest.fn().mockReturnValue('secret'),
    } as unknown as ConfigService);
    await expect(
      service.sendResetPasswordEmail('user@example.com', '123456'),
    ).rejects.toThrow('Brevo e-posta gonderimi basarisiz (401)');
  });

  it('backup script creates, verifies and retains safe dump files', () => {
    const script = readFileSync(
      resolve(__dirname, '../../scripts/backup-production-db.sh'),
      'utf8',
    );
    expect(script).toContain('pg_dump --format=custom');
    expect(script).toContain('pg_restore --list');
    expect(script).toContain('.partial');
    expect(script).toContain('RETENTION_DAYS');
    expect(script).toContain("-name 'guvende-*.dump'");
  });
});
