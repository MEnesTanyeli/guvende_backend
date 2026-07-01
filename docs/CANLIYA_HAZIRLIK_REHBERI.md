# Güvende Backend — Basit Canlıya Hazırlık Rehberi

Bu dosya, projede yeni olan biri için kısa yol haritasıdır. Teknik ayrıntılar gerektiğinde [teknik referans belgesine](./CANLIYA_HAZIRLIK_TEKNIK_REFERANS.md) bakabilirsin.

## Şu anda sistem çalışıyor mu?

Evet.

- Backend adresi: `https://api.guvende.app`
- Ubuntu sunucu çalışıyor.
- Backend ve PostgreSQL Docker içinde çalışıyor.
- Cloudflare Tunnel aktif.
- Brevo e-posta sistemi bağlı.
- Veritabanının günlük yerel yedeği ayarlandı.

Ancak “çalışıyor” ile “canlıya tamamen hazır” aynı şey değildir.

## Canlıya çıkmadan önce en önemli 5 iş

### 1. Gizli anahtarları yenile

Eskiden `.env` dosyası Git'e eklenmiş. Bu nedenle içindeki eski anahtarların başkası tarafından görülmüş olabileceğini kabul etmeliyiz.

Yapılacaklar:

- JWT secret yenilenecek.
- OneSignal REST API key yenilenecek.
- Eski ve kullanılmayan anahtarlar silinecek.

JWT secret yenilenince kullanıcıların tekrar giriş yapması normaldir.

### 2. Yedeği başka bir yere de gönder

Günlük PostgreSQL yedeği hazırlandı fakat şu an aynı sunucunun diskinde tutuluyor.

Sunucunun diski bozulursa hem veritabanı hem yerel yedek kaybolabilir. Bu nedenle yedeğin bir kopyası Cloudflare R2, Backblaze B2 veya başka bir güvenli depoya gönderilmeli.

### 3. E-posta değiştirme kodunu düzelt

Kayıt ve şifre sıfırlama kodları güvenli şekilde hash'leniyor. Fakat e-posta değiştirme kodu hâlâ log'a yazılıyor ve açık biçimde saklanıyor.

Canlıdan önce:

- Kod hash'lenmeli.
- Log'a yazılmamalı.
- Kullanıcıya gerçek e-posta ile gönderilmeli.
- Deneme ve süre limiti eklenmeli.

### 4. İzleme ve alarm kur

Uygulama çöktüğünde bunu kullanıcı söylemeden öğrenmeliyiz.

En azından şu kontroller gerekli:

- `api.guvende.app` çalışıyor mu?
- Docker container yeniden başladı mı?
- Disk doluyor mu?
- Günlük yedek başarılı mı?
- Backend hata oranı arttı mı?

Başlangıç için Uptime Kuma ve Sentry kullanılabilir.

### 5. Gerçek senaryoları test et

Mevcut otomatik test sayısı çok az. Aşağıdaki işlemleri test etmeliyiz:

- Yeni kullanıcı kaydı
- E-posta doğrulama kodu
- Giriş
- Şifre sıfırlama
- Aile oluşturma ve aileye katılma
- Başka ailenin verisine erişememe
- Konum gönderme ve görüntüleme
- WebSocket bağlantısı
- Push bildirim
- Yedekten geri yükleme

## Şimdiye kadar ne yaptık?

- `guvende.app` domaini alındı.
- `api.guvende.app` backend'e bağlandı.
- CGNAT, Cloudflare Tunnel ile aşıldı.
- HTTPS aktif edildi.
- Brevo domain doğrulaması yapıldı.
- Kayıt ve şifre sıfırlama e-postaları eklendi.
- OTP gönderim ve deneme limitleri eklendi.
- Güvensiz premium test endpoint'i kaldırıldı.
- Konum simülasyon endpoint'leri kaldırıldı.
- CORS yalnızca izin verilen adreslerle sınırlandı.
- Docker güvenlik ayarları hazırlandı.
- HTTP güvenlik başlıkları hazırlandı.
- Bağımlılık güvenlik taraması temizlendi.
- Günlük PostgreSQL yedeği kuruldu.
- İlk yedek oluşturulup okunabildiği doğrulandı.

## Henüz canlıya uygulanmayan değişiklik

Güvenlik düzenlemelerinin kodu hazırlandı, test edildi ve GitHub'a gönderildi. Fakat yeni Docker image henüz production'da başlatılmadı.

Bu bilinçli olarak durduruldu. Önce değişiklikleri anlamak, sonra kontrollü deploy yapmak daha güvenlidir.

## Bundan sonra hangi sırayla ilerleyeceğiz?

1. E-posta değiştirme OTP güvenliğini düzelt.
2. JWT secret ve OneSignal anahtarını yenile.
3. Güncel veritabanı yedeği al.
4. Yeni Docker image oluştur.
5. Backend container'ını yeniden başlat.
6. Health check'i bekle.
7. Kayıt, giriş, e-posta ve konum testlerini yap.
8. Logları kontrol et.
9. Sorun yoksa sürümü canlı kabul et.
10. Off-site yedek ve izleme sistemini kur.

## Bir deploy nasıl yapılır?

Temel komutlar şunlardır:

```bash
cd ~/apps/guvende_backend

# Önce yedek
bash scripts/backup-production-db.sh

# Yeni image oluştur ve backend'i güncelle
docker compose --env-file .env.production -f docker-compose.prod.yml build backend
docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend

# Durumu kontrol et
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -i https://api.guvende.app/health
```

Bu komutları körlemesine çalıştırmayacağız. Her adımdan sonra çıktıyı kontrol edeceğiz.

## Sorun olursa nasıl geri döneriz?

Temel rollback mantığı:

1. Hatalı sürümün loglarını kaydet.
2. Bir önceki sağlam Git commit'ine dön.
3. Önceki Docker image'ını yeniden oluştur.
4. Gerekirse veritabanını yedekten geri yükle.
5. Health check ve temel kullanıcı işlemlerini yeniden test et.

Veritabanı migration'ı varsa kodu geri almak tek başına yeterli olmayabilir. Bu yüzden migration öncesi yedek zorunludur.

## Basit kavram sözlüğü

**Backend:** Mobil uygulamanın veri aldığı ve işlem yaptırdığı sunucu uygulaması.

**Domain:** IP adresi yerine kullanılan isim. Örnek: `api.guvende.app`.

**Cloudflare Tunnel:** Modemden port açmadan backend'i internete bağlayan güvenli dış bağlantı.

**Docker container:** Uygulamayı bağımlılıklarıyla izole biçimde çalıştıran ortam.

**PostgreSQL:** Kullanıcılar, aileler, konumlar ve diğer verilerin tutulduğu veritabanı.

**JWT:** Kullanıcının giriş yaptığını kanıtlayan imzalı token.

**Secret/API key:** Uygulamanın servislerle güvenli iletişim kurmasını sağlayan gizli anahtar.

**CORS:** Hangi web adreslerinin API'ye tarayıcı üzerinden ulaşabileceğini belirleyen kural.

**OTP:** Tek kullanımlık doğrulama kodu.

**Migration:** Veritabanı yapısında kontrollü değişiklik.

**Backup:** Veri kaybında geri yüklemek için alınan veritabanı kopyası.

**Health check:** Uygulamanın çalışıp çalışmadığını otomatik kontrol eden istek.

**Deploy:** Hazırlanan yeni kod sürümünü çalışan sunucuya alma işlemi.

**Rollback:** Sorunlu deploy'dan önceki sağlam sürüme geri dönme işlemi.

## Kısa kontrol listesi

- [x] Domain ve HTTPS
- [x] Cloudflare Tunnel
- [x] Docker ve PostgreSQL
- [x] E-posta gönderimi
- [x] Yerel günlük yedek
- [x] Bağımlılık güvenlik taraması
- [ ] E-posta değiştirme OTP güvenliği
- [ ] Secret rotasyonu
- [ ] Sertleştirilmiş sürümün deploy'u
- [ ] Uçtan uca testler
- [ ] Off-site yedek
- [ ] Uptime ve hata izleme
- [ ] UFW ve SSH güvenlik kontrolü

## Özet

Sistem iyi bir temel üzerinde çalışıyor fakat birkaç kritik operasyon işi tamamlanmadan gerçek kullanıcı trafiğine açılmamalı. Önceliğimiz özellik eklemek değil; secret, yedek, test, izleme ve güvenli deploy düzenini tamamlamak.

Ayrıntılı teknik açıklamalar için:

[CANLIYA_HAZIRLIK_TEKNIK_REFERANS.md](./CANLIYA_HAZIRLIK_TEKNIK_REFERANS.md)
