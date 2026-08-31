# Güvende Backend — Canlıya Hazırlık Durumu

Bu dosyada:

- `+` işareti tamamlanan veya hazır olan işleri,
- `-` işareti eksik, riskli veya yapılması gereken işleri gösterir.

Eksileri yukarıdan aşağıya tek tek tamamlayacağız.

## Şu anki genel durum

Backend production ortamında çalışıyor ve `https://api.guvende.app/health` adresi `200` dönüyor. Domain, HTTPS, Cloudflare Tunnel, Docker, PostgreSQL, e-posta, push bildirim, güvenli session sistemi, sunucu güvenlik duvarı ve yerel günlük yedek hazır.

Uygulama teknik olarak kullanılabilir durumda. Gerçek kullanıcılara açılmadan önce en önemli kalan işler off-site yedek ile uptime/hata izleme; ücretli özellik açılmadan önce ödeme doğrulaması; admin paneli açılmadan önce admin MFA'dır.

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
+ Kritik akışlar için 37 otomatik test yazıldı ve tamamı geçti.
+ Son PostgreSQL yedeği geçici veritabanına başarıyla geri yüklendi.
+ UFW aktif edildi; varsayılan gelen bağlantı politikası engelleme olarak ayarlandı.
+ SSH yalnızca LAN (`192.168.1.0/24`) ve Tailscale (`100.64.0.0/10`) ağlarından erişime açıldı.
+ SSH parola ve klavye-etkileşimli girişi kapatıldı; yalnızca anahtar girişi açık.
+ SSH üzerinden doğrudan root girişi kapatıldı.
+ Ubuntu otomatik güvenlik güncellemeleri aktif ve sistem açılışında etkin.
+ Cihaz bazlı access/refresh token session sistemi production ortamına alındı.
+ Refresh token rotasyonu, 3 saniyelik yarış toleransı ve cihaz bazlı iptal aktif.
+ Tek cihazdan/tüm cihazlardan çıkış ile HTTP/WebSocket session doğrulaması aktif.
+ Session migration'ı production veritabanına başarıyla uygulandı.
+ Session deploy'undan hemen önce doğrulanmış PostgreSQL yedeği alındı: `guvende-20260702T051058Z.dump`.
+ Session sistemi GitHub `main` dalına gönderildi.
+ Tailscale üzerinden ev dışından SSH bağlantısı işyeri bilgisayarından başarıyla doğrulandı.

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
- Off-site kopyadan gerçek geri yükleme testi yapmak.

### 2. - Uptime ve hata izleme sistemi yok — canlı öncesine ertelendi

Durum: Geliştirme aşamasında elle kontrol edilecek. Uygulama gerçek kullanıcılara açılmadan önce uptime ve hata izleme kurulacak.

Backend çökerse şu anda otomatik bildirim gelmiyor.

Yapacağımız iş:

- Uptime Kuma veya harici uptime servisi kurmak.
- `https://api.guvende.app/health` adresini izlemek.
- Sentry ile backend hatalarını toplamak.
- Disk doluluk alarmı eklemek.
- Backup başarısızlık alarmı eklemek.

### 3. - Production logları fazla detaylı

Durum: Dev ortamında WebSocket oda id'leri, socket id'leri, user id'leri ve OneSignal response gövdeleri debug için loglanıyor. Production ortamında bu detay seviyesi gereksiz bilgi açığa çıkarabilir.

Yapacağımız iş:

- Log seviyesini environment'a göre ayırmak.
- Dev ortamında detaylı logları açık bırakmak.
- Production ortamında user id, room id, socket id ve provider response gövdelerini maskelemek veya kaldırmak.
- OneSignal hatalarını production'da kısa, takip edilebilir ve hassas veri içermeyen formatta loglamak.

### 4. - Gerçek ödeme doğrulaması yok

Test amaçlı premium endpoint'i kaldırıldı fakat gerçek ödeme sistemi henüz yok.

Yapacağımız iş:

- Google Play satın alma doğrulaması.
- App Store satın alma doğrulaması.
- Sunucu tarafında receipt/token kontrolü.
- İade ve abonelik iptali durumlarının yönetimi.

### 5. - Admin hesapları için MFA eksik

Token/session sistemi migration ile production ortamına alındı. Kalan iş, admin paneli gerçek kullanıma açılmadan önce yönetici hesaplarına MFA eklemek.

Frontend sözleşmesi: [FRONTEND_OTURUM_ENTEGRASYONU.md](./FRONTEND_OTURUM_ENTEGRASYONU.md)

### 6. - Ev sunucusunda tek nokta arızası var

Elektrik, internet, modem, disk veya bilgisayar arızalanırsa bütün sistem durur.

İleride değerlendirilecekler:

- UPS.
- İkinci disk veya ikinci cihaz.
- VPS failover.
- Yönetilen PostgreSQL.
- Düzenli felaket kurtarma testi.

## Yapacağımız sıra

1. Gerçek kullanıcı öncesi off-site yedek
2. Uptime ve hata izleme
3. Production loglarını sadeleştirme
4. Gerçek ödeme doğrulaması
5. Admin hesapları için MFA

Canlı öncesine ertelenen zorunlu işler:

- Off-site yedek
- Uptime ve hata izleme

## Şu anki karar

Sıradaki kapatacağımız eksi:

```text
1. Off-site PostgreSQL yedeği
```

UFW/SSH sertleştirmesi, kritik otomatik testler, cihaz bazlı session sistemi, production migration, deploy ve GitHub push tamamlandı.

Teknik ayrıntılar için:

[CANLIYA_HAZIRLIK_TEKNIK_REFERANS.md](./CANLIYA_HAZIRLIK_TEKNIK_REFERANS.md)
