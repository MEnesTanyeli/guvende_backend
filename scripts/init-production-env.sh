#!/usr/bin/env sh
set -eu

output_file="${1:-.env.production}"
umask 077

generate_offline_sos_master_key() {
  key="$(
    openssl rand -base64 32 |
      tr '+/' '-_' |
      tr -d '=' |
      tr -d '\n'
  )"

  case "$key" in
    ''|*[!A-Za-z0-9_-]*)
      echo "Failed to generate OFFLINE_SOS_MASTER_KEY." >&2
      return 1
      ;;
  esac

  if [ "${#key}" -ne 43 ]; then
    echo "Failed to generate a 32-byte base64url OFFLINE_SOS_MASTER_KEY." >&2
    return 1
  fi

  printf '%s' "$key"
}

if [ -e "$output_file" ]; then
  if awk -F= '
    $1 == "OFFLINE_SOS_MASTER_KEY" {
      value = substr($0, index($0, "=") + 1)
      sub(/\r$/, "", value)
      if (length(value) > 0) found = 1
    }
    END { exit(found ? 0 : 1) }
  ' "$output_file"; then
    echo "$output_file already has OFFLINE_SOS_MASTER_KEY; preserving it."
    exit 0
  fi

  offline_sos_master_key="$(generate_offline_sos_master_key)"
  temp_file="${output_file}.tmp.$$"
  if ! (set -C; : > "$temp_file") 2>/dev/null; then
    echo "Cannot safely create a temporary file for $output_file." >&2
    exit 1
  fi
  trap 'rm -f "$temp_file"' 0 HUP INT TERM

  carriage_return="$(printf '\r')"
  key_line_written=0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      OFFLINE_SOS_MASTER_KEY=*)
        existing_key="${line#OFFLINE_SOS_MASTER_KEY=}"
        existing_key="${existing_key%"$carriage_return"}"
        if [ -z "$existing_key" ]; then
          if [ "$key_line_written" -eq 0 ]; then
            printf 'OFFLINE_SOS_MASTER_KEY=%s\n' "$offline_sos_master_key" >> "$temp_file"
            key_line_written=1
          fi
        else
          printf '%s\n' "$line" >> "$temp_file"
          key_line_written=1
        fi
        ;;
      *)
        printf '%s\n' "$line" >> "$temp_file"
        ;;
    esac
  done < "$output_file"

  if [ "$key_line_written" -eq 0 ]; then
    printf '\nOFFLINE_SOS_MASTER_KEY=%s\n' "$offline_sos_master_key" >> "$temp_file"
  fi

  chmod 600 "$temp_file"
  mv "$temp_file" "$output_file"
  trap - 0 HUP INT TERM
  echo "Added missing OFFLINE_SOS_MASTER_KEY to $output_file."
  exit 0
fi

postgres_password="$(openssl rand -hex 32)"
jwt_secret="$(openssl rand -hex 48)"
offline_sos_master_key="$(generate_offline_sos_master_key)"

{
  echo "POSTGRES_DB=guvende"
  echo "POSTGRES_USER=guvende"
  echo "POSTGRES_PASSWORD=$postgres_password"
  echo "JWT_SECRET=$jwt_secret"
  echo "JWT_EXPIRES_IN=7d"
  echo "OFFLINE_SOS_MASTER_KEY=$offline_sos_master_key"
  echo "BREVO_API_KEY=replace-with-production-brevo-api-key"
  echo "ONESIGNAL_APP_ID="
  echo "ONESIGNAL_REST_API_KEY="
  echo "CORS_ORIGINS=https://guvende.app,https://www.guvende.app,capacitor://localhost,http://localhost"
} > "$output_file"

chmod 600 "$output_file"
echo "Created $output_file with restricted permissions."
