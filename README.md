# Oil Broker AI Assistant

Hệ thống AI tự động thu thập tin nhắn từ Telegram (group, chat cá nhân), tóm tắt bằng AI, và gửi kết quả về Telegram Bot cho Broker sử dụng.

## Kiến trúc

```
Telegram Groups/Chats ──(GramJS)──▶ NestJS Server ──▶ PostgreSQL (RawMessage)
                                         │
                                    ┌────▼─────┐
                                    │  AI/LLM  │  (OpenAI gpt-4o-mini)
                                    └────┬─────┘
                                         │
                                    MessageDigest (Summary + Entities)
                                         │
                              ┌──────────▼──────────┐
                              │   Telegram Bot       │
                              │   (Thông báo Broker) │
                              │   (/ask Q&A)         │
                              └──────────────────────┘
```

## Tech Stack

- **Backend:** NestJS + TypeScript (strict mode)
- **Database:** PostgreSQL + Prisma ORM
- **AI:** OpenAI SDK (gpt-4o-mini)
- **Telegram Listener:** GramJS (telegram package) - đăng nhập bằng account user
- **Telegram Bot:** Telegraf - gửi thông báo và nhận lệnh từ Broker
- **API Docs:** Swagger UI tại `/api/docs`
- **Scheduler:** @nestjs/schedule (Cron jobs)

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
| `BROKER_CHAT_ID` | Chat ID của Broker để nhận thông báo tự động |

## API Endpoints

### Sources - Quản lý nguồn lắng nghe
- `POST /api/sources` - Thêm group/chat mới cần theo dõi
- `GET /api/sources` - Liệt kê tất cả nguồn
- `GET /api/sources/:id` - Chi tiết một nguồn
- `PATCH /api/sources/:id` - Cập nhật (bật/tắt, đổi tên)
- `DELETE /api/sources/:id` - Xóa nguồn

### Messages - Xem tin nhắn thô
- `GET /api/messages` - Liệt kê tin nhắn (filter: sourceId, undigested)
- `GET /api/messages/stats` - Thống kê tổng quan

### Digests - Tóm tắt
- `POST /api/digests/summarize` - Kích hoạt tóm tắt on-demand
- `GET /api/digests` - Liệt kê bản tóm tắt
- `GET /api/digests/:id` - Chi tiết bản tóm tắt + tin nhắn gốc

### Telegram - Trạng thái
- `GET /api/telegram/status` - Kiểm tra kết nối bot & listener

## Telegram Bot Commands

| Lệnh | Mô tả |
|-------|--------|
| `/start` | Hiển thị menu lệnh |
| `/sources` | Xem danh sách nguồn đang theo dõi |
| `/summarize` | Tóm tắt tin nhắn 24h gần nhất |
| `/summarize_today` | Tóm tắt tin nhắn hôm nay |
| `/stats` | Thống kê hệ thống |
| `/ask <câu hỏi>` | Hỏi AI về nội dung đã thu thập |

Ngoài ra, gửi tin nhắn tự do bất kỳ cũng sẽ được AI trả lời dựa trên dữ liệu đã thu thập.

## Cronjob tự động

- **12:00 trưa** - Chốt phiên sáng (00:00 → 12:00)
- **18:00 chiều** - Chốt phiên chiều (12:00 → 18:00)

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
5. Restart server, lần sau không cần login lại

### 4. Lấy Chat ID của Broker (nhận thông báo)
1. Thêm bot vào group hoặc chat với bot
2. Truy cập `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Tìm `chat.id` trong response
4. Paste vào `BROKER_CHAT_ID`

### 5. Cấu hình lắng nghe chat (Group & Cá nhân)
Để Bot tóm tắt tin nhắn, bạn cần chỉ định những đoạn chat nào sẽ được theo dõi.
1. Mở Swagger UI tại: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
2. Chạy API `GET /api/telegram/dialogs`. API sẽ trả về tối đa 50 cuộc hội thoại gần nhất (nhóm, channel, chat cá nhân).
3. Lấy `id` của đoạn chat cần theo dõi.
4. Chạy API `POST /api/sources` và dán `id` vừa copy vào trường `externalId`:
```json
{
  "name": "Tên đoạn chat",
  "platform": "telegram",
  "externalId": "-10012345678",
  "isActive": true
}
```
Sau bước này, hệ thống sẽ tự động lắng nghe và lưu trữ tin nhắn từ nguồn này để tóm tắt.

## Cấu trúc Project

```
src/
├── ai/              # AiService - OpenAI wrapper
├── cron/            # CronService - Lịch tóm tắt tự động
├── digest/          # DigestModule - Kích hoạt & xem tóm tắt
├── message/         # MessageModule - Xem tin nhắn thô
├── prisma/          # PrismaService - Kết nối database
├── source/          # SourceModule - CRUD nguồn lắng nghe
├── telegram/        # TelegramModule - Bot + Listener
├── app.module.ts
└── main.ts          # Swagger setup
```
