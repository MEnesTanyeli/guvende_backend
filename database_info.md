# Güvende Veritabanı Bilgileri

Bu döküman, **Güvende** (Aile Güvenlik Asistanı) backend veritabanı bağlantı bilgilerini içerir.

## Docker Konteyner Bilgileri
- **Resim**: `postgres:16`
- **Konteyner Adı**: `family_guard_db`
- **Çalışma Komutu**:
  ```bash
  docker run --name family_guard_db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres123 -e POSTGRES_DB=family_guard -p 5433:5432 -d postgres:16
  ```

## Bağlantı Detayları
- **Host**: `localhost`
- **Port**: `5433`
- **Kullanıcı**: `postgres`
- **Şifre**: `postgres123`
- **Veritabanı Adı**: `family_guard`
- **Prisma Connection String**:
  ```env
  DATABASE_URL="postgresql://postgres:postgres123@localhost:5433/family_guard?schema=public"
  ```
