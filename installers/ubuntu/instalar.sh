#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "Falha na linha $LINENO. Consulte a saída acima; seus dados não foram apagados." >&2' ERR
[[ $EUID -eq 0 ]] || { echo 'Execute: sudo bash instalar.sh'; exit 1; }
source /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 24.04 ]] || { echo 'Pacote de teste para Ubuntu 24.04 LTS.'; exit 1; }
[[ $(uname -m) == x86_64 ]] || { echo 'Este pacote requer Ubuntu x86_64 (amd64).'; exit 1; }
[[ -d /run/systemd/system ]] || { echo 'É necessário Ubuntu iniciado com systemd.'; exit 1; }
for SERVICE_PORT in 8090; do
  if ss -H -ltn "sport = :$SERVICE_PORT" | grep -q .; then
    echo "A porta $SERVICE_PORT já está em uso. Instalação interrompida antes de alterar o sistema."; exit 1
  fi
done
PACKAGE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ -f "$PACKAGE_DIR/source.tar.gz" ]] || { echo 'source.tar.gz não encontrado ao lado do instalador.'; exit 1; }
cd "$PACKAGE_DIR"
sha256sum -c source.tar.gz.sha256
BASE=/opt/server-dtv
STATE=/var/lib/server-dtv
[[ ! -e "$BASE/app" ]] || { echo 'Já existe uma instalação em /opt/server-dtv. Este instalador não sobrescreve instalações existentes.'; exit 1; }
export DEBIAN_FRONTEND=noninteractive
echo '[1/7] Instalando dependências do Ubuntu…'
apt-get update
apt-get install -y ca-certificates curl xz-utils tar unzip postgresql fonts-dejavu-core fontconfig build-essential python3 openssl
id server-dtv >/dev/null 2>&1 || useradd --system --create-home --home-dir "$STATE" --shell /usr/sbin/nologin server-dtv
install -d -m 755 "$BASE" "$BASE/bin" "$BASE/app" "$BASE/tools" "$BASE/downloads" "$STATE/gravacoes" "$STATE/relatorios" /etc/server-dtv
echo '[2/7] Instalando Node.js 24 LTS e pnpm…'
cd "$BASE/downloads"
curl --fail --location --retry 3 -o SHASUMS256.txt https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
NODE_FILE=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2; exit}' SHASUMS256.txt)
[[ -n $NODE_FILE ]] || { echo 'Versão Node.js 24 não encontrada.'; exit 1; }
curl --fail --location --retry 3 -o "$NODE_FILE" "https://nodejs.org/dist/latest-v24.x/$NODE_FILE"
awk -v name="$NODE_FILE" '$2==name' SHASUMS256.txt | sha256sum -c -
mkdir "$BASE/node"
tar -xJf "$NODE_FILE" --strip-components=1 -C "$BASE/node"
export PATH="$BASE/bin:$BASE/node/bin:$BASE/tools/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
npm install --prefix "$BASE/tools" pnpm@11.25.0
echo '[3/7] Instalando FFmpeg com SRT, H.264, H.265 e ARIB…'
curl --fail --location --retry 3 -o ffmpeg.tar.xz https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz
mkdir "$BASE/ffmpeg"
tar -xJf ffmpeg.tar.xz --strip-components=1 -C "$BASE/ffmpeg"
ln -s "$BASE/ffmpeg/bin/ffmpeg" "$BASE/bin/ffmpeg"
ln -s "$BASE/ffmpeg/bin/ffprobe" "$BASE/bin/ffprobe"
ffmpeg -hide_banner -decoders 2>/dev/null > decoders.txt
ffmpeg -hide_banner -protocols 2>/dev/null > protocols.txt
ffmpeg -hide_banner -encoders 2>/dev/null > encoders.txt
ffmpeg -hide_banner -filters 2>/dev/null > filters.txt
grep -q libaribcaption decoders.txt
grep -q '^ *srt$' protocols.txt
grep -q libx264 encoders.txt
grep -q libx265 encoders.txt
grep -q drawtext filters.txt
echo '[4/7] Preparando banco de dados exclusivo para o teste…'
systemctl enable --now postgresql
DB_PASS=$(openssl rand -hex 24)
if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='server_dtv'" | grep -q 1; then
  echo 'Já existe o usuário PostgreSQL server_dtv. Instalação interrompida para preservar o banco existente.'; exit 1
fi
if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='server_dtv'" | grep -q 1; then
  echo 'Já existe o banco server_dtv. Instalação interrompida para preservar os dados.'; exit 1
fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE ROLE server_dtv LOGIN PASSWORD '$DB_PASS';"
runuser -u postgres -- createdb --owner=server_dtv server_dtv
cat > /etc/server-dtv/server-dtv.env <<EOF
DATABASE_URL=postgresql://server_dtv:$DB_PASS@127.0.0.1:5432/server_dtv
PORT=8090
HOST=0.0.0.0
NODE_ENV=production
WEB_ROOT=$BASE/app/artifacts/classind/dist/public
EOF
chmod 600 /etc/server-dtv/server-dtv.env
echo '[5/7] Instalando e compilando o sistema…'
tar -xzf "$PACKAGE_DIR/source.tar.gz" -C "$BASE/app"
ln -s "$STATE" "$BASE/app/.runtime"
chown -R server-dtv:server-dtv "$BASE/app" "$BASE/tools" "$STATE"
export DATABASE_URL="postgresql://server_dtv:$DB_PASS@127.0.0.1:5432/server_dtv"
runuser -u server-dtv -- env PATH="$PATH" DATABASE_URL="$DATABASE_URL" bash -ec "cd '$BASE/app'; pnpm install --frozen-lockfile; pnpm --filter @workspace/db push-force; pnpm --filter @workspace/api-server run build; pnpm --filter @workspace/classind run build"
echo '[6/7] Configurando inicialização automática e acesso web…'
cat > /etc/systemd/system/server-dtv.service <<EOF
[Unit]
Description=SERVER DTV+ CENSURA PRO
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service
[Service]
Type=simple
User=server-dtv
Group=server-dtv
WorkingDirectory=$BASE/app
EnvironmentFile=/etc/server-dtv/server-dtv.env
Environment=PATH=$BASE/bin:$BASE/node/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$BASE/node/bin/node --enable-source-maps $BASE/app/artifacts/api-server/dist/index.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
UMask=0027
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now server-dtv
echo '[7/7] Verificando serviço…'
for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:8090/api/healthz >/dev/null; then
    echo 'Instalação concluída.'
    echo 'Abra: http://localhost:8090/monitor'
    echo 'Em outro computador: http://IP_DO_UBUNTU:8090/monitor'
    echo "Gravações: $STATE/gravacoes | Relatórios: $STATE/relatorios"
    echo 'Logs: sudo journalctl -u server-dtv -f'
    exit 0
  fi
  sleep 1
done
echo 'O serviço não respondeu. Execute: sudo journalctl -u server-dtv -n 80'; exit 1
