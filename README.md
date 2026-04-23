# Summarize AI Assistant

Hệ thống AI tự động thu thập tin nhắn từ Telegram (group, chat cá nhân), tóm tắt bằng AI, và gửi kết quả về Telegram Bot.

## Kiến trúc

```
Telegram Groups/Chats
      │
      │ (GramJS - user account)
      ▼
NestJS Server ──▶ PostgreSQL
      │               │
      │           RawMessage
      │               │
      │       CronJob (mỗi phút)
      │           groupIdleMessages()
      │               │ debounce ≥ 120s
      │               ▼
      │         MessageDigest
      │         (status: "grouped")
      │               │
      │    on-demand / cron schedule
      │        DigestService.summarize()
      │               │
      │        ┌──────▼──────┐
      │        │  OpenAI LLM │
      │        │ (gpt-4o-mini)│
      │        └──────┬──────┘
      │               │ AI Summary + Entities
      │               ▼
      └──────▶ Telegram Bot (Telegraf)
                      │
          ┌───────────┴───────────┐
          │                       │
   Auto notify               On-demand
   (BROKER_CHAT_ID)       (/summarize, /ask)
   cron 12:00 & 18:00     + group @mention
```

### Pipeline tóm tắt (2 bước)

| Bước | Service | Mô tả |
|------|---------|--------|
| 1. Group | `DigestService.groupIdleMessages()` | Gom tin nhắn thô theo source, chờ debounce ≥ 120s rồi tạo `MessageDigest` (status: `grouped`) |
| 2. Summarize | `DigestService.summarize()` | Ghép các digest + raw message trong khoảng thời gian → gọi OpenAI → trả về summary |

## Tech Stack

- **Backend:** NestJS + TypeScript (strict mode)
- **Database:** PostgreSQL + Prisma ORM
- **AI:** OpenAI SDK (gpt-4o-mini hoặc tuỳ chỉnh qua `OPENAI_MODEL`)
- **Telegram Listener:** GramJS (`telegram` package) — đăng nhập bằng user account
- **Telegram Bot:** Telegraf — nhận lệnh từ người dùng, gửi thông báo tự động
- **API Docs:** Swagger UI tại `/api/docs`
- **Scheduler:** `@nestjs/schedule` (Cron jobs)

## Cài đặt

```bash
# 1. Clone & install
npm install

# 2. Copy và cấu hình .env
cp .env.example .env
# Sửa file .env với các thông tin của bạn

# 3. Khởi tạo database
npx prisma migrate dev --name init

# 4. Chạy ứng dụng
npm run start:dev
```

## Cấu hình (.env)

| Biến | Mô tả |
|------|--------|
| `DATABASE_URL` | Connection string PostgreSQL |
| `OPENAI_API_KEY` | API key của OpenAI |
| `OPENAI_MODEL` | Model AI (mặc định: `gpt-4o-mini`) |
| `TELEGRAM_BOT_TOKEN` | Token bot từ @BotFather |
| `TELEGRAM_API_ID` | API ID từ https://my.telegram.org/apps |
| `TELEGRAM_API_HASH` | API Hash từ https://my.telegram.org/apps |
| `TELEGRAM_SESSION` | Session string (tự sinh sau lần login đầu) |
| `BROKER_CHAT_ID` | Chat ID nhận thông báo tóm tắt tự động |

## API Endpoints

### Sources — Quản lý nguồn lắng nghe
- `POST /api/sources` — Thêm group/chat mới
- `GET /api/sources` — Liệt kê tất cả nguồn
- `GET /api/sources/:id` — Chi tiết một nguồn
- `PATCH /api/sources/:id` — Cập nhật (bật/tắt, đổi tên)
- `DELETE /api/sources/:id` — Xóa nguồn

### Messages — Tin nhắn thô
- `GET /api/messages` — Liệt kê tin nhắn (filter: sourceId, undigested)
- `GET /api/messages/stats` — Thống kê tổng quan

### Digests — Tóm tắt
- `POST /api/digests/summarize` — Kích hoạt tóm tắt on-demand
- `GET /api/digests` — Liệt kê bản tóm tắt
- `GET /api/digests/:id` — Chi tiết bản tóm tắt + tin nhắn gốc

### Telegram — Trạng thái & tiện ích
- `GET /api/telegram/status` — Kiểm tra kết nối bot & listener
- `GET /api/telegram/dialogs` — Liệt kê các hội thoại (để lấy externalId)
- `POST /api/telegram/register-commands` — Đăng ký lại lệnh bot với Telegram

### Cron — Kích hoạt thủ công
- `POST /api/cron/morning` — Chạy tóm tắt phiên sáng (00:00–12:00)
- `POST /api/cron/afternoon` — Chạy tóm tắt phiên chiều (12:00–18:00)

## Telegram Bot Commands

| Lệnh | Mô tả |
|-------|--------|
| `/start` | Hiển thị menu lệnh |
| `/sources` | Xem danh sách nguồn đang theo dõi |
| `/summarize` | Tóm tắt — chọn khoảng thời gian → chọn source |
| `/stats` | Thống kê hệ thống (messages, digests, sources) |
| `/ask <câu hỏi>` | Hỏi AI về nội dung đã thu thập |

### Flow `/summarize` (3 bước)

```
/summarize
    ↓
[Chọn khoảng thời gian]
  2h  |  4h  |  8h  | 24h
  5d  |  7d  | 15d  | 30d
    ↓
[Chọn Source]
  Group A | Group B | 📡 All Sources
    ↓
⏳ Loading animation...
    ↓
🟢 <SourceName> (last Xh/d)
<AI Summary>
```

### Hành vi trong Group Chat

| Tình huống | Phản hồi |
|------------|----------|
| `@bot` (chỉ mention, không hỏi) | Hiển thị danh sách lệnh |
| `@bot <câu hỏi>` | AI trả lời dựa trên dữ liệu đã thu thập |
| Tin nhắn thường (không mention) | Bỏ qua |

Trong private chat, mọi tin nhắn đều được AI trả lời (không cần mention).

### Ngôn ngữ trả lời
- Phát hiện ngôn ngữ của câu hỏi → trả lời cùng ngôn ngữ
- Nếu không xác định được → dùng ngôn ngữ của dữ liệu tóm tắt

## Cronjob tự động

| Thời điểm | Phiên | Phạm vi |
|-----------|-------|---------|
| **12:00 trưa** | Sáng | 00:00 → 12:00 |
| **18:00 chiều** | Chiều | 12:00 → 18:00 |

Sau mỗi phiên, kết quả tóm tắt tự động gửi tới `BROKER_CHAT_ID` qua Telegram Bot.

## Hướng dẫn setup Telegram

### 1. Tạo Bot (nhận thông báo)
1. Chat với [@BotFather](https://t.me/BotFather) trên Telegram
2. Gửi `/newbot`, đặt tên và username
3. Copy token vào `TELEGRAM_BOT_TOKEN`

### 2. Lấy API credentials (đọc tin nhắn)
1. Truy cập https://my.telegram.org/apps
2. Đăng nhập và tạo application
3. Copy `api_id` → `TELEGRAM_API_ID` và `api_hash` → `TELEGRAM_API_HASH`

### 3. Login lần đầu
1. Chạy `npm run start:dev`
2. Nhập số điện thoại khi được hỏi
3. Nhập mã OTP
4. Copy session string được in ra → paste vào `TELEGRAM_SESSION` trong `.env`
5. Restart server — lần sau không cần login lại

### 4. Lấy Chat ID của Broker (nhận thông báo)
1. Thêm bot vào group hoặc chat với bot
2. Truy cập `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Tìm `chat.id` trong response → paste vào `BROKER_CHAT_ID`

### 5. Cấu hình lắng nghe chat
1. Mở Swagger UI: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
2. Chạy `GET /api/telegram/dialogs` — trả về tối đa 50 hội thoại gần nhất
3. Lấy `id` của đoạn chat cần theo dõi
4. Chạy `POST /api/sources`:
```json
{
  "name": "Tên đoạn chat",
  "platform": "telegram",
  "externalId": "-10012345678",
  "isActive": true
}
```

## Cấu trúc Project

```
src/
├── ai/              # AiService — OpenAI wrapper (summarize + Q&A)
├── cron/            # CronService — Lịch tóm tắt tự động (12:00, 18:00)
│                    # CronController — Endpoint kích hoạt thủ công
├── digest/          # DigestService — groupIdleMessages + summarize
│                    # DigestController — REST API tóm tắt
├── message/         # MessageModule — Xem tin nhắn thô
├── prisma/          # PrismaService — Kết nối database
├── source/          # SourceModule — CRUD nguồn lắng nghe
├── telegram/        # TelegramBotService — Telegraf bot + commands
│                    # TelegramListenerService — GramJS listener
│                    # TelegramController — Status, dialogs, register-commands
├── app.module.ts
└── main.ts          # Bootstrap + Swagger setup
```
