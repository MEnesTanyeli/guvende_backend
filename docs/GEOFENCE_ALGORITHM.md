# Güvenli bölge giriş/çıkış algoritması

17 Eylül 2026

## Karar kuralları

Her kullanıcı ve bölge için doğrulanmış durum PostgreSQL'de saklanır: `unknown`, `inside`, `outside`. Bölge kendi ailesine ait olduğundan aileler ve örtüşen bölgeler birbirinden bağımsızdır.

- Çıkış için **en az üç ardışık, güvenilir dış ölçüm** gerekir. İlk ve son adayın ölçüm zamanı arasında **en az 10 saniye** bulunmalıdır. Yükleme zamanı kullanılmaz.
- Dış ölçüm: `merkeze uzaklık - GPS doğruluğu > yarıçap + max(10 metre, yarıçap × %20)`.
- İç ölçüm: `merkeze uzaklık + GPS doğruluğu <= yarıçap`. Giriş de üç ölçüm / 10 saniye ile doğrulanır; kısa bir içeri sapması yeni giriş oluşturmaz.
- Aradaki belirsiz şerit, kalitesiz ölçüm veya doğrulanmış tarafa dönüş aday sayacını sıfırlar. **Doğrulanmış içeride/dışarıda durumu korunur.** Bir ya da iki dış ölçümden sonra bölge rozeti kaldırılmaz.
- GPS doğruluğu eksik, geçersiz veya 50 metreden kötüyse ölçüm geçiş kanıtı sayılmaz. Ham konum yine saklanır.
- Son güvenilir ölçüme göre, iki ölçümün hata payları çıkarıldıktan sonra 180 km/sa üzeri hız gerektiren sıçrama aday sayılmaz; güvenilir referans bu sıçramaya taşınmaz.
- İki ölçüm arasında 120 saniyeden fazla boşluk varsa aday serisi yeniden başlar. Doğrulanmış durum silinmez.
- Aynı veya eski ölçüm zamanları tekrar sayılmaz ve durumu geriye çevirmez. Geç gelen noktalar rota geçmişine kaydedilir.

Örnek: 50 metrelik bölge ve 10 metrelik GPS doğruluğunda dış aday olmak için merkezden **70 metreden fazla** uzaklık gerekir. Bu koşulu sağlayan üç ölçüm en az 10 saniyeye yayıldığında çıkış doğrulanır. 55–65 metre civarındaki oynamalar çıkış oluşturmaz. Ölçüm sıklığı seyrekse gerçek bildirim gecikmesi de artar.

## Başlangıç ve devamlılık

İlk kez dışarıda görülmek çıkış değildir. Başlangıçta içeride bulunma üç güvenilir ölçümle doğrulanır ve giriş bildirilebilir. İlk kalıcı durum oluşturulurken bölge oluşturulduktan sonraki, son 24 saate ait en fazla 200 önceki ölçüm sessizce değerlendirilir; eski bildirimler yeniden gönderilmez. Yeterli geçmiş yoksa yeni ölçümler beklenir. Bölge oluşturulmadan önceki konumlardan geçiş üretilmez.

Bir geçiş doğrulanınca durum değişir; dışarıda kalmak aynı çıkışı tekrar üretmez. Sonraki doğrulanmış giriş, yeni bir çıkışa izin verir. Diğer bir bölgenin aktif alarmı bunu engellemez. Önceki aktif bölge alarmları yalnızca aynı kullanıcı + aile + bölge için çözümlenir.

## Kayıt ve toplu gönderim

Geçiş saati (`occurredAt`), doğrulanmış üçlü serinin ilk iç/dış ölçümüdür; doğrulama saati (`confirmedAt`) ayrı tutulur. Bu, GPS ölçümlerinden belirlenen geçiş zamanıdır. Bildirimin sunucuya kaydedilme saati `createdAt` olarak kalır.

Serideki herhangi bir ölçüm çevrimdışı işaretliyse bildirimde olay tarihi/saati ve **“Çevrimdışı kaydedildi; internet bağlantısı geldikten sonra iletildi.”** açıklaması gösterilir. Beş dakikadan kısa bağlantı kesintileri de buna dahildir. `deliveryMode=deferred` / gecikme nedeni olan veya beş dakikadan eski kayıtlarda da gecikme belirtilir; çevrimdışı işareti yoksa yalnızca gecikmeli teslim denir. Bu alanlar push/WebSocket verisine de eklenir. Bildirim ekranında olay saati esas alınır, gecikmeli bildirimlerde kayıt saati ayrıca gösterilir.

Konum, bölge durumu ve alarm kaydı aynı veritabanı transaction'ında yazılır. Kullanıcı bazlı PostgreSQL transaction advisory lock, birden fazla sunucu sürecinde eşzamanlı sayaç güncellemelerini sıralar. `devicePointId` ile tekrar gönderimler tekrar sayılmaz.

Toplu yüklemedeki **her nokta** ölçüm sırasıyla aynı işlemden geçer. Paket sınırları üç ölçümlük seriyi bozmaz. Gecikmiş/offline kayıtlarda drift koruması atlanmaz. Kayıt hatasında paket ilerletilmez; henüz işlenmeyen kimlikler onaylanmaz ve istemci kuyruğunda kalır.

Bildirim gönderimi transaction tamamlandıktan sonra mevcut bildirim servisiyle yapılır. Bu değişiklik push teslimatı için yeni bir outbox/yeniden deneme sistemi eklemez; kayıt sonrası ağ/servis kesintisinde alarm geçmişte bulunur, push teslimi garanti edilmez. `insideZoneName` REST ve WebSocket yanıtlarında aynı doğrulanmış durumdan gelir. Harita koordinatları değiştirilmez.

## Dağıtım

1. `20260917120000_persistent_geofence_state` migration'ı `npx prisma migrate deploy` ile uygulanmalı.
2. Prisma client yeniden üretilmeli (`npx prisma generate`) ve backend derlenmeli (`npm run build`).
3. Yeni backend çalıştırılmalı. Mevcut Dockerfile derleme sırasında client üretir, başlangıçta migration uygular.

Çıkış algoritması ve push mesajındaki çevrimdışı açıklaması backend güncellemesiyle çalışır. Uygulama içindeki ayrı olay/bildirim saati gösterimi için güncel mobil sürüm kurulmalıdır. Yerel geliştirmede migration canlı veritabanına uygulanmadı ve dağıtım yapılmadı.

## Doğrulama ve sınırlar

`npm test -- --runInBand`: **10 test paketi / 89 test başarılı.** GPS sekmeleri, doğruluk payı, üç ölçüm/10 saniye şartı, ölçüm boşluğu, gerçek çıkış/giriş, toplu yükleme, eski/tekrar kayıtlar, servis yeniden oluşturma, bölge/kullanıcı izolasyonu, kısa çevrimdışı kesinti ve olay saati test edildi. Backend derlemesi, mobil production derlemesi, `npx prisma validate` ve değişen TypeScript dosyalarında ESLint hata kontrolü başarılı; taklit bağımlılık kullanan testlerde tip güvenliği uyarıları bulunuyor.

Veritabanı bağımlılıkları servis testlerinde taklittir. Bu ortamda çalışan PostgreSQL/Docker servisi olmadığı için gerçek PostgreSQL üzerinde migration, kilit eşzamanlılığı ve rollback testi yapılmadı. Gerçek cihazda sınırda bekleme ve giriş/çıkış yürüyüşü ayrıca denenmelidir. Uzun süre boyunca tutarlı ve yanlış biçimde yüksek doğruluk bildiren GPS verisini sadece koordinatlardan kesin ayırt etmek mümkün değildir.
