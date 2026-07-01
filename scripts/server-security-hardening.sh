#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Bu betik sudo ile calistirilmalidir." >&2
  exit 1
fi

SSH_DROPIN="/etc/ssh/sshd_config.d/99-guvende-hardening.conf"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

echo "[1/6] Mevcut SSH ayarlari yedekleniyor..."
install -d -m 700 /root/guvende-security-backups
cp -a /etc/ssh/sshd_config "/root/guvende-security-backups/sshd_config.${STAMP}"
if [[ -f "${SSH_DROPIN}" ]]; then
  cp -a "${SSH_DROPIN}" "/root/guvende-security-backups/99-guvende-hardening.conf.${STAMP}"
fi

echo "[2/6] SSH yalnizca anahtar girisine ayarlaniyor..."
cat >"${SSH_DROPIN}" <<'EOF'
# Guvende sunucusu SSH sertlestirmesi
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin no
EOF
chmod 600 "${SSH_DROPIN}"

echo "[3/6] SSH yapilandirmasi dogrulaniyor..."
sshd -t
systemctl reload ssh

echo "[4/6] UFW kurallari ayarlaniyor..."
ufw default deny incoming
ufw default allow outgoing
ufw allow from 192.168.1.0/24 to any port 22 proto tcp comment 'SSH from LAN'
ufw allow from 100.64.0.0/10 to any port 22 proto tcp comment 'SSH from Tailscale'
ufw --force enable

echo "[5/6] Otomatik guvenlik guncellemeleri etkinlestiriliyor..."
if ! dpkg-query -W -f='${Status}' unattended-upgrades 2>/dev/null | grep -q 'install ok installed'; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades
fi
systemctl enable --now unattended-upgrades

echo "[6/6] Son durum..."
echo "--- UFW ---"
ufw status verbose
echo "--- SSH effective settings ---"
sshd -T | grep -E '^(pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '
echo "--- unattended-upgrades ---"
systemctl is-enabled unattended-upgrades
systemctl is-active unattended-upgrades
echo "--- Tailscale ---"
systemctl is-active tailscaled || true
tailscale ip -4 || true
echo "GUVENLIK_AYARLARI_TAMAMLANDI"
