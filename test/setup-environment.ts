import { activateTestDatabase } from '../src/testing/test-database-safety';

activateTestDatabase();

// ConfigModule will not replace already defined values. Empty credentials make
// every current Brevo/OneSignal implementation return before network access.
process.env.BREVO_API_KEY = '';
process.env.ONESIGNAL_APP_ID = '';
process.env.ONESIGNAL_REST_API_KEY = '';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-only-jwt-secret-at-least-32-characters';
process.env.OFFLINE_SOS_MASTER_KEY =
  process.env.OFFLINE_SOS_MASTER_KEY ||
  Buffer.alloc(32, 7).toString('base64url');
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost';
