-- A guardian may be selected as the active proxy of at most one user.
-- PostgreSQL permits multiple NULL values in a unique index.
CREATE UNIQUE INDEX "users_proxyId_key" ON "users"("proxyId");
