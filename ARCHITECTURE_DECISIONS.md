# ARCHITECTURE_DECISIONS — Mimari Kararlar

## ADR-001 — Develop/Main Branch ve Dev/Prod Ortam Ayrımı

- Status — Durum: ACCEPTED
- Date — Tarih: 2026-08-25

### Context — Bağlam
Proje iki ayrı çalışma ortamına sahiptir: geliştirme/test için dev API ve kullanıcıların kullandığı production API. Branch yapısı ile sunucu ortamlarının karışmaması gerekir.

### Decision — Karar
develop branch'i https://dev-api.guvende.app ortamına, main branch'i https://api.guvende.app ortamına alınır. Dev ve prod backend aynı kod tabanını kullanabilir; fakat env dosyaları, database bağlantıları ve servis portları ortam bazlı ayrı kalır.

### Reason — Gerekçe
Geliştirme sırasında production verisi ve kullanıcı akışı etkilenmemelidir. Main'e merge edilen kod production adayıdır; env kopyalama ile ortam değiştirmek yasaktır.

### Alternatives — Alternatifler
Tek branch ve tek sunucu kullanmak; aynı sunucuda aynı env ile test yapmak; manuel dosya kopyalayarak production'a almak.

### Why Not — Neden Seçilmedi?
Bu alternatifler test verisi ile production verisinin karışmasına, secret/env hatalarına ve rollback zorluğuna yol açar.

### Consequences — Sonuçlar
Deploy akışı daha disiplinli olur. Buna karşılık env yönetimi ve release kontrolü yazılı prosedür ister.

### Reconsider When — Ne Zaman Yeniden Değerlendir?
CI/CD otomasyonu kurulursa veya staging/preview ortam sayısı değişirse.

## ADR-002 — Database UTC Kalır, Gün Filtresi Kullanıcı Zaman Dilimine Göre Yapılır

- Status — Durum: ACCEPTED
- Date — Tarih: 2026-08-25

### Context — Bağlam
Lokasyon geçmişi ve rota günleri Türkiye'deki kullanıcı davranışına göre gösteriliyor. Veritabanında zamanların hangi timezone ile tutulacağı kararı gerekir.

### Decision — Karar
Database timestamp değerleri UTC kalır. Günlük filtreleme ve kullanıcıya gösterim Türkiye yerel gün sınırına göre hesaplanır.

### Reason — Gerekçe
UTC saklama, ileride farklı timezone, servis, log ve entegrasyonlarda daha güvenli ve standarttır. Kullanıcı deneyimi ise uygulama katmanında yerel güne çevrilir.

### Alternatives — Alternatifler
Database'i Türkiye saatiyle saklamak; tüm tarihleri frontend'de yorumlamak.

### Why Not — Neden Seçilmedi?
Türkiye saatiyle saklamak uzun vadede entegrasyon ve yaz/kış saati benzeri edge-case riskleri yaratır. Tüm sorumluluğu frontend'e bırakmak API contract'ını belirsizleştirir.

### Consequences — Sonuçlar
Backend'de gün aralığı hesaplama helper'ı tek doğru kaynak olmalıdır. Testlerde UTC/TR dönüşümü açık doğrulanmalıdır.

### Reconsider When — Ne Zaman Yeniden Değerlendir?
Uygulama çoklu ülke/timezone desteğine geçerse veya kullanıcı bazlı timezone ayarı eklenirse.

## ADR-003 — Secret ve Env Değerleri Repoya Girmez

- Status — Durum: ACCEPTED
- Date — Tarih: 2026-08-25

### Context — Bağlam
Dev/prod database, mail provider ve token anahtarları ortam bazlı farklıdır. Bu değerlerin yanlış kopyalanması production verisini riske atar.

### Decision — Karar
.env.dev, .env.production ve secret değerleri Git'e commit edilmez. Deploy sırasında ilgili ortam kendi env dosyasını kullanır. Kod merge edildiğinde env dosyası merge edilmez.

### Reason — Gerekçe
Secret sızıntısını ve dev/prod database karışmasını önler.

### Alternatives — Alternatifler
Env dosyalarını repoda tutmak; her deploy'da env dosyasını elle kopyalamak.

### Why Not — Neden Seçilmedi?
Bu yöntemler secret sızıntısı ve yanlış database bağlantısı riski taşır.

### Consequences — Sonuçlar
Yeni env değişkeni eklendiğinde örnek dokümantasyon güncellenmeli ve dev/prod sunucu env dosyaları ayrı ayrı elle doğrulanmalıdır.

### Reconsider When — Ne Zaman Yeniden Değerlendir?
Secret manager veya CI/CD environment secret sistemi kurulduğunda.
