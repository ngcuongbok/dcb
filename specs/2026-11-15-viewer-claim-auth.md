# Đặc tả: đăng nhập và nhận tài khoản từ viewer

## Mục tiêu
Admin đăng nhập xem báo cáo bán hàng online; khách nhận tài khoản từ phiên viewer và đặt mật khẩu để xem lịch sử gắn với số điện thoại thu ngân đã nhập.

## Phạm vi
- Vai trò admin, nhân viên, khách; chỉ admin xem báo cáo. Quán hiện có một cơ sở.
- Người đầu tiên claim phiên viewer nhận tài khoản của số điện thoại tương ứng; không xác minh SMS ở giai đoạn này theo yêu cầu. Các phiên cũ cùng số được hiển thị khi liên kết được đáng tin cậy.
- Đồng bộ qua kênh riêng có xác thực; D1 là bản sao, Sheets vẫn là nguồn vận hành. Admin đổi mật khẩu thủ công.
- Không dùng Firebase hoặc Cloudflare Zero Trust. Thiết kế chừa khả năng thêm xác minh SMS và nhiều cơ sở sau này.

## Ngoài phạm vi
- Sửa viewer GitHub Pages hiện tại, thay đổi vận hành thu ngân, key, chụp hoặc in; cài đặt tính điểm và chính sách hạng.

## Cần giữ nguyên
- Trang chủ và viewer Cloudflare hoạt động như cũ; đồng bộ thất bại không ảnh hưởng hoạt động tại máy.
- Không tiết lộ dữ liệu báo cáo và lịch sử khách khi chưa có quyền; không tự cấp admin dựa vào email chưa được xác minh.

## Tiêu chí nghiệm thu
- [ ] Mật khẩu lưu dưới dạng băm chậm có muối, giới hạn thử đăng nhập và phiên đăng nhập an toàn.
- [ ] Claim đầu tiên thực hiện nguyên tử, không gán sai khi dữ liệu số điện thoại hay đối chiếu phiên chưa rõ.
- [ ] Tài khoản khách chỉ xem lịch sử của mình; nhân viên không truy cập báo cáo; admin mới xem được báo cáo và quản lý tài khoản.
- [ ] Có thời điểm đồng bộ, xử lý dữ liệu cũ không đủ thông tin và lỗi đồng bộ an toàn.
- [ ] Kiểm thử quyền truy cập, claim đồng thời, lịch sử cũ, truy cập trực tiếp và các luồng viewer cũ.

## Rủi ro đã chấp nhận
Bất kỳ người nào có link phiên đều có thể claim trước và xem lịch sử gắn số tương ứng; xác thực số điện thoại được dự kiến bổ sung sau.
