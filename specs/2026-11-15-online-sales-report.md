# Feature Spec: báo cáo bán hàng online qua Cloudflare D1

## User Request
Đồng bộ dữ liệu bán hàng vào D1 và cho admin xem doanh thu, đơn hàng, ca và nhân viên trên địa chỉ demo Cloudflare.

## Goal
Một bản báo cáo online chỉ đọc, có thời điểm đồng bộ và dùng cách tính tương ứng báo cáo tại máy.

## In Scope
- Đồng bộ dữ liệu cần thiết từ hệ thống bán hàng hiện có, hỗ trợ lịch sử và thay đổi sau đó.
- D1 lưu dữ liệu báo cáo; đăng nhập mật khẩu dành cho admin.
- Hiển thị doanh thu, đơn/key, ca và nhân viên, với bộ lọc ngày.
- Các tab tổng quan, nhân viên và ca làm việc.

## Out Of Scope
- Thay Sheets làm nguồn vận hành, ghi ngược đơn, sửa ca, đổi key hoặc thao tác thu ngân.
- Tích điểm và các thay đổi viewer hoặc Github Pages hiện có.

## Existing Behavior To Preserve
- Máy chụp và thu ngân hoạt động khi mạng, D1 hoặc đồng bộ gặp lỗi.
- Tổng quan tại máy tính doanh thu từ key `used`; báo cáo ca sử dụng giá trị bán được ghi nhận trong ca (kể cả key chưa dùng). Các con số khác định nghĩa phải được ghi rõ.
- Giao diện và chức năng hiện có của trang chủ và viewer Cloudflare.

## Acceptance Criteria
- [ ] Chưa cấu hình đăng nhập thì trang/API báo cáo từ chối, kể cả truy cập trực tiếp.
- [ ] Chỉ tài khoản admin đã đăng nhập được xem báo cáo.
- [ ] Đồng bộ có xác thực riêng, có retry và không xóa dữ liệu khi snapshot lỗi hoặc không đầy đủ.
- [ ] Báo cáo theo ngày khớp định nghĩa tại máy, không nhân đôi đơn có nhiều key.
- [ ] Có thời gian đồng bộ gần nhất và cảnh báo khi nguồn ngừng cập nhật.
- [ ] Không đưa key đang hoạt động, số điện thoại khách hoặc thông tin không cần thiết vào D1.
- [ ] Thử cả đường lỗi/không có quyền trước khi triển khai và kiểm tra bằng dữ liệu thật có đối chiếu.

## Verification Plan
- Kiểm tra bảo vệ API, tính nhất quán snapshot, thử sync lặp, mất mạng và khởi động lại.
- Đối chiếu tổng số, số lượng đơn, doanh thu và ca với nguồn thực tế theo khoảng ngày.
- Chạy build và kiểm tra giao diện desktop/mobile, không can thiệp luồng bán hàng thật.

## Rollback
Tắt cấu hình đồng bộ, bỏ binding/route của báo cáo; giữ Sheets và dữ liệu tại máy làm nguồn vận hành.
