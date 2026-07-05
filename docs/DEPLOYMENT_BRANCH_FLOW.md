# Deployment branch flow

Bu projede iki kalıcı ortam vardır:

- `main`: canlı ortam, `api.guvende.app`, port `3001`
- `develop`: test ortamı, `dev-api.guvende.app`, port `3002`

Günlük geliştirme `develop` dalına gider. Test sağlıklıysa `develop`, `main` içine alınır ve canlı deploy edilir.

Sunucudaki klasörler:

- `/home/enes/apps/guvende_backend`: production, `origin/main`
- `/home/enes/apps/guvende_backend_dev`: test, `origin/develop`

Kısa komut anlamları:

- “test ortamını güncelle”: `/home/enes/apps/guvende_backend_dev` içinde `origin/develop` deploy edilir.
- “canlıya al”: `/home/enes/apps/guvende_backend` içinde `origin/main` deploy edilir.
