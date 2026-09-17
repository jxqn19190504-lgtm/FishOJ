#!/usr/bin/env bash
# 新机全量导入（数据 + 密钥）。请先用 hydro.ac/setup.sh 装好核心，并确认 pm2 list 正常。
# 用法：bash -lc 'bash /root/02-import-new.sh /root/fishoj-migrate'
set -euo pipefail

DUMP="${1:-/root/fishoj-migrate}"
HYDRO_HOME="${HYDRO_HOME:-/root/.hydro}"

need() { command -v "$1" >/dev/null || { echo "缺少命令: $1（请 bash -lc）" >&2; exit 1; }; }

need python3
need tar
need mongorestore
need hydrooj
need pm2

# 若只拷了全量 tar，先解开
if [[ -d "$DUMP" ]] && [[ ! -d "$DUMP/mongo" ]]; then
  full="$(ls -1 "$DUMP"/fishoj-full-migrate-*.tar.gz 2>/dev/null | tail -n 1 || true)"
  if [[ -n "$full" ]]; then
    echo "发现全量包 $full，解到 $DUMP"
    tar -C "$DUMP" -xzf "$full"
  fi
fi

if [[ ! -d "$DUMP/mongo" ]]; then
  echo "找不到 $DUMP/mongo （mongodump 目录）" >&2
  exit 1
fi
if [[ ! -f "$DUMP/hydro-home.tar.gz" ]]; then
  echo "找不到 $DUMP/hydro-home.tar.gz" >&2
  exit 1
fi
if [[ ! -f "$DUMP/secrets.env" ]]; then
  echo "找不到 $DUMP/secrets.env。换机必须带走密钥，请用 01-export-old.sh 重新导出。" >&2
  exit 1
fi
if ! grep -qE '^[A-Za-z_][A-Za-z0-9_]*=' "$DUMP/secrets.env"; then
  echo "secrets.env 没有 KEY= 行，中止。" >&2
  exit 1
fi

echo "[1/6] 停止 hydrooj（保留 mongodb）"
pm2 stop hydrooj || true
sleep 2

echo "[2/6] 解开 .hydro（先备份新机空配置）"
BACKUP="/root/hydro-home-before-import-$(date +%Y%m%d-%H%M%S).tar.gz"
if [[ -d "$HYDRO_HOME" ]]; then
  tar -C /root -czf "$BACKUP" .hydro || true
  echo "已备份新机原 .hydro → $BACKUP"
fi
tar -C /root -xzf "$DUMP/hydro-home.tar.gz"
echo "已解开 hydro-home.tar.gz"

URI="$(python3 -c 'import json; print(json.load(open("/root/.hydro/config.json",encoding="utf-8")).get("uri",""))')"
if [[ -z "$URI" ]]; then
  echo "解开后仍无 uri（库密码应在 config.json 内）" >&2
  exit 1
fi

echo "[3/6] 恢复 Mongo（含 system 里的小助手 API Key）"
mongorestore --uri="$URI" --drop "$DUMP/mongo"
echo "mongorestore 完成"

echo "[4/6] 写入全部密钥（fishoj.env + /etc/environment + 登录 shell）"
install -m 600 "$DUMP/secrets.env" "$HYDRO_HOME/fishoj.env"

MARKER="# fishoj.env"
for rc in /root/.profile /root/.bashrc; do
  if [[ -f "$rc" ]] && ! grep -q "$HYDRO_HOME/fishoj.env" "$rc" 2>/dev/null; then
    cat >> "$rc" <<EOF

$MARKER
[ -f $HYDRO_HOME/fishoj.env ] && set -a && . $HYDRO_HOME/fishoj.env && set +a
EOF
  fi
done

touch /etc/environment
while IFS= read -r line; do
  [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
  key="${line%%=*}"
  if grep -q "^${key}=" /etc/environment 2>/dev/null; then
    grep -v "^${key}=" /etc/environment > /etc/environment.fishoj.tmp
    mv /etc/environment.fishoj.tmp /etc/environment
  fi
  echo "$line" >> /etc/environment
done < "$HYDRO_HOME/fishoj.env"

echo "[5/6] 按绝对路径注册插件"
if [[ -f "$HYDRO_HOME/addon.json" ]]; then
  python3 - <<'PY'
import json
from pathlib import Path
raw = json.loads(Path("/root/.hydro/addon.json").read_text(encoding="utf-8"))
for item in raw:
    if isinstance(item, str) and item.startswith("/"):
        print(item)
PY
fi | while read -r p; do
  if [[ -d "$p" ]]; then
    echo "addon add $p"
    hydrooj addon add "$p" || true
  else
    echo "跳过（目录不存在）: $p"
  fi
done

echo "[6/6] 带密钥重启 PM2"
set -a
# shellcheck disable=SC1091
. "$HYDRO_HOME/fishoj.env"
set +a
pm2 restart hydrooj --update-env || pm2 restart hydrooj
pm2 restart caddy || true
pm2 save || true

echo
echo "导入完成（数据 + 密钥）。请立刻："
echo "  1) pm2 list"
echo "  2) tr '\\0' '\\n' < /proc/\$(pgrep -n -f hydrooj)/environ | grep -E 'KEY|TOKEN'"
echo "  3) 浏览器打开 http://本机公网IP ，测登录 + 提交 + AI 助教/分析"
echo "若 Caddy SSE 一两分钟断开，用仓库 server-config/Caddyfile 覆盖后再 caddy reload。"
