# Frontend Oturum Entegrasyonu

Backend artık kısa ömürlü access token ve dönen refresh token kullanır.

## Token süreleri

- Access token: 15 dakika
- Refresh token: 30 gün
- Her refresh işleminde eski refresh token iptal edilir ve yenisi döner.
- Her cihaz ayrı bir token ailesine sahiptir.
- Yenilenmiş eski refresh token 3 saniye içinde tekrar gelirse yarış durumu kabul edilir ve `409 REFRESH_ALREADY_ROTATED` döner.
- Aynı eski token 3 saniyeden sonra tekrar kullanılırsa yalnızca ilgili cihazın token ailesi kapatılır; diğer cihazlar etkilenmez.

## Login ve kayıt cevabı

`POST /auth/login`, `POST /auth/admin/login` ve `POST /auth/register` cevaplarında:

```json
{
  "message": "Giriş başarılı.",
  "token": "ACCESS_TOKEN",
  "accessToken": "ACCESS_TOKEN",
  "refreshToken": "REFRESH_TOKEN",
  "accessTokenExpiresIn": 900,
  "refreshTokenExpiresAt": "2026-08-01T00:00:00.000Z",
  "user": {}
}
```

`token` yalnızca eski frontend sürümünün hemen kırılmaması için geçici olarak tutulur. Yeni kod `accessToken` kullanmalıdır.

Login ve kayıt isteklerinde kalıcı, uygulamaya özel bir `deviceId` gönderilmelidir. Aynı cihaz tekrar giriş yaptığında o cihazın önceki aktif session'ı kapatılır.

## Token yenileme

İstek:

```http
POST /auth/refresh
Content-Type: application/json
```

```json
{
  "refreshToken": "MEVCUT_REFRESH_TOKEN"
}
```

Cevap yeni bir `accessToken` ve yeni bir `refreshToken` döndürür. Frontend iki değeri de tek işlemde eski değerlerin üzerine yazmalıdır. Eski refresh token bir daha kullanılmamalıdır.

Eski token başarılı yenilemeden sonraki 3 saniye içinde ikinci kez gönderilirse:

```json
{
  "statusCode": 409,
  "code": "REFRESH_ALREADY_ROTATED",
  "message": "Refresh token kısa süre önce yenilendi. Güncel tokenı güvenli depodan tekrar okuyun.",
  "retryAfterMs": 1250
}
```

Backend ham refresh token saklamadığı için yeni tokenı ikinci kez göndermez. İkinci çalışan taraf `retryAfterMs` kadar beklemeli, ortak güvenli depodaki güncel token çiftini yeniden okumalı ve isteğine devam etmelidir.

## Frontend davranışı

1. API isteklerinde `Authorization: Bearer ACCESS_TOKEN` gönder.
2. Bir istek `401` dönerse yalnızca bir refresh isteği başlat.
3. Aynı anda gelen diğer `401` cevaplarını bu tek refresh işleminin arkasında beklet.
4. Refresh başarılıysa yeni iki tokenı kaydet ve bekleyen istekleri bir kez tekrarla.
5. Refresh de `401` dönerse tokenları sil ve kullanıcıyı login ekranına gönder.
6. Refresh `409 REFRESH_ALREADY_ROTATED` dönerse tokenları silme; `retryAfterMs` kadar bekle ve ortak güvenli depodan güncel tokenları yeniden oku.
7. Sonsuz refresh/istek tekrar döngüsü oluşturma.

WebView ve yerel Android Java katmanı aynı güvenli token deposunu ve cihaz genelinde tek bir refresh kilidini kullanmalıdır. Grace period ağ yarışı için son savunmadır; refresh kilidinin yerini tutmaz.

## Çıkış endpointleri

Geçerli access token ile:

```http
POST /auth/logout
Authorization: Bearer ACCESS_TOKEN
```

Yalnızca mevcut cihazın oturumunu kapatır.

```http
POST /auth/logout-all
Authorization: Bearer ACCESS_TOKEN
```

Kullanıcının bütün cihazlardaki oturumlarını kapatır.

Logout çağrısından sonra frontend, sonuç ne olursa olsun yerel tokenları silmelidir.

## Token saklama

- Mobil uygulamada refresh token işletim sisteminin güvenli kasasında tutulmalıdır: Android Keystore / iOS Keychain.
- WebView ve yerel Java tokenlara tek bir ortak, atomik yazma/okuma katmanı üzerinden erişmelidir.
- Access token mümkünse yalnızca bellekte tutulmalıdır.
- Tokenlar loglara, hata mesajlarına, analitik sistemine veya Git deposuna yazılmamalıdır.
- Web uygulamasında refresh tokenı `localStorage` içinde tutmayın. Web sürümü canlıya alınacaksa HttpOnly cookie tabanlı ayrı akış hazırlanmalıdır.

## WebSocket

Socket bağlantısı access token ile açılır:

```ts
io(API_URL, {
  auth: { token: `Bearer ${accessToken}` }
});
```

Access token yenilendiğinde socket yeni tokenla yeniden bağlanmalıdır. Token süresi dolarsa veya session iptal edilirse backend socket bağlantısını kapatır.

## Geçiş etkisi

Yeni backend production'a alındığında eski JWT'lerde session kimliği bulunmayacağı için mevcut kullanıcıların bir kez yeniden giriş yapması gerekir.
