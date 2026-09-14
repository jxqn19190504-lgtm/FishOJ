# 换机脚本

完整步骤见仓库 [`docs/换机迁移.md`](../../docs/换机迁移.md)。

在 **Linux 旧机/新机**上执行（Windows 请 `scp` 上去，不要在 PowerShell 里跑）：

| 脚本 | 作用 |
|------|------|
| `00-inventory.sh` | 旧机只读盘点 |
| `01-export-old.sh` | 导出 Mongo + `.hydro` + `secrets.env` |
| `02-import-new.sh` | 新机恢复（先官方 `setup.sh`） |

导出**必须含密钥**：`secrets.env`（进程 + env 文件 + PM2）以及 `config.json` 里的 Mongo 密码。最终会打成 `fishoj-full-migrate-*.tar.gz` 一份搬走。

真实 Key **不要** `git add`：仓库是公开的，且开了 GitHub secret scanning，push 会被拒。用 scp 把全量包拷到新机即可。

若从 Windows 拷过去后 `bash` 报 `$'\r'`，先执行：`sed -i 's/\r$//' /root/*.sh`
