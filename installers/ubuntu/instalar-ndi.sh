#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Execute com sudo.'; exit 1; }
[[ $(uname -m) == x86_64 ]] || { echo 'Requer Ubuntu/Linux x86_64.'; exit 1; }
SDK_ARCHIVE=${1:-}
[[ -f $SDK_ARCHIVE ]] || { echo 'Uso: sudo bash instalar-ndi.sh /caminho/Install_NDI_SDK_v6_Linux.tar.gz'; exit 1; }
SDK_ARCHIVE=$(realpath -- "$SDK_ARCHIVE")
[[ -f /etc/server-dtv/server-dtv.env ]] || { echo 'Instale o sistema SERVER DTV antes do SDK.'; exit 1; }
[[ -f /opt/server-dtv/app/scripts/ndi-receiver.py ]] || { echo 'Atualize o aplicativo para a versão com receptor NDI antes de executar este instalador.'; exit 1; }
WORK_DIR=$(mktemp -d)
trap 'rm -rf -- "$WORK_DIR"' EXIT
tar -xzf "$SDK_ARCHIVE" -C "$WORK_DIR" Install_NDI_SDK_v6_Linux.sh
cd "$WORK_DIR"
# The official SDK installer presents its license and asks the operator to accept it.
bash ./Install_NDI_SDK_v6_Linux.sh
SDK_LIBRARY="$WORK_DIR/NDI SDK for Linux/lib/x86_64-linux-gnu"
[[ -d $SDK_LIBRARY ]] || { echo 'SDK x86_64 não encontrado.'; exit 1; }
install -d -m 755 /opt/server-dtv/ndi/lib/x86_64-linux-gnu
cp -a "$SDK_LIBRARY"/libndi.so* /opt/server-dtv/ndi/lib/x86_64-linux-gnu/
LIBRARY=$(find /opt/server-dtv/ndi/lib/x86_64-linux-gnu -type f -name 'libndi.so.6.*' | sort -V | tail -1)
[[ -n $LIBRARY ]] || { echo 'Biblioteca NDI 6 não encontrada.'; exit 1; }
ln -sfn "$(basename "$LIBRARY")" /opt/server-dtv/ndi/lib/x86_64-linux-gnu/libndi.so.6
chmod -R a+rX /opt/server-dtv/ndi
apt-get update
apt-get install -y python3 libavahi-client3
sed -i '/^NDI_LIBRARY_PATH=/d; /^NDI_PYTHON=/d' /etc/server-dtv/server-dtv.env
printf '\nNDI_LIBRARY_PATH=/opt/server-dtv/ndi/lib/x86_64-linux-gnu/libndi.so.6\nNDI_PYTHON=/usr/bin/python3\n' >> /etc/server-dtv/server-dtv.env
runuser -u server-dtv -- /usr/bin/python3 /opt/server-dtv/app/scripts/ndi-receiver.py --library /opt/server-dtv/ndi/lib/x86_64-linux-gnu/libndi.so.6 --list
systemctl restart server-dtv
echo 'SDK NDI configurado. Em Entradas > NDI > SDK NDI nativo, clique em Localizar fontes NDI.'
