# Kế hoạch Triển khai: Summarize AI Assistant (Personal)

## 1. Tổng quan & Luồng hoạt động (Architecture & Flow)

Hệ thống hoạt động như một trợ lý cá nhân, tự động đọc tin nhắn từ các group/chat được chỉ định, gom nhóm (aggregate) các tin nhắn liên tiếp, gọi AI để tóm tắt và gửi báo cáo về một kênh duy nhất cho Broker.

**Luồng xử lý chính:**
1. **Listen:** Server đóng vai trò là User Client (GramJS cho Telegram, WhatsApp-web.js cho WhatsApp) lắng nghe tin nhắn từ các `Source` (Group A, Cá nhân B).
2. **Lưu trữ liên tục:** Tin nhắn từ các nguồn được lắng nghe sẽ được lưu trực tiếp vào Database (`RawMessage`).
3. **Digest (Summarize) theo nhu cầu:** Quá trình tóm tắt không chạy tự động sau mỗi 60s mà chạy theo **lịch trình** (ví dụ: chốt phiên sáng/chiều) hoặc **khi có yêu cầu** từ Broker (gõ lệnh `/summarize Group X`). Hệ thống sẽ gom toàn bộ tin nhắn chưa được tóm tắt của một khoảng hội thoại dài để xử lý.
4. **Notify & Tương tác:** Gửi bản tóm tắt (`Digest`) hoặc trả lời câu hỏi tổng hợp qua Telegram Bot trực tiếp cho Broker.

---

## 2. Thiết kế Cơ sở dữ liệu (Prisma Schema)

*Tham khảo từ kiến trúc hệ thống `Brain` của bạn, mình đã áp dụng pattern rất hay là tách biệt giữa `RawMessage` (tin nhắn thô) và `MessageDigest` (bản tóm tắt). Việc này giúp 1 bản tóm tắt có thể tham chiếu tới N tin nhắn thô, cực kỳ phù hợp cho cơ chế gom tin nhắn (Debounce).*

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── CORE CONFIGURATION ────────────────────────────────────────────────────────

// Nguồn lắng nghe (Group Telegram, Group WhatsApp, hoặc Chat cá nhân)
model Source {
  id          String   @id @default(uuid())
  platform    String   // telegram | whatsapp
  externalId  String   // ID của group/chat trên nền tảng (VD: chat_id)
  name        String?  // Tên gợi nhớ (VD: "Group Xăng Dầu Indo")
  isActive    Boolean  @default(true)
  config      Json?    // Các setting riêng biệt (VD: thời gian debounce riêng cho group này)
  createdAt   DateTime @default(now())

  actors      Actor[]
  messages    RawMessage[]
  digests     MessageDigest[]

  @@unique([platform, externalId])
}

// Người gửi tin nhắn trong các Source (Ông A, Ông B trong Group)
model Actor {
  id          String   @id @default(uuid())
  sourceId    String
  externalId  String   // User ID trên Telegram/WhatsApp
  name        String?  // Tên hiển thị của người gửi
  createdAt   DateTime @default(now())

  source      Source       @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  messages    RawMessage[]

  @@unique([sourceId, externalId])
}

// ─── DATA MODULE ───────────────────────────────────────────────────────────────

// Tin nhắn thô bắt được từ các Source
model RawMessage {
  id          String   @id @default(uuid())
  sourceId    String
  actorId     String
  externalId  String?  // message_id gốc từ platform để chống duplicate
  content     String   @db.Text
  messageType String   @default("text") // text | photo | document
  createdAt   DateTime @default(now()) // Timestamp gốc của tin nhắn

  digestId    String?  // FK -> MessageDigest (Nếu có tức là đã được AI tóm tắt)
  
  source      Source         @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  actor       Actor          @relation(fields: [actorId], references: [id], onDelete: Cascade)
  digest      MessageDigest? @relation(fields: [digestId], references: [id], onDelete: SetNull)

  @@index([sourceId])
  @@index([digestId])
  @@index([createdAt])
}

// Bản tóm tắt do AI tạo ra (1 Digest đại diện cho nhiều RawMessage)
model MessageDigest {
  id          String   @id @default(uuid())
  sourceId    String
  
  // Thời gian bắt đầu và kết thúc của chuỗi tin nhắn được tóm tắt
  timeFrom    DateTime 
  timeTo      DateTime 
  
  messageCount Int     // Số lượng tin nhắn thô tạo nên bản tóm tắt này
  
  summary     String   @db.Text // Nội dung tóm tắt gửi cho Broker
  
  // Trích xuất Entity (JSON) để sau này có thể làm chức năng Search/Filter (VD: Filter theo Dầu thô)
  entities    Json?    // { product: string, quantity: string, price: string, terms: string }
  
  status      String   @default("success") // success | failed_ai | pending
  createdAt   DateTime @default(now())

  source      Source       @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  messages    RawMessage[]

  @@index([sourceId])
  @@index([createdAt])
}

// ─── Q&A & RAG MODULE ──────────────────────────────────────────────────────────

// Lưu trữ context chat của Broker với Bot
model Conversation {
  id          String   @id @default(uuid())
  chatId      String   @unique // Telegram Chat ID của Broker
  messages    Json     // Lịch sử chat: [{role: 'user'|'assistant', content: string}]
  updatedAt   DateTime @updatedAt
}

// Lưu trữ Vector Embeddings để search ngữ nghĩa (RAG)
model Embedding {
  id          String   @id @default(uuid())
  refType     String   // "raw_message" | "message_digest"
  refId       String   // ID của RawMessage hoặc MessageDigest
  vectorId    String   // ID của document trong Vector DB (Pinecone, ChromaDB, hoặc pgvector)
  createdAt   DateTime @default(now())

  @@unique([refType, refId])
}
```

---

## 3. Các Phase Triển khai Chi tiết

### Phase 1: Khởi tạo Core, Database & API Docs
- **Tech stack:** NestJS, Prisma, PostgreSQL, `@nestjs/swagger`.
- **Công việc:**
  - Setup cấu trúc project NestJS và kết nối Prisma.
  - **API Documentation:** Tích hợp Swagger (`@nestjs/swagger`) để tự động generate tài liệu API (Swagger UI). Các API thiết lập cấu hình (CRUD cho `Source` để thêm group cần theo dõi) sẽ được document đầy đủ và có thể test trực tiếp tại endpoint `/api/docs`.
  - Viết module `TelegramClientService` (Dùng `gramjs` hoặc `tdlib`) để login bằng số điện thoại và lắng nghe luồng tin nhắn.
  - Khi có tin mới, kiểm tra `chat_id` có nằm trong bảng `Source` đang `isActive` không. Nếu có, lưu vào bảng `Actor` (nếu chưa có) và lưu `RawMessage`.

### Phase 2: Cơ chế Gom tin nhắn (On-demand / Cronjob)
- **Tech stack:** NestJS Cronjob (`@nestjs/schedule`) hoặc API Endpoint kích hoạt qua Telegram Bot.
- **Công việc:**
  - Thay vì dùng Redis/BullMQ để gom từng cụm nhỏ 60s, hệ thống chỉ lưu `RawMessage` liên tục vào database.
  - Cung cấp 2 cách để kích hoạt tóm tắt đoạn hội thoại dài:
    1. **Theo lịch trình (Cronjob):** Ví dụ cứ 12:00 trưa và 18:00 chiều, chạy Job query tất cả `RawMessage` có `digestId = null` nhóm theo từng `SourceId`.
    2. **Theo yêu cầu (On-demand):** Broker gõ lệnh `/summarize_today` hoặc `/summarize Group_X` vào con Bot. Hệ thống query các tin nhắn trong khoảng thời gian được yêu cầu.

### Phase 3: Xử lý AI (Summarization Layer)
- **Công việc:**
  - Lấy toàn bộ đoạn hội thoại dài (ví dụ: cả buổi sáng hoặc toàn bộ cuộc thảo luận) truyền vào AI Prompt.
  - Lưu kết quả trả về vào bảng `MessageDigest`.
  - Update `digestId` cho tất cả các `RawMessage` vừa được xử lý.
  - AI được prompt để hiểu context của một đoạn chat dài có thể chứa nhiều deal hoặc trao đổi phức tạp, sau đó trích xuất ra JSON (`summary`, `entities`).

### Phase 4: Gửi thông báo (Notification Layer)
- **Tech stack:** `telegraf` (Telegram Bot API).
- **Công việc:**
  - Giao diện UX Bot:
    - Bot tự động đăng ký các lệnh cơ bản (Menu Commands) với Telegram ngay khi khởi động.
    - Cung cấp inline keyboard cho phép chọn `Source` cụ thể khi gọi lệnh `/summarize` hoặc `/summarize_today`.
    - Trả về status "typing..." (`sendChatAction`) khi AI đang xử lý để Broker biết bot vẫn đang hoạt động.
  - Ngay sau khi lưu `MessageDigest` thành công.
  - NestJS gọi API của Telegram Bot để gửi `summary` vào Private Group của Broker.
  - Message format có thể đính kèm thông tin:
    ```
    🟢 [Nguồn: Nhóm VIP Xăng Dầu]
    Tóm tắt: ...
    (Từ 5 tin nhắn - Lúc 14:30)
    ```

### Phase 5: Giao tiếp & Truy vấn tổng hợp (Q&A / RAG Layer)
- **Mục đích:** Cho phép Broker hỏi các câu hỏi tổng hợp như *"Tóm tắt toàn bộ cuộc hội thoại của Group X tuần trước"*, *"Hôm qua có những deal Dầu thô nào?"*.
- **Tech stack:** LangChain, Vector Database (pgvector / ChromaDB / Pinecone).
- **Công việc:**
  - **Tạo Embeddings:** Mỗi khi một `MessageDigest` (hoặc `RawMessage`) được lưu, hệ thống gọi API OpenAI Embeddings để biến đoạn text thành Vector và lưu vào Vector DB (kèm lưu log vào bảng `Embedding` ở Prisma).
  - **Quản lý ngữ cảnh (Memory):** Khi Broker chat với Telegram Bot, lưu lịch sử trò chuyện vào bảng `Conversation` để Bot nhớ được câu hỏi trước đó.
  - **RAG (Retrieval-Augmented Generation):** Khi Broker đặt câu hỏi tổng hợp:
    1. Đọc lịch sử chat từ `Conversation`.
    2. Convert câu hỏi thành Vector.
    3. Query Vector DB để tìm ra Top K các `MessageDigest` hoặc `RawMessage` có nội dung liên quan nhất tới câu hỏi.
    4. Nhồi đống dữ liệu tìm được vào LLM Prompt: *"Dựa vào các dữ kiện sau, hãy trả lời câu hỏi của Broker:..."* và trả kết quả lại cho Broker.
  - **Tương tác linh hoạt:** Nếu người dùng gõ `/ask` mà chưa truyền câu hỏi, bot sẽ lưu trạng thái chờ và yêu cầu người dùng nhập câu hỏi ở tin nhắn tiếp theo thay vì báo lỗi. Mọi tin nhắn tự do (trong private chat) hoặc có tag tên bot (trong group chat) đều được xử lý như một câu hỏi thông thường kèm theo hiệu ứng "typing...".

---

## 4. Những điểm tối ưu học được từ hệ thống "Brain"

1. **Relation `RawMessage` -> `MessageDigest` (Many-to-One):** Cực kỳ quan trọng. Nhờ thiết kế này, bạn biết chính xác bản tóm tắt này được sinh ra từ những tin nhắn nào. Rất hữu ích cho việc Debug xem AI có bị "ảo giác" (hallucination) hay không.
2. **Sử dụng `Actor` thay vì `User`:** Vì nguồn dữ liệu là external (nhặt từ Telegram/WhatsApp vào), việc tách `Actor` giúp phân biệt rạch ròi người gửi bên ngoài và người quản trị hệ thống (`User`).
3. **Lưu trữ JSON cho Entities:** Tương tự như `entities` trong bảng `DataMessageDigest` của bạn, việc yêu cầu AI bóc tách các thông tin cụ thể (Loại dầu, Số lượng...) và lưu vào cột `entities` dạng JSON sẽ giúp tương lai bạn có thể dễ dàng làm tính năng: *"Liệt kê tất cả các deal Dầu thô trong tuần qua"*.
