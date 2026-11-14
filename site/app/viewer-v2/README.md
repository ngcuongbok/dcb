# Viewer Next.js — phiên bản thử nghiệm

`/viewer-v2` là bước chuyển tiếp: Next.js dựng vỏ giao diện React, còn xử lý gallery, PTB và SelfBooth lấy nguyên từ `C:/c_photobooth/app/web-online/viewer.html` và tách ra `public/viewer-v2-assets/viewer.js` cùng `viewer.css`. Script chưa được chuyển thành các React component; không dùng phiên bản này thay `/viewer` cho đến khi hoàn tất chuyển đổi và kiểm thử.

Snapshot gốc SHA-256: `fef27862b65d4834a199a6e1e51718cf97dc58ea2d26c79ad9d3034804a01314`. Source viewer trong `app/web-online` có thể được sửa độc lập; cần đối chiếu trước mỗi lần đồng bộ, không tự ghi đè những thay đổi đó.

Kiểm tra với link thử PTB và SelfBooth còn hạn: tải gallery, ảnh gốc, ghép frame, nhiều slot, lật, preview, tải lên và gửi thu ngân, mở lại phiên, lỗi mạng, kết thúc/hết hạn. Tuyệt đối không dùng đơn thật để thử gửi. Kiểm tra bản Apps Script đã deploy có hỗ trợ các action mà source đang gọi.

Ngày 14/11/2026: bản thử đã hiện danh sách 22 ảnh ở phiên SelfBooth cũ nhưng phiên đã hết hạn chỉnh sửa. Mở tab ảnh đã ghép gọi `saveSelfBoothPreviewCard` và backend được cấu hình trả `Unsupported action`; chưa xác minh luồng PTB và chưa kiểm tra thao tác gửi. Không chuyển QR sang v2.

Kiểm thử bổ sung với phiên SelfBooth còn hạn: tải editor, 32 slot/2 tờ, đổi frame và chuyển tờ; thêm ảnh thử vào PT Card, lật và tạo preview. Mặt trước PT Card hiển thị trắng với ảnh WebP và JPG thử trên cả viewer gốc và bản v2; chưa xác định nguyên nhân, không kết luận do Next.js. Không gửi về thu ngân. Cần một phiên PTB thử và kiểm thử end-to-end trong điều kiện không ảnh hưởng vận hành.
Kiểm thử PTB với phiên thử còn ảnh: v2 và viewer gốc đều hiển thị 12 ảnh, 3 video; v2 mở ảnh và chuyển ảnh trong trình xem. Chưa kiểm thử tải file thực tế hoặc phát từng video, chưa xác minh mã Next/React cho các luồng chỉnh sửa, upload và gửi thu ngân.
