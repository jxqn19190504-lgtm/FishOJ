#!/usr/bin/env bash
# 旧机全量导出：Mongo + /root/.hydro + 全部密钥（环境变量 / env 文件 / PM2 / config.json）
# 用法：bash -lc 'bash /root/01-export-old.sh'
# 产物：/root/fishoj-migrate/  （含 secrets.env，随包拷到新机；不要 git add）
set -euo pipefail

HYDRO_HOME="${HYDRO_HOME:-/root/.hydro}"
OUT="${OUT:-/root/fishoj-migrate}"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEY_NAME_RE='^(DEEPSEEK_API_KEY|BUILTIN_API_KEY|FISHOJ_AI_API_KEY|OPENAI_API_KEY|FISHOJ_AI_BASE_URL|FISHOJ_AI_MODEL|MONGO_URI|MONGODB_URI)=|'
KEY_NAME_RE+='(_KEY|_TOKEN|_SECRET|_PASSWORD|_PASS)='

need() { command -v "$1" >/dev/null || { echo "缺少命令: $1（请用 bash -lc，并确认 Hydro/Nix 已加载）" >&2; exit 1; }; }

need python3
need tar
if ! command -v mongodump >/dev/null; then
  echo "缺少 mongodump。可尝试: nix-env -iA nixpkgs.mongodb-tools 或使用 Hydro 自带 mongo 工具链。" >&2
  exit 1
fi

mkdir -p "$OUT/mongo" "$OUT/secrets"
chmod 700 "$OUT" "$OUT/secrets"

echo "[1/6] 写 inventory"
if [[ -f "$(dirname "$0")/00-inventory.sh" ]]; then
  bash "$(dirname "$0")/00-inventory.sh" > "$OUT/inventory.txt" 2>&1 || true
else
  {
    date -Is
    pm2 list || true
    df -h
  } > "$OUT/inventory.txt"
fi

echo "[2/6] 解析 Mongo URI 并 mongodump（库内含小助手 Key 等 system 设置）"
if [[ ! -f "$HYDRO_HOME/config.json" ]]; then
  echo "找不到 $HYDRO_HOME/config.json" >&2
  exit 1
fi
cp -a "$HYDRO_HOME/config.json" "$OUT/secrets/config.json"
chmod 600 "$OUT/secrets/config.json"
URI="$(HYDRO_HOME="$HYDRO_HOME" python3 -c 'import json,os; p=os.environ["HYDRO_HOME"]+"/config.json"; print(json.load(open(p,encoding="utf-8")).get("uri",""))')"
if [[ -z "$URI" ]]; then
  echo "config.json 没有 uri" >&2
  exit 1
fi
mongodump --uri="$URI" --out="$OUT/mongo"
echo "mongodump 完成"

echo "[3/6] 打包 $HYDRO_HOME（排除 node_modules、日志、缓存；config.json 内含库密码）"
tar -C "$(dirname "$HYDRO_HOME")" -czf "$OUT/hydro-home.tar.gz" \
  --exclude='.hydro/node_modules' \
  --exclude='**/node_modules' \
  --exclude='.hydro/**/*.log' \
  --exclude='.hydro/static/.cache' \
  "$(basename "$HYDRO_HOME")"
echo "hydro-home.tar.gz: $(du -h "$OUT/hydro-home.tar.gz" | awk '{print $1}')"

echo "[4/6] 收集全部密钥 → secrets.env + secrets/"
SECRETS="$OUT/secrets.env"
: > "$SECRETS"
chmod 600 "$SECRETS"

append_kv_file() {
  local src="$1"
  [[ -f "$src" && -r "$src" ]] || return 0
  echo "# from $src" >> "$SECRETS"
  # 去掉注释空行，保留 KEY=VALUE
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$src" >> "$SECRETS" || true
  cp -a "$src" "$OUT/secrets/$(echo "$src" | sed 's#^/##; s#/#_#g')" 2>/dev/null || true
}

# 磁盘上的 env 文件
append_kv_file "$HYDRO_HOME/fishoj.env"
append_kv_file "$HYDRO_HOME/.env"
append_kv_file /root/.env
append_kv_file /root/.hydro/.env
if [[ -f /etc/environment ]]; then
  echo "# from /etc/environment" >> "$SECRETS"
  grep -E '^(DEEPSEEK_API_KEY|BUILTIN_API_KEY|FISHOJ_AI_API_KEY|OPENAI_API_KEY|FISHOJ_AI_BASE_URL|FISHOJ_AI_MODEL)=' /etc/environment >> "$SECRETS" || true
fi

# hydrooj / mongodb 进程环境
dump_proc_env() {
  local name="$1"
  local pid
  pid="$(pgrep -n -f "$name" || true)"
  [[ -n "$pid" && -r "/proc/${pid}/environ" ]] || return 0
  echo "# from /proc/${pid}/environ ($name)" >> "$SECRETS"
  tr '\0' '\n' < "/proc/${pid}/environ" | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' | \
    grep -E 'KEY=|TOKEN=|SECRET=|PASSWORD=|PASS=|URI=|MONGO' >> "$SECRETS" || true
}
dump_proc_env '[h]ydrooj'
dump_proc_env '[m]ongod'

# PM2 完整列表（可能含 env），权限收紧
if command -v pm2 >/dev/null; then
  pm2 prettylist > "$OUT/secrets/pm2-prettylist.json" 2>/dev/null || true
  chmod 600 "$OUT/secrets/pm2-prettylist.json" 2>/dev/null || true
fi

# 去重：后写覆盖先写，保留最后一次出现的 KEY=
python3 - <<PY
from pathlib import Path
p = Path("$SECRETS")
lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
order = []
kv = {}
comments = []
header = []
for line in lines:
    s = line.strip()
    if not s:
        continue
    if s.startswith("#"):
        header.append(line)
        continue
    if "=" not in s:
        continue
    k, _, v = s.partition("=")
    k = k.strip()
    if k not in kv:
        order.append(k)
    kv[k] = v
out = ["# FishOJ 全量密钥  $STAMP  随迁移包带走，勿 git add", ""]
out.extend(header[:20])
for k in order:
    val = kv[k]
    if val != "":
        out.append(f"{k}={val}")
p.write_text("\n".join(out) + "\n", encoding="utf-8")
PY
chmod 600 "$SECRETS"

# 至少要有一类 LLM Key（config.json 库密码始终在 secrets/ 与 tar 里）
PARTIAL=0
if ! grep -qE '^(DEEPSEEK_API_KEY|BUILTIN_API_KEY|FISHOJ_AI_API_KEY|OPENAI_API_KEY)=.+' "$SECRETS"; then
  echo "警告: 进程/env 里没抓到 LLM API Key。Mongo 里的小助手 Key、config.json 库密码仍会随包移动。" >&2
  PARTIAL=1
fi

FULL="$OUT/fishoj-full-migrate-${STAMP}.tar.gz"
{
  echo "stamp=$STAMP"
  echo "host=$(hostname)"
  echo "hydro_home=$HYDRO_HOME"
  echo "full_archive=$FULL"
  echo "secrets=$SECRETS"
  echo "KEYS_PARTIAL=$PARTIAL"
  echo "secret_keys=$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$SECRETS" | cut -d= -f1 | tr '\n' ' ')"
} > "$OUT/MANIFEST.txt"

echo "[5/6] 打成一份全量包（数据 + 密钥）"
tar -C "$OUT" -czf "$FULL" \
  mongo hydro-home.tar.gz secrets.env secrets inventory.txt MANIFEST.txt
chmod 600 "$FULL"
echo "全量包: $FULL ($(du -h "$FULL" | awk '{print $1}'))"

echo "[6/6] 体积"
du -sh "$OUT" "$OUT/mongo" "$OUT/hydro-home.tar.gz" "$SECRETS" "$FULL"
echo
echo "导出完成（含密钥）。请把整个 $OUT 或 $FULL 拷到新机/离线盘。"
echo "公开 GitHub 仓库已开 secret scanning，不要 git add secrets.env / fishoj-full-migrate-*.tar.gz。"
