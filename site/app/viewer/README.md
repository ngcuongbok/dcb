# Viewer Next.js cho Cloudflare

Trong bản build Cloudflare, `/viewer/` được dựng bởi Next.js; HTML của GitHub Pages trong thư mục gốc `viewer/` không thay đổi. Script build copy `viewer/archive.html` và chuyển output Next.js sang `out/viewer/index.html`, để các đường dẫn QR và tham số cũ tiếp tục hoạt động.

Đây là bước chuyển tiếp: `page.jsx` là giao diện React, còn JavaScript xử lý PTB/SelfBooth và CSS được tách nguyên từ `C:/c_photobooth/app/web-online/viewer.html`. Chưa chuyển toàn bộ xử lý thành React components. Nguồn gốc có thể thay đổi độc lập; không ghi đè tự động. Snapshot SHA-256: `fef27862b65d4834a199a6e1e51718cf97dc58ea2d26c79ad9d3034804a01314`.

Đã so sánh trên bản build local bằng phiên thử: PTB hiện 12 ảnh, 3 video và có thể mở/chuyển ảnh; SelfBooth hiện editor và cho phép chọn frame, chuyển tờ, chọn ảnh, lật PT Card. Chưa kiểm thử toàn bộ tải file, phát video, upload lên Drive hoặc gửi thu ngân. Với ảnh thử, preview mặt trước PT Card hiện trắng trên cả bản cũ và mới; nguyên nhân chưa xác định. Phiên cũ khác khi mở ảnh đã ghép gọi `saveSelfBoothPreviewCard`, backend trả Unsupported action mặc dù source Apps Script cục bộ có action này. Cần kiểm tra deployment Apps Script riêng, không tự deploy thay backend.

Rollback Cloudflare bằng cách khôi phục deployment trước của Worker `dcb`. Việc này không sửa GitHub Pages. Luôn test QR thật cả PTB/SelfBooth sau khi deploy và không gửi/in đơn thật trong lúc thử.
