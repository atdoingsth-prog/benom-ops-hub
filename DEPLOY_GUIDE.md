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
3. Vào tab **Kho 9005 & ERP → Nạp ERP CSV** để kéo thả file `InventoryPLU_*.csv` mới nhất lên là cả team xem chung dữ liệu trực tuyến 24/7!
