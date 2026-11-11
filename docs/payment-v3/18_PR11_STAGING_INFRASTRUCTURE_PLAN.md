# TÀI LIỆU QUY HOẠCH HẠ TẦNG VÀ TRIỂN KHAI STAGING EDUNITY V3
# DOCUMENT: 18_PR11_STAGING_INFRASTRUCTURE_PLAN.md
# NHIỆM VỤ: TIN-FIN-PR11 — STAGING INFRASTRUCTURE & PAYOS DEPLOYMENT PREPARATION

> **Dự án**: EDUNITY V3 — Nền tảng Giáo dục Trực tuyến & Gây quỹ Học bổng  
> **Chủ nhiệm**: Tin — Senior DevOps Architect + Payment Integration Engineer + Financial Security Auditor + QA Lead  
> **Mục tiêu**: Thiết lập toàn bộ quy chuẩn kiến trúc hạ tầng, bảo mật mạng, tách biệt môi trường Staging và chuẩn bị điều kiện kích hoạt Pilot payOS có kiểm soát.  
> **Trạng thái**: READINESS DESIGN & PLANNING (KHÔNG deploy Production, KHÔNG gọi payOS thật).  

---

## 1. TỔNG QUAN VÀ HIỆN TRẠNG REPOSITORY

Qua kết quả rà soát chi tiết toàn bộ codebase (`BackEnd/`, `FrontEnd/`):
- **Repository hiện tại chưa chứa các cấu hình hạ tầng container hóa**:
  - Không có file `Dockerfile` hoặc `docker-compose.yml` ở thư mục gốc hay các thư mục con.
  - Không có file cấu hình Web Server Nginx/Caddy/Traefik.
  - Không có thư mục CI/CD pipelines (như `.github/workflows/` của dự án).
  - Không có deployment scripts tự động (`deploy.sh`).
- **Trạng thái môi trường và cấu hình**:
  - `BackEnd/.env.example`: Đã khai báo đầy đủ các biến môi trường cho 2 kênh payOS (`PAYOS_TUITION_*` và `PAYOS_DONATION_*`), cấu hình Outbox Worker (`ENABLE_FINANCIAL_OUTBOX_WORKER`), LiveKit, JWT và Storage.
  - `BackEnd/src/config/env.js`: Có cơ chế `assertEnv()` chặn server khởi động nếu thiếu biến hoặc chứa placeholder.
  - `FrontEnd/vite.config.ts`: Sử dụng `@vitejs/plugin-react` với output `dist/`.
  - `FrontEnd/src/api/apiClient.ts`: Đọc base URL từ `VITE_API_BASE_URL || "http://localhost:3000/api"`.
- **Yêu cầu dữ liệu đầu vào (Deployment Input Required)**:
  - Do chưa có thông tin IP máy chủ VPS và Domain thực tế, mọi cấu hình trong tài liệu này sử dụng placeholder chuẩn:
    - Frontend Domain: `https://<FRONTEND_STAGING_DOMAIN>` (VD: `https://staging.edunity.vn`)
    - Backend Domain: `https://<BACKEND_STAGING_DOMAIN>` (VD: `https://api-staging.edunity.vn`)
    - Staging Database: `mongodb://<DB_USER>:<DB_PASS>@<DB_HOST>:27017/edunity_staging?replicaSet=rs0`
  - Đánh dấu trạng thái: **`DEPLOYMENT_INPUT_REQUIRED`** đối với địa chỉ IP VPS, DNS Records và SSL Key Pair.

---

## 2. SƠ ĐỒ KIẾN TRÚC MÔI TRƯỜNG STAGING

Hệ thống Staging được thiết kế phân lập hoàn toàn với Production, bảo đảm 100% tính toàn vẹn của dữ liệu:

```
                            ┌─────────────────────────────────┐
                            │      INTERNET / CLIENT USERS    │
                            └───────────────┬─────────────────┘
                                            │ HTTPS (Port 443)
                                            ▼
                    ┌─────────────────────────────────────────────────┐
                    │      EDGE REVERSE PROXY / NGINX (STAGING)       │
                    │   - SSL/TLS Termination (Let's Encrypt / CF)    │
                    │   - Rate Limiting & Security Headers            │
                    │   - Path Routing (/ -> FE, /api -> BE)          │
                    └───────────────┬─────────────────┬───────────────┘
                                    │                 │
                Proxy Pass Port 4173│                 │Proxy Pass Port 5000
                                    ▼                 ▼
             ┌─────────────────────────────┐   ┌─────────────────────────────┐
             │     FRONTEND APPLICATION    │   │     BACKEND EXPRESS API     │
             │   - Vite Static / Nginx Web │   │   - Node.js (v22.x LTS)     │
             │   - React 19 + TypeScript   │   │   - Unified Payment Engine  │
             │   - VITE_API_BASE_URL       │   │   - Financial Outbox Worker │
             │   - Ant Design + Tailwind   │   │   - Central System Clock    │
             └─────────────────────────────┘   └──────────────┬──────────────┘
                                                              │
                                            MongoDB Connection│(Replica Set rs0)
                                                              ▼
                                               ┌─────────────────────────────┐
                                               │   STAGING MONGODB DATABASE  │
                                               │   - db: edunity_staging     │
                                               │   - Replica Set Enabled     │
                                               │   - Multi-doc Transactions  │
                                               │   - Unique Indexes Active   │
                                               └─────────────────────────────┘

    [PAYOS PAYMENT GATEWAY]
               │
               │ POST Webhook (HTTPS TLS 1.2/1.3)
               ▼
    [EDGE REVERSE PROXY]
               │ /api/payments/webhooks/payos/*
               ▼
    [BACKEND WEBHOOK ROUTER]
               │ HMAC-SHA256 Signature Verification
               ▼
    [BANK_TRANSFER_EVENT (OUTBOX)] ──► [FINANCIAL DISPATCHER] ──► [LEDGER & ENROLLMENT]
```

---

## 3. CẤU HÌNH VÀ TÁCH BIỆT THÀNH PHẦN

### 3.1. Phân lập Backend & Frontend
- **Frontend**: Triển khai độc lập dưới dạng Static Web Assets được phục vụ bởi Nginx (hoặc container nhẹ), kết nối với Backend thông qua `VITE_API_BASE_URL=https://<BACKEND_STAGING_DOMAIN>/api`.
- **Backend**: Ứng dụng Node.js chạy sau Reverse Proxy tại cổng nội bộ `5000` (hoặc `3000`). Bật cờ `TRUST_PROXY=1` để Express Rate Limiter nhận diện chính xác IP của Client qua `X-Forwarded-For`.

### 3.2. Phân lập Cơ sở dữ liệu Staging (Tuyệt đối không kết nối Production)
- Database Staging mang tên `edunity_staging`.
- **Bắt buộc Replica Set (`rs0`)**: MongoDB Transactions (`session.withTransaction`) được sử dụng xuyên suốt hệ thống (Atomic Financial Dispatch, Payout Dual Verification, Refund Execution). Standalone MongoDB sẽ bị crash ngay lập tức khi thực thi transaction. Do đó, MongoDB Staging phải được cấu hình ít nhất 1 node replica set (Single-node Replica Set cho Staging: `mongod --replSet rs0 --bind_ip_all`).
- **Phân quyền truy cập tối thiểu (Least-Privilege)**: Tạo tài khoản database riêng cho staging (`staging_app_user`), chỉ cấp quyền `readWrite` trên database `edunity_staging`. Tuyệt đối không dùng quyền `root` hay `clusterAdmin`.

### 3.3. Quản lý Secrets và Biến môi trường
- Toàn bộ secret được nạp qua file `.env.staging` (hoặc Docker Secrets / Vault).
- Tuyệt đối không commit file chứa secret vào Git.
- `assertEnv()` đảm bảo rằng các secret (`JWT_SECRET`, `FILE_URL_SECRET`, `PAYMENT_WEBHOOK_SECRET`) đều có độ dài tối thiểu 32 ký tự, không trùng nhau và không chứa từ khóa ví dụ (`change-me`, `secret`, `example`).

---

## 4. BẢO MẬT MẠNG, HTTPS & REVERSE PROXY CONFIGURATION

Cấu hình mẫu Nginx Reverse Proxy chuẩn mực cho máy chủ Staging:

```nginx
# /etc/nginx/sites-available/edunity-staging.conf

# 1. Rate Limiting Zones
limit_req_zone $binary_remote_addr zone=api_general:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=payos_webhook:10m rate=10r/s;

# 2. Redirect HTTP -> HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name <FRONTEND_STAGING_DOMAIN> <BACKEND_STAGING_DOMAIN>;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# 3. Backend API & Webhook Service
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name <BACKEND_STAGING_DOMAIN>;

    ssl_certificate /etc/letsencrypt/live/<BACKEND_STAGING_DOMAIN>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<BACKEND_STAGING_DOMAIN>/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 10M;

    # payOS Webhook Endpoints (Dedicated High-Priority Location)
    location ~ ^/api/payments/webhooks/payos/(tuition|donation)$ {
        limit_req zone=payos_webhook burst=20 nodelay;

        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # Keep raw bytes intact for HMAC-SHA256 signature verification
        proxy_buffering off;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
    }

    # General API Routes
    location / {
        limit_req zone=api_general burst=50 nodelay;

        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}

# 4. Frontend SPA Application
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name <FRONTEND_STAGING_DOMAIN>;

    ssl_certificate /etc/letsencrypt/live/<FRONTEND_STAGING_DOMAIN>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<FRONTEND_STAGING_DOMAIN>/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /var/www/edunity-staging-fe/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }
}
```

---

## 5. CẤU HÌNH BIẾN MÔI TRƯỜNG MẪU (STAGING TEMPLATE)

File cấu hình `.env.staging.template` (Không chứa secret thật):

```bash
# ==============================================================================
# EDUNITY V3 — STAGING ENVIRONMENT CONFIGURATION TEMPLATE
# ==============================================================================

# 1. Server & Runtime
PORT=5000
NODE_ENV=production
APP_TZ_OFFSET_MINUTES=420
TRUST_PROXY=1

# 2. Domains & CORS
PUBLIC_BASE_URL=https://<BACKEND_STAGING_DOMAIN>
CORS_ORIGIN=https://<FRONTEND_STAGING_DOMAIN>

# 3. Database (MongoDB Replica Set Staging)
MONGODB_URI=mongodb://<DB_USER>:<DB_PASS>@<DB_HOST>:27017/edunity_staging?replicaSet=rs0&authSource=admin

# 4. Security Secrets (Tạo mới: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
JWT_SECRET=generate_strong_random_secret_at_least_32_chars_01
FILE_URL_SECRET=generate_strong_random_secret_at_least_32_chars_02
PAYMENT_WEBHOOK_SECRET=generate_strong_random_secret_at_least_32_chars_03
ROOM_TOKEN_SECRET=generate_strong_random_secret_at_least_32_chars_04
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30

# 5. Commission & Business Policies
COMMISSION_RATE=0.10
COMMISSION_POLICY_VERSION=STAGING_POLICY_V3
COMMISSION_POLICY_APPROVED=true
REQUIRE_APPROVED_COMMISSION_POLICY=false
SEAT_HOLD_MINUTES=15
SCHOLARSHIP_VALID_DAYS=180

# 6. Financial Outbox Recovery Worker
ENABLE_FINANCIAL_OUTBOX_WORKER=true
FINANCIAL_OUTBOX_INTERVAL_MS=15000
FINANCIAL_OUTBOX_BATCH_SIZE=25

# 7. payOS Two-Channel Configuration
# Controlled Gate: Giữ false cho đến khi bắt đầu diễn tập Pilot chính thức
PAYOS_ENABLED=false
ENABLE_PAYMENT_SANDBOX=false
PAYOS_TIMEOUT_MS=10000

# Kênh Học phí (TUITION)
PAYOS_TUITION_CLIENT_ID=<STAGING_TUITION_CLIENT_ID>
PAYOS_TUITION_API_KEY=<STAGING_TUITION_API_KEY>
PAYOS_TUITION_CHECKSUM_KEY=<STAGING_TUITION_CHECKSUM_KEY>
PAYOS_TUITION_RETURN_URL=https://<FRONTEND_STAGING_DOMAIN>/payment/return
PAYOS_TUITION_CANCEL_URL=https://<FRONTEND_STAGING_DOMAIN>/payment/cancel

# Kênh Học bổng (DONATION)
PAYOS_DONATION_CLIENT_ID=<STAGING_DONATION_CLIENT_ID>
PAYOS_DONATION_API_KEY=<STAGING_DONATION_API_KEY>
PAYOS_DONATION_CHECKSUM_KEY=<STAGING_DONATION_CHECKSUM_KEY>
PAYOS_DONATION_RETURN_URL=https://<FRONTEND_STAGING_DOMAIN>/sponsor/contributions/return
PAYOS_DONATION_CANCEL_URL=https://<FRONTEND_STAGING_DOMAIN>/sponsor/contributions/cancel
```

---

## 6. QUẢN LÝ TIẾN TRÌNH & GIÁM SÁT (PM2 / SYSTEMD)

Sử dụng PM2 Process Manager trên máy chủ Staging để tự động phục hồi và ghi log:

```javascript
// ecosystem.config.js (Staging)
module.exports = {
  apps: [
    {
      name: "edunity-staging-api",
      script: "src/server.js",
      cwd: "/var/www/edunity/BackEnd",
      instances: 1, // Single instance to simplify outbox worker & in-memory metrics on Staging
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
      error_file: "/var/log/edunity/staging-err.log",
      out_file: "/var/log/edunity/staging-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
```

---

## 7. BACKUP & DISASTER RECOVERY PLAN (STAGING)

1. **Sao lưu trước Pilot (Pre-Pilot Snapshot)**:
   ```bash
   mongodump --uri="mongodb://<DB_USER>:<DB_PASS>@localhost:27017/edunity_staging?replicaSet=rs0&authSource=admin" --out=/var/backups/edunity/pre_pilot_$(date +%Y%m%d_%H%M%S)
   ```
2. **Quy trình Khôi phục Khẩn cấp (Rollback Drill)**:
   Nếu xảy ra lỗi phân bổ sai lệch hoặc duplicate event trong lúc test, kích hoạt khôi phục dữ liệu:
   ```bash
   mongorestore --uri="mongodb://<DB_USER>:<DB_PASS>@localhost:27017/edunity_staging?replicaSet=rs0&authSource=admin" --drop /var/backups/edunity/pre_pilot_<TIMESTAMP>/edunity_staging
   ```
3. **Kế hoạch Ứng cứu Sự cố (Incident Response Plan)**:
   - Khi phát hiện webhook bị spam hoặc rò rỉ secret: Tắt ngay `PAYOS_ENABLED=false` trong `.env` và reload PM2 (`pm2 reload edunity-staging-api`).
   - Mọi khoản thu thử nghiệm sẽ được dừng ngay lập tức.

