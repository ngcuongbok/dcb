# Trang chủ DiciiBooth và viewer — Cloudflare Pages

Nhánh này chỉ triển khai trang chủ Next.js xuất tĩnh và viewer hiện có. Không cần D1, R2, Cloudflare Access, tài khoản blog hoặc Worker backend. Viewer và archive giữ nguyên mã trong thư mục `viewer/` gốc; build chép nguyên hai file vào thư mục xuất.

## Kết nối GitHub với Cloudflare Pages

1. Trong Cloudflare, vào **Workers & Pages → Create application → Pages → Connect to Git**; chọn repo `ngcuongbok/dcb`.
2. Trong cấu hình project chọn branch `codex/landing-viewer` để thử; root directory: `site`; build command: `npm run build`; build output directory: `out`. Cloudflare sẽ cài dependencies dựa trên package-lock.json. Dùng Node.js 22 hoặc 24 nếu cần đặt biến `NODE_VERSION`.
3. Deploy và mở URL `*.pages.dev`. Chưa thay DNS của `diciibooth.vn`.
4. Thử `/`, `/viewer/`, `/viewer/archive.html` và các link QR thật của cả PTB lẫn SelfBooth. Test xem ảnh, tải ảnh, sửa/submit cho thu ngân ở môi trường phù hợp. Kiểm tra thông số trên URL vẫn còn sau mọi chuyển hướng. Pages có thể chuyển `/viewer/index.html` sang `/viewer/` và `/viewer/archive.html` sang `/viewer/archive`; đã kiểm tra giữ query string trên Pages giả lập cục bộ, vẫn cần thử trên Pages thật và bằng QR thật.
5. Kiểm tra Facebook/TikTok, mobile, hình ảnh và nội dung. Trang chủ dùng hình minh họa AI; thay bằng hình thương hiệu thực tế khi có tài nguyên phù hợp.
6. Trước khi public domain thử nghiệm cho công cụ tìm kiếm, chặn index nó; canonical và sitemap đang dành cho `https://diciibooth.vn`. Sau khi xác nhận hoạt động, cấu hình custom domain trong Pages và chuyển DNS theo hướng dẫn Cloudflare; giữ lại bản ghi DNS cũ để rollback. Nếu dùng apex domain, Cloudflare Pages yêu cầu domain là zone trên tài khoản Cloudflare.

Trang gốc giữ Google Analytics ID hiện có. Sitemap chỉ liệt kê trang chủ. Viewer được đánh dấu không dành cho index qua robots.txt; điều này không thay thế xác thực hay bảo vệ quyền xem ảnh.

Tự build: trong `site/`, chạy `npm ci` rồi `npm run build`. Bản xem trước không tự xác nhận được backend Apps Script hay dữ liệu ảnh của khách còn truy cập được.
