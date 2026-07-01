# Güvende Backend — Canlıya Hazırlık Durumu

Bu dosyada:

- `+` işareti tamamlanan veya hazır olan işleri,
- `-` işareti eksik, riskli veya yapılması gereken işleri gösterir.

Eksileri yukarıdan aşağıya tek tek tamamlayacağız.

## + Hazır olanlar

+ Domain alındı: `guvende.app`
+ Backend adresi hazır: `https://api.guvende.app`
+ HTTPS aktif.
+ CGNAT sorunu Cloudflare Tunnel ile aşıldı.
+ Modemden port açmadan backend dışarı yayımlandı.
+ Cloudflare Tunnel kalıcı servis olarak çalışıyor.
+ Ubuntu 24.04 LTS sunucu çalışıyor.
+ Backend Docker container içinde çalışıyor.
+ PostgreSQL Docker container içinde çalışıyor.
+ PostgreSQL portu internete açık değil.
+ Backend yalnızca `127.0.0.1:3001` üzerinde dinliyor.
+ Docker container'larında otomatik yeniden başlatma var.
+ Prisma migration'ları veritabanıyla güncel.
+ Kullanıcı parolaları bcrypt ile hash'leniyor.
+ Kayıt e-posta doğrulama sistemi eklendi.
+ Şifre sıfırlama e-postası eklendi.
+ Kayıt ve şifre sıfırlama OTP'leri hash'leniyor.
+ OTP süre sınırı var.
+ OTP hatalı deneme sınırı var.
+ OTP gönderim sınırı var.
+ Brevo domain doğrulaması tamamlandı.
+ `mail.guvende.app` e-posta gönderimi için hazırlandı.
+ Güvensiz `purchase-mock` endpoint'i koddan kaldırıldı.
+ Konum test/simülasyon endpoint'leri koddan kaldırıldı.
+ HTTP ve WebSocket CORS whitelist hazırlandı.
+ HTTP güvenlik başlıkları hazırlandı.
+ Docker read-only ve capability güvenlik ayarları hazırlandı.
+ Docker RAM ve CPU sınırları hazırlandı.
+ Docker log rotation ayarları hazırlandı.
+ Backend health endpoint'i hazırlandı: `/health`
+ NPM güvenlik taraması temiz: `0 vulnerability`
+ Kod başarıyla derlendi.
+ Mevcut otomatik testler geçti.
+ Günlük PostgreSQL yedek script'i oluşturuldu.
+ İlk PostgreSQL yedeği alındı.
+ İlk yedeğin okunabilir olduğu doğrulandı.
+ Günlük backup timer aktif edildi.
+ Güvenlik değişiklikleri GitHub'a gönderildi.
+ Güvensiz e-posta değiştirme endpoint'leri geçici olarak kaldırıldı.
+ JWT secret yenilendi ve eski oturum token'ları geçersiz kılındı.
+ OneSignal REST API key yenilendi, eski key silindi.
+ Yeni OneSignal key ile gerçek push bildirimi test edildi.
+ Sertleştirilmiş Docker image production ortamına deploy edildi.
+ Backend ve PostgreSQL container'ları deploy sonrasında sağlıklı çalıştı.
+ Public `/health` kontrolü `200` döndü.
+ Login, CORS, WebSocket ve push smoke kontrolleri yapıldı.
+ Kritik akışlar için 27 otomatik test yazıldı ve tamamı geçti.
+ Son PostgreSQL yedeği geçici veritabanına başarıyla geri yüklendi.
+ UFW aktif edildi; varsayılan gelen bağlantı politikası engelleme olarak ayarlandı.
+ SSH yalnızca LAN (`192.168.1.0/24`) ve Tailscale (`100.64.0.0/10`) ağlarından erişime açıldı.
+ SSH parola ve klavye-etkileşimli girişi kapatıldı; yalnızca anahtar girişi açık.
+ SSH üzerinden doğrudan root girişi kapatıldı.
+ Ubuntu otomatik güvenlik güncellemeleri aktif ve sistem açılışında etkin.

## - Eksik olanlar

### 1. - Yedek aynı fiziksel diskte — canlı öncesine ertelendi

Durum: Geliştirme aşamasında yerel günlük yedek kullanılacak. Gerçek kullanıcı verisi toplamadan önce off-site yedek kurulacak.

Günlük yedek var fakat Ubuntu sunucusunun kendi diskinde.

Risk:

- Disk bozulursa veritabanı ve yedek birlikte kaybolabilir.
- Cihaz çalınır veya zarar görürse yedek de kaybolur.

Yapacağımız iş:

- Cloudflare R2 veya Backblaze B2 hesabı açmak.
- Yedekleri şifreli şekilde dış depoya göndermek.
- Otomatik silme/retention kuralı koymak.
- Gerçek geri yükleme testi yapmak.

### 2. - Uptime ve hata izleme sistemi yok — canlı öncesine ertelendi

Durum: Geliştirme aşamasında elle kontrol edilecek. Uygulama gerçek kullanıcılara açılmadan önce uptime ve hata izleme kurulacak.

Backend çökerse şu anda otomatik bildirim gelmiyor.

Yapacağımız iş:

- Uptime Kuma veya harici uptime servisi kurmak.
- `https://api.guvende.app/health` adresini izlemek.
- Sentry ile backend hatalarını toplamak.
- Disk doluluk alarmı eklemek.
- Backup başarısızlık alarmı eklemek.

### 3. - Gerçek ödeme doğrulaması yok

Test amaçlı premium endpoint'i kaldırıldı fakat gerçek ödeme sistemi henüz yok.

Yapacağımız iş:

- Google Play satın alma doğrulaması.
- App Store satın alma doğrulaması.
- Sunucu tarafında receipt/token kontrolü.
- İade ve abonelik iptali durumlarının yönetimi.

### 4. - Token/session sistemi geliştirilmeli

Durum: Backend kodu yerelde hazırlandı ve test edildi; henüz commit/deploy edilmedi. Frontend entegrasyonu tamamlandıktan sonra production'a alınacak.

Hazırlananlar:

- 15 dakikalık access token.
- 30 günlük ve her kullanımda değişen refresh token.
- Tek cihazdan ve tüm cihazlardan çıkış.
- Çalınan/eski refresh token tekrar kullanımında ilgili cihazın session ailesini iptal etme.
- Her cihaz için ayrı token ailesi ve cihaz bazlı iptal.
- Eşzamanlı yenilemeler için 3 saniyelik güvenli tolerans ve `409 REFRESH_ALREADY_ROTATED` sözleşmesi.
- HTTP ve WebSocket session doğrulaması.
- Şifre değişince tüm session'ları kapatma.
- Frontend ve Android Java token yenileme entegrasyonu.

Kalanlar:

- Production migration ve deploy.
- Admin hesapları için MFA (admin paneli canlıya açılmadan önce).

Frontend sözleşmesi: [FRONTEND_OTURUM_ENTEGRASYONU.md](./FRONTEND_OTURUM_ENTEGRASYONU.md)

### 5. - Ev sunucusunda tek nokta arızası var

Elektrik, internet, modem, disk veya bilgisayar arızalanırsa bütün sistem durur.

İleride değerlendirilecekler:

- UPS.
- İkinci disk veya ikinci cihaz.
- VPS failover.
- Yönetilen PostgreSQL.
- Düzenli felaket kurtarma testi.

## Yapacağımız sıra

1. Gerçek ödeme doğrulaması
2. Gelişmiş token/session sistemi

Canlı öncesine ertelenen zorunlu işler:

- Off-site yedek
- Uptime ve hata izleme

## Şu anki karar

Sıradaki kapatacağımız eksi:

```text
1. Gerçek ödeme doğrulaması
```

UFW/SSH güvenliği ve kritik otomatik testler tamamlandı; commit ve push işlemi diğer yerel değişikliklerle birlikte daha sonra toplu yapılacak.

Teknik ayrıntılar için:

[CANLIYA_HAZIRLIK_TEKNIK_REFERANS.md](./CANLIYA_HAZIRLIK_TEKNIK_REFERANS.md)
