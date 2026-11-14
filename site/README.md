# Trang chủ và viewer DiciiBooth — Cloudflare Workers

Source nằm trong thư mục `site/`; `viewer/` ở gốc repo vẫn là nguồn viewer hiện có. Khi build, script chép nguyên viewer vào trang web. Không cần D1, R2 hay Access ở giai đoạn này.

## Điền màn hình tạo Workers từ GitHub

- Repository: `ngcuongbok/dcb`
- Production branch: `main`
- Project name: `dcb` (phải trùng tên trong `site/wrangler.jsonc`)
- Root directory: `site` (cuộn xuống phần build settings để tìm mục này)
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Preview command: `npx wrangler preview`
- Build variables: chưa cần thêm; chọn Node.js 22 hoặc 24 nếu Cloudflare yêu cầu.

Cloudflare sẽ cài dependencies theo `package-lock.json`. Deploy đầu tiên lên `*.workers.dev`; chưa cần đổi DNS. Nếu dùng tên project khác, sửa `name` trong `site/wrangler.jsonc` cho trùng trước khi deploy.

Sau deploy, kiểm tra `/`, `/viewer/`, `/viewer/archive.html` và QR thật của PTB/SelfBooth: xem, tải ảnh và gửi thu ngân. Kiểm tra query string sau khi chuyển hướng. Không chuyển domain chính đến khi toàn bộ luồng thực tế được xác nhận. Chặn index bản thử; canonical/sitemap hiện dành cho `https://diciibooth.vn`.

Landing dùng ảnh minh họa AI. Blog, tài khoản và điểm chưa triển khai trong giai đoạn này. Google Analytics ID cũ được giữ. Viewer có quy tắc robots không index; đó không phải cơ chế bảo vệ ảnh.

## Local

Trong `site/`: `npm ci`, `npm run build`, `npx wrangler dev`. Đường dẫn đầu ra là `site/out`. Viewer build ra phải khớp các file `viewer/` trong repo.
