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

### 3. - Otomatik test sayısı yetersiz

Mevcut testler yalnızca temel örnek seviyesinde.

Eklememiz gereken testler:

- Kayıt ve e-posta doğrulama
- Login
- Şifre sıfırlama
- OTP brute-force koruması
- Aile oluşturma ve aileye katılma
- Başka ailenin verisine erişememe
- Admin yetkilendirmesi
- Premium yetkilendirmesi
- Konum erişim yetkileri
- WebSocket aile odası yetkilendirmesi
- Brevo hata senaryosu
- Backup ve restore

### 4. - UFW ve SSH güvenlik kontrolü tamamlanmadı

Kontrol edilmesi gerekenler:

- UFW aktif mi?
- SSH yalnızca anahtarla mı çalışıyor?
- SSH parola girişi kapalı mı?
- Root ile SSH girişi kapalı mı?
- SSH yalnızca LAN/Tailscale üzerinden sınırlandırılabilir mi?
- Ubuntu otomatik güvenlik güncellemeleri açık mı?

### 5. - Gerçek ödeme doğrulaması yok

Test amaçlı premium endpoint'i kaldırıldı fakat gerçek ödeme sistemi henüz yok.

Yapacağımız iş:

- Google Play satın alma doğrulaması.
- App Store satın alma doğrulaması.
- Sunucu tarafında receipt/token kontrolü.
- İade ve abonelik iptali durumlarının yönetimi.

### 6. - Token/session sistemi geliştirilmeli

Şu anda JWT ile giriş çalışıyor fakat gelişmiş session yönetimi yok.

İleride yapılacaklar:

- Kısa ömürlü access token.
- Refresh token rotasyonu.
- Tüm cihazlardan çıkış.
- Çalınan token'ı iptal etme.
- Admin hesapları için ek güvenlik/MFA.

### 7. - Ev sunucusunda tek nokta arızası var

Elektrik, internet, modem, disk veya bilgisayar arızalanırsa bütün sistem durur.

İleride değerlendirilecekler:

- UPS.
- İkinci disk veya ikinci cihaz.
- VPS failover.
- Yönetilen PostgreSQL.
- Düzenli felaket kurtarma testi.

## Yapacağımız sıra

1. UFW ve SSH güvenliği
2. Kritik otomatik testler
3. Gerçek ödeme doğrulaması
4. Gelişmiş token/session sistemi

Canlı öncesine ertelenen zorunlu işler:

- Off-site yedek
- Uptime ve hata izleme

## Şu anki karar

İlk kapatacağımız eksi:

```text
1. UFW ve SSH güvenliği
```

Bu tamamlanınca satırı `-` listesinden çıkarıp `+ Hazır olanlar` listesine taşıyacağız.

Teknik ayrıntılar için:

[CANLIYA_HAZIRLIK_TEKNIK_REFERANS.md](./CANLIYA_HAZIRLIK_TEKNIK_REFERANS.md)
