"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const logger_1 = require("./common/logger");
const configure_app_1 = require("./common/configure-app");
function assertProductionEnvironment() {
    const required = [
        'DATABASE_URL',
        'JWT_SECRET',
        'BREVO_API_KEY',
        'OFFLINE_SOS_MASTER_KEY',
    ];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Eksik ortam degiskenleri: ${missing.join(', ')}`);
    }
    if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
        throw new Error('JWT_SECRET en az 32 karakter olmalidir.');
    }
    let offlineSosMasterKey = Buffer.alloc(0);
    try {
        offlineSosMasterKey = Buffer.from(process.env.OFFLINE_SOS_MASTER_KEY || '', 'base64url');
    }
    catch { }
    if (offlineSosMasterKey.length !== 32) {
        throw new Error('OFFLINE_SOS_MASTER_KEY 32 byte base64url olmalidir.');
    }
}
async function bootstrap() {
    assertProductionEnvironment();
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: new logger_1.AppLogger(),
    });
    const logger = new common_1.Logger('Bootstrap');
    (0, configure_app_1.configureApp)(app);
    const port = process.env.PORT ?? 3000;
    await app.listen(port, '0.0.0.0');
    logger.log(`Backend sunucusu baslatildi. Port: ${port}`);
}
bootstrap().catch((error) => {
    const msg = error instanceof Error ? error.stack : String(error);
    common_1.Logger.error('Backend baslatilamadi', msg);
    logger_1.errorLogger.error(`Backend baslatilamadi: ${msg}`);
    process.exit(1);
});
//# sourceMappingURL=main.js.map