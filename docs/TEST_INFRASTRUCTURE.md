# Güvenli test altyapısı

Integration ve E2E testleri yalnız ayrı PostgreSQL test veritabanında çalışır. `npm run test:e2e`, bağlantı veya migration başlatmadan önce `NODE_ENV=test` ve `TEST_DATABASE_URL` değerlerini doğrular. Normal `DATABASE_URL` yedek değer olarak kullanılmaz.

Yerel PostgreSQL 16 test container'ı geçici dosya sistemi kullanır; `docker compose down` sonrasında test verileri kalmaz:

```powershell
npm run test:db:up
$env:NODE_ENV = 'test'
$env:TEST_DATABASE_URL = 'postgresql://guvende_test_user:local-test-only-password@127.0.0.1:5434/guvende_test?schema=public'
npm run test:e2e
npm run test:db:down
```

E2E komutu doğrulanmış URL'yi Prisma için `DATABASE_URL` olarak atar, migration zincirini `prisma migrate deploy` ile uygular ve Jest'i tek süreçte çalıştırır. URL PostgreSQL değilse, test işareti taşımıyorsa veya production/development hedefi olarak algılanırsa işlem bağlantı kurulmadan durur.

Bilinen özel production host/database adları CI secret'ı olarak `PRODUCTION_DATABASE_HOSTS` ve `PRODUCTION_DATABASE_NAMES` değişkenlerine virgülle ayrılmış biçimde eklenmelidir. Parolalar veya tam bağlantı URL'leri loglanmaz.

`NODE_ENV=test` iken `ScheduleModule` ve `CronModule` yüklenmez. E2E başlangıcı Brevo ve OneSignal anahtarlarını boşaltır; mevcut servisler bu durumda ağ çağrısından önce döner.
