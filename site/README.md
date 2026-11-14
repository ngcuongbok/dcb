# DiciiBooth website — bản thử nghiệm

Mã website nằm trong `site/`; thư mục `viewer/` ở gốc repository là viewer hiện có. Không thay đổi GitHub Pages production hoặc DNS trước khi kiểm thử.

## Trạng thái

- Trang chủ, blog server-rendered, sitemap, metadata, bài nháp và bộ lọc nhãn.
- Trang `/admin` dùng Markdown, tải ảnh bìa/ảnh trong bài; API yêu cầu JWT Cloudflare Access hợp lệ.
- Chưa có biên tập trực quan kiểu Blogger, chuyển hướng slug, xóa bài, hẹn đăng, cache bài, hay hệ thống thành viên. Không coi là bản hoàn thiện sản xuất trước khi kiểm thử quyền Access, R2 và quy trình đăng bài trên Cloudflare.
- Không bật cache public cho blog cho tới khi có cơ chế làm mới/xóa cache khi đăng, sửa, ẩn bài.

## Chuẩn bị trên Cloudflare

1. Tạo D1 database tên `dicii-blog` và R2 bucket tên `dicii-blog-media`. Ghi database ID vào `site/wrangler.jsonc`, thay `REPLACE_WITH_D1_ID` (không đưa thông tin bí mật vào Git).
2. Tạo Cloudflare Zero Trust Access application cho `/admin*` và `/api/admin/*` trên domain thử nghiệm và domain production. Chỉ cho phép email quản trị cụ thể, bật chính sách đăng nhập phù hợp. Xác nhận mọi biến thể đường dẫn được bảo vệ; không dùng ứng dụng Allow everyone.
3. Điền `ACCESS_TEAM_DOMAIN` (ví dụ `https://TEN-TEAM.cloudflareaccess.com`, không có dấu `/` cuối) và `ACCESS_AUD` (Application Audience tag chính xác của application bảo vệ API) vào cấu hình Worker. API xác minh chữ ký, issuer và audience của Access JWT; nếu không cấu hình sẽ từ chối mọi yêu cầu. Nếu dùng nhiều Access application/audience khác nhau cần sửa cấu hình tương ứng trước khi dùng.
4. Với Wrangler đã đăng nhập, từ `site/`: `npx wrangler d1 execute dicii-blog --remote --file migrations/0001_blog.sql`. Đây là migration tạo bảng mới; chỉ chạy trên database mới dành cho blog, không trỏ tới database khác.
5. Kết nối GitHub repository với Cloudflare Workers Builds. Root directory `site`; build command `npm ci && npm run build:cloudflare`; deploy command `npx wrangler deploy`. Xác nhận thiết lập build/nhánh phù hợp với giao diện Cloudflare hiện tại. `npm run build:cloudflare` sao chép nguyên `../viewer` vào static assets, nên build phải có toàn bộ checkout. Hoặc build và deploy từ `site/` sau khi chạy `npm ci`.
6. Dùng domain thử nghiệm trước; xác minh `/`, `/blog`, `/viewer/`, `/viewer/archive.html`, sitemap, bài nháp, đăng nhập admin, đăng/sửa bài và tải ảnh. Do canonical hiện trỏ về `https://diciibooth.vn`, không cho công cụ tìm kiếm index bản thử nghiệm.
7. Chỉ sau khi kiểm tra và sẵn sàng mới chuyển domain thật; đối chiếu DNS hiện tại, các bản ghi email và tất cả QR đang sử dụng. Thử lại URL viewer có query string. Không thay đổi DNS nếu chưa có phương án rollback.

## Lưu ý

Bài viết dùng Markdown, không có trình soạn thảo trực quan đầy đủ. Nhãn hiển thị và lọc ở `/blog?label=...`. Không đổi slug sau khi xuất bản: chưa có chuyển hướng SEO cho slug cũ. Sao lưu D1 và R2 theo quy trình riêng; dữ liệu bài và ảnh không nằm trong GitHub. Cloudflare R2 có thể yêu cầu cấu hình billing theo chính sách tài khoản.

OpenNext cảnh báo hỗ trợ Windows chưa đầy đủ; nên build trong môi trường Linux/Cloudflare Builds. Tại thời điểm kiểm tra npm audit báo 3 lỗ hổng mức moderate trong chuỗi công cụ build (glob/minimatch); cần rà soát và cập nhật khi upstream sửa.
