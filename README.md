# moontv-tg-tools

MoonTV Plus 的 Telegram 资源频道聚合工具（Cloudflare Worker 实现）。

给自建影视站加一个「TG 频道资源搜索」：把公开频道的消息（正文、磁力、网盘链接）抓下来，带一个网页管理台增删频道、检测可抓性、关键词搜索。

## 能力

- **频道管理台**：增删频道、一键检测「这个频道能不能抓」、口令自动带出（`/admin?token=xxx`）
- **抓取**：`t.me/s/<channel>` 网页预览，支持频道内搜索 `?q=` 和翻页 `?before=`
- **解析**：自动识别磁力（`magnet:?xt=urn:btih:`）与网盘链接（夸克 / 百度 / 阿里 / 115 / 123 / 迅雷 / 移动）
- **存储**：频道列表存 Workers KV
- **可选 MTProto 后端**：填一个 Telethon 服务的地址后，管理台搜索会合并它的结果，用来读「关闭了网页预览」的频道

## 限制

- 只能读**公开且有网页预览**的频道。频道主关掉预览后 `t.me/s/` 只剩一句 `View @xxx`，轻量版读不到（管理台会把这个频道标成「预览关闭」）
- 只覆盖频道最近的消息（翻页最多 5 页），不是全量搜索
- 不处理私有频道、不下载 Telegram 文件

## 部署

```bash
npm i -g wrangler
wrangler kv namespace create moontv_tg_channels   # 拿到 namespace id
wrangler deploy
```

`wrangler.toml` 示例：

```toml
name = "mtv-tg"
main = "worker.js"
compatibility_date = "2024-09-23"

[[kv_namespaces]]
binding = "TG_KV"
id = "<你的 namespace id>"

[vars]
# 管理口令，也可以改成 wrangler secret put TG_ADMIN_TOKEN
TG_ADMIN_TOKEN = "换成你自己的口令"
```

> 部署后把 `TG_ADMIN_TOKEN` 当成管理口令使用，页面顶部输入它即可。

## 接口

所有管理接口需要 `X-Token` 头（或 `?token=`）等于 `TG_ADMIN_TOKEN`。

| 接口 | 说明 |
|---|---|
| `GET /admin?token=xxx` | 管理台页面 |
| `GET /api/channels` | 频道列表 |
| `POST /api/channels` | `{"add":["@a"]}` / `{"remove":["a"]}` / `{"set":["a","b"]}` |
| `GET /api/probe?channel=@a` | 检测可抓性，返回 `{ok, count, reason}` |
| `GET /api/search?q=&pages=2` | 搜索（`pages` 1–5，`only` 限定单频道） |
| `GET /api/settings` | 读 MTProto 后端配置 |
| `POST /api/settings` | `{"apiBase":"https://...","apiTok":"..."}` |
| `GET /health` | 存活检查 |

## 可选：MTProto 后端

预览关闭的频道需要 MTProto。在能连 Telegram 的机器（PC / NAS / 小服务器，手机上可用 Termux）上跑一个 Telethon 服务，暴露 `/health`、`/channel`、`/search` 三个接口，然后在管理台「MTProto 后端」卡片里填它的地址即可，搜索时结果会合并（`via: mtproto`）。

## 注意

抓取的是公开频道里的分享内容，版权与合规风险自行判断，别把不明来路的资源站直接接到公开站点上。
