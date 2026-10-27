# Knowledge OS - Hệ thống Quản lý Tri thức Doanh nghiệp

## Giới thiệu

Knowledge OS là hệ thống RAG (Retrieval-Augmented Generation) hoàn chỉnh cho doanh nghiệp, cho phép:
- 📄 Tải lên và xử lý tài liệu (PDF, DOCX, Markdown)
- 🔍 Tìm kiếm ngữ nghĩa qua vector embeddings
- 🕸️ Truy vấn quan hệ qua knowledge graph (Neo4j)
- 💬 Chat với AI có trích dẫn nguồn
- 🔐 Phân quyền theo phòng ban và vai trò
- ⚡ Xử lý nền bất đồng bộ với queue

## Công nghệ sử dụng

- **Frontend**: Next.js 15 + React 19 + TailwindCSS
- **Backend**: Next.js API Routes + Drizzle ORM
- **Database**: PostgreSQL 16 + pgvector
- **Graph**: Neo4j AuraDB
- **Queue**: BullMQ + Redis
- **AI**: Google Gemini (embeddings + chat)
- **Auth**: NextAuth.js v5

## Cài đặt nhanh

### Bước 1: Cấu hình môi trường

1. **Lấy Gemini API key** (miễn phí):
   - Truy cập: https://aistudio.google.com/apikey
   - Click "Create API Key"
   - Copy key

2. **Cập nhật file `.env`**:
   ```bash
   GEMINI_API_KEY=your_key_here
   ```

3. **Tạo AUTH_SECRET**:
   ```bash
   # Windows (PowerShell)
   [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
   
   # Linux/Mac
   openssl rand -base64 32
   ```
   
   Paste vào `.env`:
   ```bash
   AUTH_SECRET=<chuỗi random vừa tạo>
   ```

4. **Bật đăng nhập Google (tùy chọn)**:
   - Tạo OAuth Client ID loại **Web application** trong Google Cloud Console.
   - Thêm URI chuyển hướng:
     - Local: `http://localhost:3000/api/auth/callback/google`
     - Production: `https://<domain-cua-ban>/api/auth/callback/google`
   - Điền `AUTH_GOOGLE_ID` và `AUTH_GOOGLE_SECRET` vào `.env`.
   - Khi đang ở chế độ kiểm thử OAuth, thêm tài khoản Google dùng để đăng nhập vào danh sách test users.
   - Tạo người dùng trong trang quản trị với đúng email Google và chọn **Đăng nhập bằng Google**.
   - Để giới hạn theo domain, đặt `AUTH_GOOGLE_ALLOWED_DOMAIN=company.com`. Để trống phù hợp cho bản demo; chỉ email đã được quản trị viên cấp mới đăng nhập được.
   - Để bật nhập tài liệu từ Google Drive, bật **Google Drive API** và **Google Picker API** trong cùng Cloud project. Tạo API key, giới hạn theo HTTP referrer và chỉ cho phép Google Picker API; thêm API key vào `NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY` và project number vào `NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID`.
   - Thêm `http://localhost:3000` (và domain production) vào Authorized JavaScript origins của OAuth client. Drive Picker chỉ xin quyền `drive.file` để truy cập các tệp người dùng chọn; Google Docs/Sheets/Slides được xuất thành PDF. Các tệp khác chỉ hỗ trợ PDF, DOCX, Markdown và TXT.

### Bước 2: Chạy setup script

**Windows**:
```bash
setup.bat
```

**Linux/Mac**:
```bash
chmod +x setup.sh
./setup.sh
```

### Bước 3: Khởi động ứng dụng

Mở 2 terminal:

**Terminal 1 - Web server**:
```bash
npm run dev
```

**Terminal 2 - Worker xử lý tài liệu**:
```bash
npm run worker
```

### Bước 4: Truy cập ứng dụng

🌐 Mở trình duyệt: http://localhost:3000

## Tài khoản demo

| Email | Mật khẩu | Vai trò | Phòng ban |
|-------|----------|---------|-----------|
| admin@local | admin123 | Admin | Công nghệ |
| hr@local | hr123456 | Manager | Nhân sự |
| dev@local | dev123456 | Employee | Công nghệ |
| legal@local | legal123 | Employee | Pháp chế |
| guest@local | (không có) | Guest | - |

## Cách sử dụng

### 1. Tải lên tài liệu

1. Đăng nhập bằng tài khoản admin hoặc manager
2. Vào trang **Tài liệu** (`/documents`)
3. Chọn file PDF/DOCX/Markdown
4. Chọn phòng ban
5. Click "Đưa vào hàng đợi"
6. Theo dõi trạng thái xử lý:
   - `Trong hàng đợi` → Worker chưa nhận
   - `Đang xử lý` → Đang parse và tạo embeddings
   - `Hoàn tất` → Sẵn sàng để chat

### 2. Hỏi đáp với AI

1. Vào trang **Chat** (`/chat`)
2. Đặt câu hỏi về tài liệu
3. Hệ thống sẽ:
   - Tìm kiếm tài liệu liên quan (vector search)
   - Hoặc tra cứu quan hệ (Neo4j graph)
   - Tổng hợp câu trả lời với trích dẫn nguồn
4. Click vào trích dẫn để xem tài liệu gốc

### 3. Quản lý phòng ban (Admin)

- Vào trang **Admin** (`/admin`)
- Xem thống kê: số tài liệu, chunks, người dùng
- Quản lý quyền truy cập
- Có thể nhập danh sách người dùng hàng loạt bằng CSV tại mục quản trị tài khoản. Tệp cần cột `name,email`; `role` và `department` là tùy chọn. Xem trước để kiểm tra lỗi trước khi xác nhận. Email trùng tài khoản hiện có hoặc lặp trong tệp sẽ bị bỏ qua.
- Tài khoản nhập từ CSV dùng Google để đăng nhập; phòng ban phải khớp tên hoặc slug đã tồn tại. Excel `.xlsx` chưa được hỗ trợ; hãy lưu bảng tính thành CSV UTF-8 trước khi tải lên.

## Kiến trúc hệ thống

```
┌─────────────────┐
│   User Upload   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API: /api/docs │ ──► Lưu file vào ./uploads/
└────────┬────────┘     Tạo record trong DB
         │
         ▼
┌─────────────────┐
│  BullMQ Queue   │ ──► Redis
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Worker      │
└────────┬────────┘
         │
         ├──► Parse (pdf-parse/mammoth)
         ├──► Chunk (3500 chars)
         ├──► Embed (Gemini text-embedding-004)
         ├──► Store:
         │    ├─► PostgreSQL (vector)
         │    └─► Neo4j (graph)
         └──► Check duplicates
```

## Luồng xử lý RAG

```
User asks: "Quy trình nghỉ phép là gì?"
         │
         ▼
┌─────────────────┐
│  LangGraph      │ ──► Phân tích loại câu hỏi
│  Router         │
└────────┬────────┘
         │
    ┌────┴─────┐
    ▼          ▼
┌────────┐  ┌─────────┐
│Vector  │  │ Graph   │
│Path    │  │ Path    │
└───┬────┘  └────┬────┘
    │            │
    │ Semantic   │ Relationship
    │ Search     │ Query
    │            │
    └────┬───────┘
         ▼
┌─────────────────┐
│ Gemini Generate │ ──► Tạo câu trả lời
└────────┬────────┘     với trích dẫn
         │
         ▼
┌─────────────────┐
│   UI Display    │
└─────────────────┘
```

## Cấu trúc thư mục

```
D:\Doan\
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (app)/             # Các trang yêu cầu đăng nhập
│   │   │   ├── documents/     # Quản lý tài liệu
│   │   │   ├── chat/          # Giao diện chat
│   │   │   ├── dashboard/     # Thống kê
│   │   │   └── admin/         # Quản trị
│   │   ├── api/               # REST API
│   │   │   ├── documents/     # Upload & list
│   │   │   ├── chat/          # RAG query
│   │   │   └── departments/   # Phòng ban
│   │   ├── login/             # Đăng nhập
│   │   └── layout.tsx         # Root layout
│   ├── lib/
│   │   ├── db/                # Database
│   │   │   ├── schema.ts      # Drizzle schema
│   │   │   ├── index.ts       # DB client
│   │   │   └── seed.ts        # Demo data
│   │   ├── rag/               # RAG pipeline
│   │   │   ├── parse.ts       # Parse PDF/DOCX
│   │   │   ├── chunk.ts       # Text chunking
│   │   │   ├── embeddings.ts  # Vector embeddings
│   │   │   ├── retrieve.ts    # Vector search
│   │   │   ├── generate.ts    # Answer generation
│   │   │   └── pipeline.ts    # Orchestration
│   │   ├── graph/             # Neo4j
│   │   │   ├── client.ts      # Neo4j driver
│   │   │   └── queries.ts     # Cypher queries
│   │   ├── queue/             # BullMQ
│   │   │   ├── queues.ts      # Queue setup
│   │   │   └── worker.ts      # Job processor
│   │   ├── llm/               # AI clients
│   │   │   └── gemini.ts      # Gemini wrapper
│   │   ├── langgraph/         # Query router
│   │   │   └── router.ts      # Vector vs Graph
│   │   └── auth/              # Authentication
│   │       ├── guards.ts      # Route protection
│   │       └── permissions.ts # Access control
│   ├── components/            # React components
│   ├── auth.ts                # NextAuth config
│   ├── middleware.ts          # Auth middleware
│   └── worker.ts              # Worker entry point
├── docker-compose.yml         # PostgreSQL + Redis
├── drizzle.config.ts          # Drizzle ORM config
├── .env                       # Environment variables
├── package.json               # Dependencies
└── tsconfig.json              # TypeScript config
```

## Phân quyền

### Vai trò (Roles)

1. **Admin**: 
   - Xem tất cả tài liệu
   - Quản lý người dùng
   - Xem thống kê hệ thống

2. **Manager**: 
   - Xem tài liệu phòng ban mình và phòng ban cấp dưới
   - Tải lên tài liệu
   - Gán quyền truy cập

3. **Employee**: 
   - Xem tài liệu phòng ban mình
   - Tải lên tài liệu
   - Chat với AI

4. **Guest**: 
   - Chỉ xem (read-only)
   - Không tải lên được

### Phân quyền theo phòng ban

- Mỗi tài liệu thuộc về 1 phòng ban chính
- Có thể gán thêm quyền cho nhiều phòng ban khác
- User chỉ thấy tài liệu của phòng ban mình có quyền

## Xử lý sự cố

### Worker không xử lý file

```bash
# Kiểm tra logs
npm run worker

# Kiểm tra Redis
docker exec -it doan-redis-1 redis-cli ping
# Phải trả về: PONG
```

### Database lỗi

```bash
# Reset database
docker-compose down -v
docker-compose up -d
timeout /t 10
npm run db:push
npm run db:seed
```

### Container không chạy

```bash
# Kiểm tra status
docker-compose ps

# Xem logs
docker-compose logs postgres
docker-compose logs redis

# Restart
docker-compose restart
```

### Lỗi "Invalid environment"

Kiểm tra file `.env` có đủ các biến bắt buộc:
- `POSTGRES_URL`
- `AUTH_SECRET`
- `GEMINI_API_KEY`
- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`

## Công cụ phát triển

### Database Studio (GUI)
```bash
npm run db:studio
```
→ https://local.drizzle.studio

### Xem queue jobs
```bash
# Vào Redis CLI
docker exec -it doan-redis-1 redis-cli

# List tất cả keys
KEYS bull:*

# Xem job cụ thể
HGETALL bull:document-processor:1
```

### Logs
- Next.js: Terminal 1
- Worker: Terminal 2
- PostgreSQL: `docker-compose logs postgres`
- Redis: `docker-compose logs redis`

## Tính năng nổi bật

✅ **RAG hoàn chỉnh**: Vector search + Graph queries
✅ **Multi-tenancy**: Phân quyền theo phòng ban
✅ **Background jobs**: Xử lý bất đồng bộ với BullMQ
✅ **Trích dẫn nguồn**: Mỗi câu trả lời có link đến tài liệu gốc
✅ **Production-ready**: Error handling, retry logic, logging
✅ **Modern stack**: Next.js 15, React 19, TypeScript

## Tính năng sắp tới

- [ ] Upload nhiều file cùng lúc (drag & drop)
- [ ] Preview tài liệu (PDF viewer)
- [ ] Export lịch sử chat
- [ ] Tìm kiếm nâng cao với filters
- [ ] Thông báo email (tài liệu đã xử lý xong)
- [ ] OAuth (Google, Microsoft)
- [ ] Dashboard analytics chi tiết
- [ ] Version control cho tài liệu

## Support

- 📧 Email: duyth@example.com
- 📖 Docs: [SETUP.md](./SETUP.md), [START.md](./START.md)
- 🐛 Issues: GitHub Issues

## License

MIT License - tự do sử dụng cho cả mục đích thương mại.

---

**Phát triển bởi**: Duy Thanh
**Ngày**: 2026-09-30
**Version**: 1.0.0
