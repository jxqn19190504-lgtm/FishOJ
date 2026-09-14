#!/usr/bin/env bash
# 旧机盘点：只读，不导出数据。建议 bash -lc 执行以加载 nix/pm2。
set -euo pipefail

echo "======== FishOJ inventory $(date -Is) ========"
echo "hostname: $(hostname)"
echo "uname: $(uname -a)"
echo "mem:"
free -h || true
echo "disk:"
df -h / /root /data 2>/dev/null || df -h
echo

echo "---- pm2 ----"
command -v pm2 >/dev/null && pm2 list || echo "pm2 不在 PATH（请 bash -lc）"
echo

echo "---- hydrooj ----"
command -v hydrooj >/dev/null && hydrooj --version || echo "hydrooj 不在 PATH"
echo "HYDRO_HOME=${HYDRO_HOME:-/root/.hydro}"
HYDRO_HOME="${HYDRO_HOME:-/root/.hydro}"
ls -ld "$HYDRO_HOME" 2>/dev/null || echo "缺少 $HYDRO_HOME"
echo

if [[ -f "$HYDRO_HOME/addon.json" ]]; then
  echo "---- addon.json ----"
  cat "$HYDRO_HOME/addon.json"
  echo
fi

if [[ -f "$HYDRO_HOME/config.json" ]]; then
  echo "---- config.json keys (uri 已打码) ----"
  HYDRO_HOME="$HYDRO_HOME" python3 - <<'PY' || true
import json, os, re
from pathlib import Path
p = Path(os.environ.get("HYDRO_HOME", "/root/.hydro")) / "config.json"
data = json.loads(p.read_text(encoding="utf-8"))
uri = str(data.get("uri", ""))
print("uri:", re.sub(r":([^:@/]+)@", r":***@", uri) if uri else "(none)")
for k, v in data.items():
    if k != "uri":
        print(f"{k}: {v!r}"[:200])
PY
fi

echo
echo "---- ~/.hydro 体积 ----"
du -sh "$HYDRO_HOME" 2>/dev/null || true
du -sh "$HYDRO_HOME"/* 2>/dev/null | sort -h | tail -n 30 || true

echo
echo "---- hydrooj 进程环境中的 Key 名（不打印值） ----"
pid="$(pgrep -n -f '[h]ydrooj' || true)"
if [[ -n "${pid}" && -r "/proc/${pid}/environ" ]]; then
  tr '\0' '\n' < "/proc/${pid}/environ" | awk -F= '/KEY|TOKEN|SECRET|URI|MONGO|PASS/ {print $1}'
else
  echo "未找到 hydrooj 进程或无法读 environ"
fi

echo
echo "---- 监听端口 ----"
ss -lntp 2>/dev/null | grep -E ':80|:443|:8888|:27017' || netstat -lntp 2>/dev/null | grep -E ':80|:443|:8888|:27017' || true
echo
echo "盘点结束。"
