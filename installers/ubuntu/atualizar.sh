#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Execute: sudo bash atualizar.sh'; exit 1; }
PACKAGE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BASE=/opt/server-dtv
STATE=/var/lib/server-dtv
[[ -d "$BASE/app" && ! -L "$BASE/app" && -f /etc/server-dtv/server-dtv.env ]] || { echo 'Instalação existente não encontrada.'; exit 1; }
[[ -f "$PACKAGE_DIR/source.tar.gz" && -f "$PACKAGE_DIR/source.tar.gz.sha256" ]] || { echo 'Pacote de atualização incompleto.'; exit 1; }
cd "$PACKAGE_DIR"
sha256sum -c source.tar.gz.sha256
STAMP=$(date +%Y%m%d-%H%M%S)-$$
STAGE="$BASE/app-update-$STAMP"
BACKUP="$BASE/backups/app-$STAMP"
SWITCHED=0
STOPPED=0
export PATH="$BASE/bin:$BASE/node/bin:$BASE/tools/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

rollback() {
  trap - ERR
  echo 'A atualização falhou.' >&2
  if [[ $SWITCHED == 1 ]]; then
    systemctl stop server-dtv || true
    mv -- "$BASE/app" "$BASE/backups/app-failed-$STAMP"
    mv -- "$BACKUP" "$BASE/app"
    echo 'Código anterior restaurado.' >&2
  fi
  if [[ $STOPPED == 1 ]]; then systemctl start server-dtv || true; fi
  echo 'Banco, configuração e gravações foram preservados. Consulte: sudo journalctl -u server-dtv -n 80' >&2
  exit 1
}
trap rollback ERR

echo '[1/4] Preparando atualização sem interromper a gravação…'
install -d -m 755 "$STAGE" "$BASE/backups"
# The archive is source-only; persistent state stays outside this directory.
python3 - "$PACKAGE_DIR/source.tar.gz" "$STAGE" <<'PY'
import sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    for member in archive.getmembers():
        parts = member.name.split('/')
        if member.name.startswith('/') or '..' in parts or parts[0] in ('.runtime', '.git', '.env') or member.issym() or member.islnk():
            raise RuntimeError('Entrada inválida no pacote: ' + member.name)
    archive.extractall(sys.argv[2], filter='data')
PY
test -f "$STAGE/package.json"
ln -s "$STATE" "$STAGE/.runtime"
chown -R server-dtv:server-dtv "$STAGE"

echo '[2/4] Instalando dependências e compilando…'
runuser -u server-dtv -- env PATH="$PATH" bash -ec "cd '$STAGE'; pnpm install --frozen-lockfile; pnpm --filter @workspace/api-server run build; pnpm --filter @workspace/classind run build"
test -s "$STAGE/artifacts/api-server/dist/index.mjs"
test -s "$STAGE/artifacts/classind/dist/public/index.html"

echo '[3/4] Aplicando atualização…'
STOPPED=1
systemctl stop server-dtv
if [[ -d "$BASE/app/.runtime/recording-service" && ! -L "$BASE/app/.runtime" ]]; then
  echo 'Preservando o estado de gravação de uma instalação com .runtime local…'
  if [[ -e "$STATE/recording-service" ]]; then
    mv -- "$STATE/recording-service" "$BASE/backups/recording-state-$STAMP"
  fi
  cp -a -- "$BASE/app/.runtime/recording-service" "$STATE/recording-service"
  chown -R server-dtv:server-dtv "$STATE/recording-service"
fi
mv -- "$BASE/app" "$BACKUP"
if ! mv -- "$STAGE" "$BASE/app"; then mv -- "$BACKUP" "$BASE/app"; rollback; fi
SWITCHED=1
systemctl start server-dtv

echo '[4/4] Verificando serviço…'
SERVICE_PORT=$(sed -n 's/^PORT=//p' /etc/server-dtv/server-dtv.env | tail -1)
[[ $SERVICE_PORT =~ ^[0-9]+$ ]]
for attempt in {1..30}; do
  if curl --fail --silent "http://127.0.0.1:$SERVICE_PORT/api/healthz" >/dev/null; then
    trap - ERR
    echo "Atualização concluída: http://localhost:$SERVICE_PORT/monitor"
    echo "Código anterior preservado em $BACKUP"
    echo 'Recarregue o navegador. As novas gravações usarão nome do canal, mês/ano e data/horário do bloco.'
    exit 0
  fi
  sleep 1
done
rollback
