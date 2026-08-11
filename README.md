# FishOJ — 基于 Hydro 的在线评测系统

> 教学驱动 · 面向少儿编程培训班的 Online Judge 系统

## 📖 项目简介

FishOJ 是基于开源项目 [Hydro](https://hydro.js.org/) 二次开发的在线评测系统（Online Judge）。
本项目是作者的**深度学习项目**：以真实项目为载体，系统性地补齐网站搭建、服务器运营、前后端架构、Docker 容器、网络安全等基础知识，并最终服务于校外少儿编程培训班的教学与练习场景。

## 🏗️ 技术栈

| 层次 | 技术 |
|------|------|
| 评测系统 | Hydro 5.0.4（Node.js + TypeScript + **React 19**） |
| 前端 UI | @hydrooj/ui-default 4.58.4（React + Mantine，`packages/ui-default`） |
| 数据库 | MongoDB 7.0（PM2 管理） |
| 判题环境 | Nix 包管理器 + hydro-sandbox 沙箱 |
| Web 服务 | Caddy 反向代理（:80 → 127.0.0.1:8888） |
| 进程管理 | PM2（4 进程：hydrooj / mongodb / hydro-sandbox / caddy） |
| 服务器 | 阿里云 ECS · Ubuntu 22.04 · 4C8G |
| 运维面板 | 1Panel（Docker 管理 / 文件 / 监控） |

## 🌐 访问地址

| 服务 | 地址 |
|------|------|
| Hydro OJ（主站） | `http://8.163.87.247` |
| 1Panel 面板 | 见本地档案（含安全入口） |
| SSH | `ssh root@8.163.87.247`（密钥登录，私钥见本地档案） |

> ⚠️ **注意**：阿里云普通公网 IP 在实例停止/重启后可能变更，如无法访问请到控制台核对最新 IP。

## 🗂️ 仓库结构

```
├── README.md          # 本文件（项目交接文档）
├── DEPLOY.md          # 部署手册（完整安装步骤与踩坑记录）
├── docs/              # 学习笔记 / 架构文档
└── 题库/              # Hydro 格式题包（BZOJ / 一本通 / 深入浅出）
```

## 🔑 常用运维命令

```bash
pm2 list                        # 查看 Hydro 全部进程状态
pm2 restart hydrooj             # 重启主程序（改配置后）
pm2 logs                        # 查看日志（排查问题）
hydrooj cli user setSuperAdmin <uid>   # 设置超级管理员
```

## 🗺️ 项目路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| 一、部署上线 | 服务器 / SSH / Docker / Hydro / 题库 / 公网访问 | ✅ 已完成（PM2 部署） |
| 二、原理深挖 | Docker 原理、网络/DNS/端口、MongoDB、Hydro 前后端架构 | ⏳ 进行中 |
| 三、二次开发 | Hydro 插件开发、主题定制、评测沙箱原理 | 📅 规划中 |
| 四、运营落地 | 少儿培训班场景：域名备案、用户管理、监控备份 | 📅 规划中 |

## 📦 关键决策记录

- **部署方式**：当前阿里云试用机用官方脚本（PM2 + Nix）部署；**京东云正式环境改用 Docker 部署**（环境一致性、迁移/升级/回滚更优）。
- **不使用第三方 fork**（如 Hydro4LVJ，停更于 2024-01），直接使用官方 hydro-dev/Hydro。
- **合规**：中国大陆服务器绑域名需 ICP 备案；正式运营前需绑定弹性 IP 或购买域名，避免 IP 变更导致服务不可达。

## 🛠️ 交接指南（新环境快速部署）

1. SSH 连接服务器（密钥登录）
2. 运行 Hydro 官方安装脚本：`LANG=zh . <(curl https://hydro.ac/setup.sh)`
3. 配置安全组放行端口（80 / 22）
4. 注册第一个用户 → `hydrooj cli user setSuperAdmin <uid>` 设为管理员
5. 导入 `题库/` 下的题包
6. 参考 `DEPLOY.md` 中记录的踩坑点

## ⚠️ 安全红线

以下内容**严禁**提交到本仓库（已通过 `.gitignore` 排除）：
- SSH 私钥（`*.pem`、`*.key`）
- 数据库密码、面板密码等敏感配置
- `.workbuddy/` 项目内部记忆目录
