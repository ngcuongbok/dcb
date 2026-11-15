# Feature Spec: Tổng quan quản trị online

## User Request
Đưa thông tin từ /overview lên admin report, giao diện chuyên nghiệp, responsive và có hiệu ứng.
## Goal
Chủ quán xem số liệu kinh doanh, key, ca và nhân viên theo khoảng ngày trên desktop/mobile.
## In Scope
- Đồng bộ bổ sung các trường báo cáo cần thiết, không đồng bộ mã key hay dữ liệu khách nhạy cảm.
- Đối chiếu công thức /overview, phân biệt doanh thu theo ngày bán và theo key đã dùng.
- Tổng hợp doanh thu theo ngày, loại dịch vụ, phương thức thanh toán và tình trạng key, nhân viên, ca.
- Giao diện responsive, chuyển động nhẹ, hỗ trợ giảm chuyển động và trạng thái tải/lỗi.
## Out Of Scope
- Thay đổi luồng thu ngân/chụp/in, nguồn Sheets hoặc thông tin thành viên và MXH chưa đồng bộ.
## Existing Behavior To Preserve
- Xác thực admin, đăng xuất, route /admin và API, đồng bộ snapshot an toàn, viewer và trang chủ.
## Acceptance Criteria
- [ ] Số liệu có định nghĩa rõ và đối chiếu được nguồn; không giả định số liệu chưa có.
- [ ] Giao diện dùng được trên mobile; lọc ngày, biểu đồ, tab nhân viên/ca hoạt động.
- [ ] Đồng bộ cũ vẫn hoạt động trong quá trình nâng cấp; snapshot lỗi không công bố.
## Verification Plan
- [ ] Kiểm thử tính tổng, bảo mật, đồng bộ và build; so sánh dữ liệu thực không lộ thông tin khách.
- [ ] Kiểm tra giao diện desktop/mobile và hoạt động sau triển khai.
## Rollback
Khôi phục commit Worker và collector từ backup; giữ dữ liệu Sheets và snapshot cũ.
