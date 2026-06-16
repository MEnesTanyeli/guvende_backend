#!/usr/bin/env sh
set -eu

output_file="${1:-.env.production}"

if [ -e "$output_file" ]; then
  echo "$output_file already exists; refusing to overwrite it." >&2
  exit 1
fi

umask 077
postgres_password="$(openssl rand -hex 32)"
jwt_secret="$(openssl rand -hex 48)"

{
  echo "POSTGRES_DB=guvende"
  echo "POSTGRES_USER=guvende"
  echo "POSTGRES_PASSWORD=$postgres_password"
  echo "JWT_SECRET=$jwt_secret"
  echo "JWT_EXPIRES_IN=7d"
  echo "ONESIGNAL_APP_ID="
  echo "ONESIGNAL_REST_API_KEY="
} > "$output_file"

chmod 600 "$output_file"
echo "Created $output_file with restricted permissions."
