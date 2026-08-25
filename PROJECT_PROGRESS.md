# PROJECT_PROGRESS — Proje İlerleme Durumu

> Bu dosya software-playbook-v1.3 standardına göre mevcut gerçeğin kısa kaydıdır. Her çalışma sonunda güncellenir.

## Project — Proje

- Name — Ad: guvende_backend
- Repository: Backend / NestJS API
- Playbook Version — Playbook Sürümü: 1.3
- Started At — Başlangıç: 2026-08-25
- Last Updated — Son Güncelleme: 2026-08-25 14:16:00 +03:00

## Current Position — Mevcut Konum

- Area — Alan: BACKEND
- Current Feature — Mevcut Özellik: Playbook foundation uyumu
- Current Skill — Mevcut Modül: `backend-feature`
- Current Step — Mevcut Adım: Backend security review tamamlandı; release gate dokümante edildi
- Status — Durum: IN_PROGRESS
- Next Action — Sonraki Tek Eylem: Production review için backup/monitoring/commit SHA kanıtlarını tamamlamak.

## Scope and Acceptance — Kapsam ve Kabul

- In Scope — Kapsam İçi: API davranışı, WebSocket olayları, lokasyon geçmişi gün sınırı, dev/prod env ayrımı, deploy kanıtı.
- Out of Scope — Kapsam Dışı: Frontend UI davranışı, secret değerlerinin repoya yazılması, production DB'nin elle değiştirilmesi.
- Acceptance Criteria — Kabul Kriterleri: Dev ve prod ortamları ayrı env/database ile çalışmalı; build/deploy kanıtı alınmalı; secret sızıntısı olmamalı.

## Evidence — Kanıt

- Commands/Checks — Komutlar/Kontroller: `npm install`; `npx prisma generate`; `npm audit fix`; `npm audit --audit-level=high`; `npm run build`; `npm run lint`; `npm test -- --runInBand`; route/guard/env/security scan; project docs review
- Test Result — Test Sonucu: `npm test -- --runInBand` geçti. 7/7 test suite, 37/37 test success. Jest 29 + ts-jest 29 uyumlu test hattına sabitlendi.
- Build/Lint/Type-check — Derleme/Kod Kontrolü/Tip Kontrolü: `npm run build` geçti. `npm run lint` 0 error ile geçti; mevcut `any`/unsafe tip borçları warning seviyesinde takip ediliyor. Prisma client üretimi başarılı. `npm audit --audit-level=high` 0 vulnerability döndü.
- Review Result — İnceleme Sonucu: Project Brief, Requirements, Use Cases, Domain Map, Tech Stack Decisions, Environment Standard, Security Review ve Release Gate eklendi. Audit bulguları kapandı; backend test runner engeli kaldırıldı. `families.service.ts` içindeki eski Türkçe mojibake dizileri temizlendi. Security review sonucu: CRITICAL 0, HIGH 0, MEDIUM 3, LOW 2.

## Feature Matrix — Özellik Matrisi

| Feature — Özellik | Backend | Frontend | Tests — Testler | Security Review — Güvenlik Kontrolü | Performance Review — Performans Kontrolü | Docs — Doküman | Next Action — Sonraki Eylem |
|---|---|---|---|---|---|---|---|
| Dev/prod backend environments | COMPLETED | N/A | DEPLOY_ONLY | COMPLETED | NOT_REQUIRED | COMPLETED | Env anahtarlarını secret olarak koru |
| Forgot password mail | COMPLETED | SUPPORTS | UNIT_PASS | COMPLETED | NOT_REQUIRED | COMPLETED | Dev/prod mail sağlayıcı ayrımını izleme |
| Location day boundary | IN_PROGRESS | SUPPORTS | SERVER_PENDING | NOT_REQUIRED | IN_PROGRESS | IN_PROGRESS | Dev deploy sonrası tarih filtresini test et |
| Video call temporary disable | COMPLETED | IN_PROGRESS | BUILD_LINT_TEST | COMPLETED | NOT_REQUIRED | IN_PROGRESS | Frontend tarafı ile birlikte release smoke testte izle |
| Environment standard | COMPLETED | SUPPORTS | BUILD_LINT_TEST | COMPLETED | NOT_REQUIRED | COMPLETED | Secret değerleri repo dışında tutulmaya devam edecek |
| Playbook foundation docs | COMPLETED | SUPPORTS | DOC_REVIEW | COMPLETED | NOT_REQUIRED | COMPLETED | Production review kanıtlarına geç |
| Dependency audit cleanup | COMPLETED | N/A | BUILD_LINT_TEST | COMPLETED | NOT_REQUIRED | COMPLETED | İzleme |

## Foundation and Release Progress — Temel ve Sürüm İlerlemesi

| Area — Alan | Skill — Modül | Status — Durum | Evidence/Reason — Kanıt/Gerekçe |
|---|---|---|---|
| PROJECT | project-discovery — Proje Keşfi | COMPLETED | `docs/PROJECT_BRIEF.md` eklendi ve mevcut çalışma brief'i kabul edildi. |
| PROJECT | requirements-analysis — Gereksinim Analizi | COMPLETED | `docs/REQUIREMENTS.md` fonksiyonel/non-functional gereksinimleri önceliklendirdi. |
| PROJECT | use-case-design — Kullanım Senaryosu Tasarımı | COMPLETED | `docs/USE_CASES.md` kritik akışları aktör, hata ve veri etkisiyle tanımladı. |
| PROJECT | domain-design — İş Alanı Tasarımı | COMPLETED | `docs/DOMAIN_MAP.md` domain sahipliklerini ve ownership sınırlarını tanımladı. |
| PROJECT | architecture-planning — Mimari Planlama | COMPLETED | `ARCHITECTURE_DECISIONS.md` dev/prod, UTC gün filtresi ve env kararlarını kaydetti. |
| PROJECT | technology-selection — Teknoloji Seçimi | COMPLETED | `docs/TECH_STACK_DECISIONS.md` seçilen ve ertelenen teknolojileri gerekçelendirdi. |
| BACKEND | backend-foundation — Backend Temel Altyapısı | IN_PROGRESS | NestJS API, Prisma, Docker Compose kullanılıyor; build/lint/test/audit kapıları geçiyor. |
| BACKEND | database-design — Veritabanı Tasarımı | IN_PROGRESS | Dev/prod DB ayrımı var; production değişiklikleri migration ile yapılmalı. |
| BACKEND | api-design — API Tasarımı | IN_PROGRESS | Swagger/OpenAPI güncelliği ayrıca kontrol edilmeli. |
| BACKEND | authentication — Kimlik Doğrulama | IN_PROGRESS | Token refresh ve auth race durumları gözleniyor. |
| BACKEND | authorization — Yetkilendirme | IN_PROGRESS | Ownership ve aile kaynak erişimleri backend'de doğrulanmalı. |
| BACKEND | backend-security-review — Backend Güvenlik Kontrolü | COMPLETED | `docs/SECURITY_REVIEW.md` eklendi; CRITICAL 0, HIGH 0. |
| DEVOPS | docker-compose — Docker Servis Yönetimi | IN_PROGRESS | Dev/prod compose dosyaları ayrı. |
| DEVOPS | environment-standard — Ortam Standardı | COMPLETED | `.env.dev.example`, `.env.production.example`, `.env.local.example` eklendi; gerçek env dosyaları ignore ediliyor. |
| PRODUCTION | deployment — Yayına Alma | IN_PROGRESS | Dev develop, prod main branch üzerinden ilerliyor. |
| PRODUCTION | health-check — Sağlık Kontrolü | IN_PROGRESS | Deploy sonrası health/log kontrolü yapılıyor. |

## Active Optional Modules — Etkin Opsiyonel Modüller

| Skill — Modül | Status — Durum | Trigger/Reason — Tetikleyici/Gerekçe | Owner — Sorumlu |
|---|---|---|---|
| websocket | IN_PROGRESS | Aile odaları, bildirimler, lokasyon ve geçici kapatılan video call signaling | Backend |
| scheduled-jobs | NOT_STARTED | Rota/gün sınırı ve bakım işleri ileride gerektirebilir | Backend |

## Blockers — Engeller

| Blocker — Engel | Owner — Sorumlu | Unblock Condition — Çözülme Koşulu |
|---|---|---|
| Yok | N/A | N/A |

## Accepted Risks and Technical Debt — Kabul Edilmiş Riskler ve Teknik Borç

| Item — Madde | Severity — Önem | Owner — Sorumlu | Due/Trigger — Tarih/Tetikleyici |
|---|---|---|---|
| Dev ve prod env değerleri manuel yönetiliyor | MEDIUM | DevOps | Env örnekleri ve standart dokümanı eklendi; CI/secret manager kurulunca tekrar değerlendirilecek |
| Video call signaling no-op hale getiriliyor | MEDIUM | Backend | Özellik yeniden açılmadan önce API/WebSocket contract yeniden tasarlanacak |
| Backend unsafe type warning borcu | MEDIUM | Backend | Geniş davranış refactor'u yerine mevcut gate 0 error; yeni/taşınan kodlarda tipler güçlendirilecek |
| `POST /users/purchase-mock` production riski | MEDIUM | Product/Backend | Production öncesi gerçek ödeme akışına taşınacak veya env-gate ile dev-only yapılacak |
| Backup/monitoring release kanıtı eksik | MEDIUM | DevOps | Production review tamamlanmadan canlı release tamamlandı sayılmayacak |
