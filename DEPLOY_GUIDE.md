# Hướng Dẫn Deploy `benom Operations Hub` Lên Cloud (0 Đồng — 24/7)

Hệ thống sử dụng **Turso Free** (SQLite Cloud 5GB, không bao giờ tự khóa DB) + **Render Free** (chạy Web App 24/7 từ GitHub Private, không cần thẻ ngân hàng, không phụ thuộc máy tính của bạn).

---

## Bước 1: Tạo Database miễn phí trên Turso (2 phút)
1. Truy cập **[https://turso.tech](https://turso.tech)** → bấm **Sign Up** → đăng nhập bằng tài khoản **GitHub** của bạn.
2. Bấm **Create Database**:
   - Name: `benom-ops`
   - Region: chọn **Singapore (`sin`)** hoặc **Tokyo (`nrt`)** để gần Việt Nam nhất.
3. Sau khi tạo xong, bấm **Generate Token** (Read & Write, Expiration: *Never*):
   - Copy **Database URL** (dạng `libsql://benom-ops-xxxx.turso.io`) → lưu lại làm `TURSO_DATABASE_URL`.
   - Copy **Auth Token** → lưu lại làm `TURSO_AUTH_TOKEN`.

---

## Bước 2: Deploy App 1-Click lên Render Free (3 phút)
1. Truy cập **[https://render.com](https://render.com)** → bấm **Get Started** → đăng nhập bằng tài khoản **GitHub**.
2. Bấm **New +** → chọn **Blueprint** → chọn repo **`benom-ops-hub`**.
3. Render sẽ tự đọc file `render.yaml` và hỏi 2 biến môi trường:
   - `TURSO_DATABASE_URL`: dán Database URL từ Bước 1.
   - `TURSO_AUTH_TOKEN`: dán Auth Token từ Bước 1.
4. Bấm **Apply** → chờ ~2 phút Render build xong sẽ cấp cho bạn 1 đường link dạng:
   **`https://benom-operations-hub.onrender.com`**

---

## Bước 3: Đăng nhập & Chia sẻ quyền cho Team (như Google Sheets)
1. Mở đường link Render vừa nhận → đăng nhập bằng tài khoản Admin mặc định:
   - Email: `admin@benom.vn`
   - Mật khẩu: `benom2026` *(hãy đổi mật khẩu ngay sau lần đăng nhập đầu tiên!)*
2. Bấm nút **Chia sẻ & Phân quyền** ở góc trái dưới để thêm thành viên team và chọn vai trò:
   - **Admin:** Toàn quyền (Nạp ERP CSV, chốt Phụ cấp KTV, quản trị tài khoản).
   - **Chỉnh sửa (Store / CSKH):** Tạo đơn hàng, tạo phiếu NK/XK, tra cứu & mở Ticket bảo hành.
   - **KTV Hiện trường (4G):** Mở ký biên bản `BM-01` / `BM-05` + CSAT trên điện thoại, ghi giờ Support.
   - **Chỉ xem (Viewer):** Dành cho Sếp / Marketing xem Dashboard & tồn kho (không sửa/xóa được dữ liệu).
3. Vào tab **Kho 9005 & ERP → Nạp ERP CSV** để kéo thả file `InventoryPLU_*.csv` mới nhất lên là cả team xem chung dữ liệu trực tuyến 24/7! *(Backend đã nâng cấp đọc stream từng dòng — nạp được file lớn đến 150 MB mà không bị tràn RAM 512 MB trên Render Free.)*

---

## Bước 4: Khử Cold Start Render Free (\$0) Trong Giờ Hành Chính (2 phút)
Render Free Web Service **không hết hạn sau 30 ngày** (miễn phí `750 giờ/tháng` vĩnh viễn; chỉ Render PostgreSQL mới hết hạn 30 ngày và hệ thống này **không dùng** Render PostgreSQL). Tuy nhiên Render sẽ ngủ đông sau 15 phút không có truy cập (~50 giây thức dậy).

Để KTV 4G ngoài hiện trường mở app **tức thì** suốt giờ làm việc mà vẫn tốn **\$0**:
1. Tạo tài khoản miễn phí tại **[https://cron-job.org](https://cron-job.org)** (không cần thẻ tín dụng).
2. Bấm **Create Cronjob**:
   - **Title:** `benom Ops Hub Keep-Alive`
   - **URL:** `https://benom-operations-hub.onrender.com/api/health` *(lưu ý: route `/api/health` không truy vấn DB nên tiêu tốn **0 lượt đọc Turso**!)*
   - **Execution schedule:** chọn **Custom** → Minutes: `*/10` (mỗi 10 phút), Hours: `8,9,10,11,12,13,14,15,16,17,18,19,20` (khung `08:00–20:00`), Timezone: **`Asia/Ho_Chi_Minh`**.
3. Bấm **Create** → Render luôn tỉnh táo trong suốt giờ làm việc (`~12 giờ/ngày × 30 ngày = 360 giờ/tháng`, chỉ dùng chưa tới 50% hạn mức `750 giờ` miễn phí!).

---

## Bước 5: Chủ Quyền Dữ Liệu — Sao Lưu Định Kỳ 1-Click (Admin)
Để không bao giờ phụ thuộc hoàn toàn vào hạ tầng bên thứ 3:
1. Đăng nhập bằng tài khoản **Admin** → bấm nút **Sao lưu & Hệ thống** ở góc trái dưới.
2. Theo dõi thanh trạng thái **RAM máy chủ (RSS / 512 MB)** và tổng số bản ghi từng bảng.
3. Cuối mỗi tháng (sau khi chốt kỳ Phụ cấp KTV & Đối soát 3PL), bấm **Tải Backup Đầy Đủ (.json)** để lưu 1 bản dự phòng vào máy tính hoặc Google Drive nội bộ công ty.
