# Güvende Backend — Canlıya Hazırlık ve Öğrenme Rehberi

Bu doküman, Güvende backend'ini gerçek kullanıcıların kullanacağı bir üretim ortamına hazırlarken tespit edilen sorunları, bu sorunların neden önemli olduğunu, uygulanan yöntemleri ve kalan işleri açıklar.

> Bu belge eğitim amaçlıdır. Komutlarda parola, API anahtarı, JWT secret veya başka gizli bilgi gösterilmez. Gizli değerleri ekran görüntüsünde, Git'te veya mesajlaşma uygulamalarında paylaşmayın.

## 1. Sistemin mevcut mimarisi

Uygulama şu parçalardan oluşuyor:

- Mobil uygulama ve ileride web sitesi
- `https://api.guvende.app` adresindeki NestJS backend
- Ubuntu 24.04 LTS üzerinde Docker
- PostgreSQL 16 veritabanı
- Cloudflare Tunnel
- Brevo transactional e-posta servisi
- OneSignal push bildirim servisi
- GitHub kaynak kodu repository'si

İstek akışı kabaca şöyledir:

```text
Mobil uygulama
      |
      | HTTPS / WebSocket
      v
api.guvende.app
      |
      v
Cloudflare Tunnel
      |
      v
127.0.0.1:3001 (Docker içindeki NestJS backend)
      |
      v
Docker ağı içindeki PostgreSQL
```

Cloudflare Tunnel bağlantıyı Ubuntu'dan dışarı doğru başlatır. Bu nedenle CGNAT altında public IPv4, statik IP veya modem port yönlendirmesi gerekmez.

## 2. Denetimde iyi durumda bulunan noktalar

- Ubuntu LTS sürümü kullanılıyor.
- Backend ve PostgreSQL container'ları sağlıklı çalışıyor.
- PostgreSQL internete port açmıyor.
- Backend yalnızca `127.0.0.1:3001` üzerinde dinliyor.
- Dış erişim Cloudflare Tunnel üzerinden HTTPS ile sağlanıyor.
- Docker container'ları otomatik yeniden başlama politikasına sahip.
- Prisma migration'ları veritabanıyla güncel.
- Parolalar bcrypt ile hash'leniyor.
- Kayıt ve şifre sıfırlama OTP'leri bcrypt ile hash'leniyor.
- OTP süre, deneme ve gönderim limitleri bulunuyor.
- Auth ve hassas uygulama endpoint'lerinin çoğunda JWT ve üyelik kontrolleri var.
- Brevo ile domain doğrulaması yapıldı.
- Sunucunun disk, RAM ve swap kapasitesi başlangıç trafiği için yeterli.

## 3. Cloudflare Tunnel neden kullanılıyor?

### Sorun

Ev interneti CGNAT arkasında. CGNAT, internet sağlayıcının tek public IP'yi birden fazla müşteriyle paylaşmasıdır. Modemden port açmak CGNAT'ı aşmaz.

### Uygulanan yöntem

Ubuntu'daki `cloudflared`, Cloudflare'a outbound bağlantı kuruyor. `api.guvende.app` DNS kaydı kalıcı named tunnel'a bağlı.

### Kazanımlar

- CGNAT altında çalışır.
- IP değişikliklerinden etkilenmez.
- Modem portu açılmaz.
- TLS sertifikası Cloudflare tarafından yönetilir.
- Backend'in gerçek ev IP'si doğrudan yayınlanmaz.

### Sınırlar

- Ev elektriği veya interneti kesilirse uygulama kapanır.
- Tek fiziksel makine arızası bütün servisi durdurur.
- Cloudflare hesabının güvenliği kritik hale gelir.
- Tunnel çalışsa bile backend veya veritabanı durmuşsa API çalışmaz.

### Doğrulama

```bash
systemctl --user status cloudflared-guvende.service
curl -i https://api.guvende.app/health
```

## 4. Git'te gizli bilgi bulunması

### Tespit edilen sorun

Repository'de `.env` dosyası geçmişte commit edilmişti. Bu dosyada database URL, JWT secret ve OneSignal bilgileri gibi değerler bulunabiliyor. Ayrıca `database_info.md` içinde örnek de olsa açık veritabanı parolası vardı.

`.gitignore` içine `.env` yazmak, daha önce commit edilmiş dosyayı Git geçmişinden otomatik silmez.

### Risk

Repository private olsa bile:

- Hesabı ele geçirilen biri eski commit'lerden anahtarları okuyabilir.
- Repository yanlışlıkla public yapılabilir.
- Bir ekip üyesinin bilgisayarındaki clone sızabilir.
- Silinen dosya eski commit'lerde kalmaya devam eder.

### Uygulanan yöntem

- `.env`, güncel Git ağacından çıkarıldı.
- `database_info.md` kaldırıldı.
- `.env.production.example` yalnızca anahtar adlarını ve güvenli placeholder değerlerini içeriyor.

### Kalan kritik iş

Güncel Git ağacından silmek geçmişi temizlemez. Bu nedenle geçmişte bulunan gerçek anahtarlar döndürülmelidir:

1. JWT secret yenilenmeli.
2. OneSignal REST API key yenilenmeli.
3. Eğer eski `.env` içindeki başka servis anahtarları aktifse onlar da yenilenmeli.
4. Gerekirse Git geçmişi ayrıca temizlenmeli. Bu işlem commit hash'lerini değiştirir ve ekip koordinasyonu gerektirir.

JWT secret değiştiğinde mevcut kullanıcı token'ları geçersiz olur ve kullanıcılar yeniden giriş yapar. Bu beklenen bir sonuçtur.

## 5. CORS neden tüm dünyaya açık bırakılmamalı?

### Tespit edilen sorun

HTTP API'de `app.enableCors()` ve WebSocket gateway'de `origin: '*'` kullanılıyordu.

### CORS nedir?

CORS, bir web sayfasının başka bir origin'deki API'ye tarayıcı üzerinden istek gönderip gönderemeyeceğini belirler. CORS tek başına kimlik doğrulama değildir; yine de gereksiz origin'lere izin vermek saldırı yüzeyini büyütür.

### Uygulanan yöntem

İzin verilen origin'ler whitelist haline getirildi:

```text
https://guvende.app
https://www.guvende.app
capacitor://localhost
http://localhost
```

Liste `CORS_ORIGINS` ortam değişkeniyle değiştirilebilir. Hem HTTP hem WebSocket aynı mantıkla sınırlandırıldı.

### Dikkat

Mobil uygulamanın kullandığı gerçek Capacitor/Ionic origin'i test edilmelidir. Yanlış whitelist giriş bağlantısını engelleyebilir. Native HTTP istemcilerinde `Origin` başlığı bulunmayabilir; backend bu tür istekleri kabul edecek şekilde ayarlandı.

## 6. Açık test ve mock endpoint'leri

### Tespit edilen sorunlar

- `POST /users/purchase-mock`
- Konum için `test-drift` endpoint'i
- Konum için `test-walk` endpoint'i

### Risk

`purchase-mock`, oturum açmış herhangi bir kullanıcının ödeme yapmadan premium olmasını sağlıyordu. Konum test endpoint'leri ise üretim verisini veya gerçek zamanlı olayları yapay şekilde tetikleyebilirdi.

### Uygulanan yöntem

Bu endpoint'ler production kodundan kaldırıldı.

### Doğru yaklaşım

Test araçları gerekiyorsa:

- Yalnızca development build'inde açılmalı.
- Admin guard arkasında olmalı.
- Production ortamında route hiç oluşturulmamalı.
- Gerçek ödeme, App Store / Google Play imzalı satın alma doğrulamasıyla yapılmalı.

## 7. DTO doğrulaması

### Tespit edilen sorun

NestJS `ValidationPipe` kullanıyordu fakat beklenmeyen alanları sadece siliyordu. Bazı endpoint'lerde `any` veya inline body tipleri vardı.

### Uygulanan yöntem

- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`
- `stopAtFirstError: true`

Bu sayede DTO'da tanımlı olmayan alanlar artık sessizce kabul edilmez; istek `400 Bad Request` alır.

### Kalan iş

Şu alanlar için ayrı DTO sınıfları oluşturulmalı:

- Proxy e-posta isteği
- Aile üye rolü değişimi
- Bildirim sessize alma
- Cihaz izinleri
- E-posta değişikliği

`any` kullanmak, TypeScript'in sağladığı güvenliği devre dışı bırakır.

## 8. HTTP güvenlik başlıkları

### Uygulanan yöntem

Backend şu başlıkları ekleyecek şekilde hazırlandı:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy`
- `Strict-Transport-Security`
- `Cache-Control: no-store`

Ayrıca Express'in `X-Powered-By` başlığı kapatıldı.

### Neden?

Bu başlıklar tarayıcı tabanlı saldırıların bir bölümünü zorlaştırır ve hassas API yanıtlarının cache'e yazılmasını engeller. Bunlar auth veya input validation'ın yerine geçmez; savunmanın ek katmanıdır.

## 9. JWT güvenliği

### Mevcut yöntem

Kullanıcı giriş yaptıktan sonra imzalı JWT alır. Korunan endpoint'ler bearer token bekler.

### Uygulanan sertleştirme

- Backend artık `JWT_SECRET` yoksa başlamaz.
- Secret en az 32 karakter değilse başlamaz.
- Kod içindeki güvensiz fallback'in kullanılmaması hedeflenir.

### Kalan geliştirmeler

- Access token ömrü kısaltılabilir.
- Refresh token rotasyonu eklenebilir.
- Kullanıcı tüm cihazlardan çıkış yapabilmelidir.
- Token sürümü veya session tablosu ile token iptali yapılabilir.
- Admin hesaplarında MFA düşünülmelidir.

## 10. E-posta ve OTP akışları

### Kullanılan yöntem

Brevo transactional e-posta servisi kullanılıyor. Bu, ev sunucusunda SMTP işletmekten daha güvenilirdir.

Gönderici:

```text
Güvende <noreply@mail.guvende.app>
```

### Güvenli noktalar

- Kayıt OTP'si hash'lenerek saklanıyor.
- Şifre sıfırlama OTP'si hash'lenerek saklanıyor.
- OTP'lerin süresi var.
- Hatalı deneme ve gönderim limitleri var.
- Kayıtlı olmayan e-posta için şifre sıfırlama yanıtı hesap varlığını açık etmiyor.

### Uygulanan ek önlem

Brevo HTTP isteklerine 10 saniye timeout eklendi. Harici servis cevap vermezse backend isteği sonsuza kadar beklemez.

### Kalan sorun

E-posta değiştirme OTP'si hâlâ plaintext tutuluyor ve uygulama log'una yazılıyor. Canlıya çıkmadan önce:

- Kod hash'lenmeli.
- Log'a yazılmamalı.
- Gerçek e-posta üzerinden gönderilmeli.
- Süre ve deneme limitleri eklenmeli.

## 11. Bağımlılık güvenliği

### Tespit

İlk `npm audit` taramasında `ws` ve `multer` üzerinden yüksek önem seviyeli DoS bildirimleri vardı.

### Uygulanan yöntem

- Uyumlu otomatik yamalar uygulandı.
- `multer` için güvenli `2.2.0` sürümü override ile sabitlendi.
- Yeniden `npm audit` çalıştırıldı.

Sonuç:

```text
found 0 vulnerabilities
```

### Neden `npm audit fix --force` kullanılmadı?

Force seçeneği NestJS'i eski ve kırıcı bir major sürüme düşürmeyi öneriyordu. Güvenlik komutları körlemesine uygulanmamalıdır; önerilen sürüm değişiminin uygulamayı bozup bozmayacağı kontrol edilmelidir.

## 12. Docker sertleştirmesi

Backend container'ı için hazırlanan ayarlar:

- Root olmayan `nestjs` kullanıcısı
- `read_only: true`
- Yazılabilir geçici alan olarak sınırlı `/tmp`
- `no-new-privileges:true`
- Tüm Linux capability'lerini düşürme
- 768 MB RAM sınırı
- 1.5 CPU sınırı
- Tini tabanlı init süreci
- JSON log rotation: 10 MB x 5 dosya

### Neden?

Uygulama ele geçirilirse saldırganın container içinde yapabileceklerini azaltır. Kaynak limitleri bir runaway process'in bütün sunucuyu tüketmesini zorlaştırır. Log rotation diskin loglarla dolmasını önler.

### Risk

Read-only root filesystem bazı kütüphanelerin dosya yazma beklentisini bozabilir. Bu nedenle deploy sonrası health check, kayıt, login, e-posta ve WebSocket testleri yapılmalıdır.

## 13. Veritabanı yedeği

### Tespit edilen sorun

Denetim sırasında otomatik PostgreSQL yedeği bulunmadı. Veritabanı yalnızca Docker volume içindeydi.

Docker volume yedek değildir. Disk bozulursa volume da kaybolur.

### Uygulanan yöntem

`pg_dump --format=custom` kullanan bir script eklendi:

```text
scripts/backup-production-db.sh
```

Yedek oluşturulduktan sonra `pg_restore --list` ile okunabilirliği doğrulanıyor. Başarısız veya yarım yedek final dosya adıyla bırakılmıyor. Yerel yedekler 14 gün tutuluyor.

Systemd user timer her gün yaklaşık 03:15 UTC'de çalışıyor:

```bash
systemctl --user status guvende-db-backup.timer
systemctl --user list-timers guvende-db-backup.timer
```

İlk doğrulanmış yedek başarıyla oluşturuldu.

### Çok önemli sınır

Yedek şu anda aynı fiziksel diskte. Bu yalnızca yanlış migration, yanlış silme veya bozuk volume gibi bazı olaylara karşı koruma sağlar. Disk, ev, cihaz veya fidye yazılımı kaybına karşı korumaz.

Canlı için en az bir off-site hedef gerekir:

- Cloudflare R2
- Backblaze B2
- S3 uyumlu object storage
- Şifrelenmiş başka fiziksel cihaz

İdeal kural **3-2-1**'dir: üç kopya, iki farklı ortam, bir off-site kopya.

## 14. Health check ve gözlemleme

### Uygulanan yöntem

Yeni endpoint:

```text
GET /health
```

Docker health check bu endpoint'i kullanacak.

### Eksikler

Health endpoint yalnızca Node sürecinin yanıt verdiğini gösteriyor. İleride şu kontroller ayrılmalı:

- Liveness: süreç yaşıyor mu?
- Readiness: PostgreSQL'e bağlanabiliyor mu?
- Brevo/OneSignal için ölçüm ve hata oranı
- Cloudflare Tunnel erişilebilirliği

Üretim izleme için öneriler:

- Uptime Kuma veya harici uptime servisi
- Sentry ile backend exception takibi
- Yapılandırılmış JSON log
- Disk doluluk alarmı
- Backup başarısızlık alarmı
- Container restart alarmı

## 15. Sunucu ve ağ güvenliği

### Mevcut durum

- Backend yalnızca loopback'te.
- PostgreSQL dışa açık değil.
- SSH `0.0.0.0:22` üzerinde dinliyor; CGNAT nedeniyle internetten doğrudan erişim olmayabilir.
- Tailscale kurulu.

### Kontrol edilemeyen nokta

UFW durumu sudo parolası olmadan okunamadı.

### Canlı öncesi yapılacaklar

- UFW etkinliği kontrol edilmeli.
- Mümkünse SSH yalnızca LAN/Tailscale üzerinden erişilebilir olmalı.
- SSH parola girişi kapatılıp yalnızca anahtar kullanılmalı.
- Root SSH login kapalı olmalı.
- Ubuntu unattended security updates kontrol edilmeli.
- Cloudflare ve GitHub hesaplarında MFA açılmalı.
- Kurtarma kodları güvenli yerde saklanmalı.

## 16. Ev sunucusunun üretim riski

Ev sunucusu maliyeti düşürür fakat şu riskleri getirir:

- Elektrik kesintisi
- Modem/internet kesintisi
- Tek disk arızası
- Donanım arızası
- Ev ağı güvenliği
- Operatör bakım kesintileri
- Upload kapasitesi ve gecikme
- Fiziksel erişim riski

Başlangıç aşamasında kabul edilebilir olabilir. Gerçek kullanıcı sayısı ve kritik kullanım arttığında VPS, yönetilen PostgreSQL veya ikinci bir failover makinesi değerlendirilmelidir.

## 17. Test durumunun gerçekçi değerlendirmesi

Derleme ve mevcut testler geçti. Ancak repository'de yalnızca temel örnek testler var. “Test geçti” demek şu anda bütün iş mantığının doğrulandığı anlamına gelmez.

Canlı öncesi eklenmesi gereken testler:

- Kayıt OTP akışı
- OTP brute-force ve rate-limit
- Login
- Şifre sıfırlama
- Aile üyeliği yetkilendirmesi
- Başka ailenin konumuna erişememe
- Admin guard
- Premium guard
- WebSocket aile odası yetkilendirmesi
- Brevo hata senaryosu
- PostgreSQL migration testi
- Backup restore testi

## 18. Şu anda tamamlananlar ve henüz deploy edilmeyenler

### Tamamlanan

- Mimari ve güvenlik denetimi
- İlk doğrulanmış PostgreSQL yedeği
- Günlük backup timer kurulumu
- Dependency audit: 0 bilinen açık
- Sertleştirme kodunun derlenmesi
- Mevcut testlerin geçmesi
- Güvenlik değişikliklerinin sunucu Git çalışma ağacına commit olarak aktarılması

### Bu doküman yazıldığı anda henüz tamamlanmayan

- Yeni Docker image'ın production'da yeniden build edilmesi
- Sertleştirilmiş container'ın canlıya alınması
- Deploy sonrası smoke test
- JWT secret rotasyonu
- OneSignal REST API key rotasyonu
- Off-site backup
- UFW/SSH hardening doğrulaması
- Yeni commit'lerin GitHub'a push edilmesi
- E-posta değiştirme OTP akışının güvenli hale getirilmesi
- Yeterli otomatik test kapsamı

Bu ayrım önemlidir: Kodun hazırlanması ile canlı container'ın o kodu çalıştırması aynı şey değildir.

## 19. Güvenli deploy sırası

Önerilen sıra:

1. Güncel ve doğrulanmış DB yedeği al.
2. Git çalışma ağacının temiz olduğunu kontrol et.
3. Environment değişkenlerini kontrol et; değerleri ekrana basma.
4. Docker image'ını build et.
5. Migration'ları uygula.
6. Backend container'ını yeniden oluştur.
7. Docker health check'i bekle.
8. `/health` endpoint'ini dışarıdan test et.
9. Login, kayıt, OTP ve WebSocket smoke testleri yap.
10. Loglarda secret/OTP bulunmadığını kontrol et.
11. Başarısızsa önceki Git commit/image'a rollback yap.

## 20. Canlıya çıkış kontrol listesi

### Kimlik ve güvenlik

- [ ] JWT secret döndürüldü
- [ ] OneSignal key döndürüldü
- [ ] Git'te aktif secret kalmadı
- [ ] Cloudflare MFA açık
- [ ] GitHub MFA açık
- [ ] Admin hesap güvenliği kontrol edildi

### Veri

- [x] Yerel otomatik DB backup
- [x] Backup dosyası okunabilirlik doğrulaması
- [ ] Gerçek restore tatbikatı
- [ ] Off-site şifreli backup
- [ ] Backup hata alarmı

### Uygulama

- [x] Build başarılı
- [x] Mevcut testler başarılı
- [x] Dependency audit temiz
- [ ] Kritik auth/authorization testleri
- [ ] E-posta değişikliği OTP düzeltmesi
- [ ] Gerçek ödeme doğrulaması
- [ ] Production smoke test

### Operasyon

- [ ] Uptime monitoring
- [ ] Error tracking
- [ ] Disk ve container alarmları
- [ ] Rollback prosedürü test edildi
- [ ] UFW ve SSH hardening tamamlandı
- [ ] Elektrik/internet kesintisi planı hazır

## 21. Temel komutlar

Secret değerlerini ekrana basmadan sistem kontrolü:

```bash
cd ~/apps/guvende_backend

git status
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 backend
curl -i http://127.0.0.1:3001/health
curl -i https://api.guvende.app/health
systemctl --user status cloudflared-guvende.service
systemctl --user status guvende-db-backup.timer
```

Elle backup:

```bash
cd ~/apps/guvende_backend
bash scripts/backup-production-db.sh
```

Migration durumu:

```bash
docker exec guvende_backend-backend-1 npx prisma migrate status
```

## 22. Sonuç

Sistem prototip seviyesinden üretim hazırlığı seviyesine doğru ilerliyor. Cloudflare Tunnel, Docker izolasyonu, hashed OTP, migration ve transactional e-posta iyi bir temel oluşturuyor. Buna karşın gerçek canlı kullanım için en önemli kalan maddeler secret rotasyonu, off-site backup, e-posta değişikliği OTP güvenliği, izleme/alarmlar ve yeterli otomatik test kapsamıdır.

En önemli ders şudur: **Canlıya hazır olmak yalnızca uygulamanın çalışması değildir.** Veri kaybında geri dönebilmek, secret sızıntısında anahtar çevirebilmek, hatayı fark edebilmek, güvenli deploy/rollback yapabilmek ve yetkisiz erişimi test etmek de ürünün parçasıdır.
