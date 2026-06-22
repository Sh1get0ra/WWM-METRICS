# Phong Yến Kế | WWMetrics
### 風燕計 / Where Winds Metrics / 燕云计 / 연운계

[![Cloudflare Pages](https://img.shields.io/badge/Live-Cloudflare%20Pages-orange)](https://wwm-metrics.pages.dev)

**Language**:
[![日本語](https://img.shields.io/badge/-日本語-c9a45a?style=for-the-badge)](README.md)
[![English](https://img.shields.io/badge/-English-c9a45a?style=for-the-badge)](README.en.md)
[![简体中文](https://img.shields.io/badge/-简体中文-c9a45a?style=for-the-badge)](README.zh-CN.md)
[![한국어](https://img.shields.io/badge/-한국어-c9a45a?style=for-the-badge)](README.ko.md)
[![Tiếng Việt](https://img.shields.io/badge/-Tiếng_Việt-c83c2b?style=for-the-badge)](README.vi.md)

🔗 **URL công cụ**: https://wwm-metrics.pages.dev

> 📱 **Hỗ trợ di động hoàn tất** (iPhone SE 375px trở lên / Android mọi kích thước). Hỗ trợ cả PC và di động.

---

## Tổng quan

Công cụ so sánh và tối ưu hóa độ mạnh trang bị của **Yến Vân (Where Winds Meet)**.
Dựa trên chỉ số nhân vật nhập từ Công cụ Dữ liệu Chính thức Yến Vân và công thức sát thương của Yến Vân để tính **Chỉ số Võ cách**.
Đề xuất trang bị tối ưu, so sánh từng món trang bị để hướng dẫn cải thiện trang bị.

---

## Chức năng chính

### 📥 Nhập dữ liệu
- **Nhập thông tin nhân vật một chạm** từ Công cụ Dữ liệu Chính thức Yến Vân → Thông tin trang bị bao gồm Điều luật·Định âm / Tâm pháp đang trang bị, v.v. được phản ánh đồng thời.
- Hiển thị Chỉ số Võ cách ngay lập tức không cần nhập tay.

### 🏯 Chỉ số Võ cách
- Chỉ số tính giá trị kỳ vọng sát thương dựa trên chỉ số nhân vật, sử dụng hệ số kỹ năng cố định chung cho tất cả người chơi.
- Bằng cách cố định các chênh lệch như hệ số sát thương kỹ năng võ học, cho phép so sánh độ mạnh tuyệt đối của trang bị.

### 🪶 Đối chiếu Trang bị
- Xem trước biến động Chỉ số Võ cách giữa trang bị đã nhập và trang bị mới theo thời gian thực.
- Hỗ trợ chức năng nhập OCR tiện lợi cho trang bị mới (hỗ trợ tất cả ngôn ngữ).

### 🧘 Đối chiếu Tâm pháp
- Danh sách hiệu ứng theo Tier + Hiệu ứng tâm pháp chuyên thuộc tính võ học được phản ánh.
- Hiện tại, ngoài T2/T5 thì khó tính điểm chính xác cho các hiệu ứng khác, nên nhân với hệ số sát thương toàn cục.

### 📊 Bảng phân tích
- **Bảng xếp hạng kỳ vọng**: Xem bảng xếp hạng kỳ vọng của Điều luật/Định âm dựa trên trang bị hiện tại.
- **Tối ưu hóa Trang bị**: Đề xuất/áp dụng trang bị tối ưu từ trạng thái hiện tại.

### 📈 Lịch sử Chỉ số Võ cách
- Hiển thị lần nhập trước đây và biến động Chỉ số Võ cách bằng biểu đồ.
- Hỗ trợ nhiều nhân vật, chuyển đổi thời gian (toàn bộ / 30 ngày / 7 ngày).

### 💾 Lưu Cài đặt sẵn
- Lưu / Tải / Xóa đa khe.
- Lưu cấu hình trang bị đang thử nghiệm + giá trị cơ sở.

### 📡 OBS Share
- Phát hành URL overlay có thể tùy chỉnh màu sắc để phát sóng thông tin chỉ số trên OBS.

### 🌐 Giao diện đa ngôn ngữ
- 日本語 / English / 简体中文 / 한국어 / Tiếng Việt — Hỗ trợ toàn bộ UI·dữ liệu.
- ※ Nếu phát hiện cách diễn đạt sai, vui lòng liên hệ chúng tôi.

---

## Tiêu chuẩn phán định Tier Chỉ số Võ cách

Phán định theo tỷ lệ giữa Chỉ số Võ cách được tính từ trang bị áp dụng tại thời điểm nhập và Chỉ số Võ cách dựa trên trang bị tối ưu hóa.
Tier Chỉ số Võ cách được tự động phán định khi nhập, không thay đổi cho đến khi nhập lại.

| Tier | Tỷ lệ |
|---|---|
| **SS** | Từ 95% giá trị tối đa trở lên |
| **S** | Từ 90% trở lên |
| **A** | Từ 80% trở lên |
| **B** | Từ 65% trở lên |
| **C** | Dưới mức trên |

---

## Hiệu ứng được phản ánh trong tính toán

- Chỉ số cơ bản của trang bị (Sức tấn công Ngoại công / Sức tấn công theo thuộc tính võ học, v.v.)
- Hiệu ứng Điều luật / Định âm
- Hiệu ứng thiên phú võ học (Giới hạn tỷ lệ chí mạng +Δ, Tăng cường tấn công/xuyên thấu/sát thương thuộc tính theo võ học, v.v.)
- Hiệu ứng Tier Tâm pháp (T2/T5 = hiển thị phản ánh, T0/T1/T3/T4/T6 = cộng ẩn)
- Hiệu ứng bộ 2 món (cộng dồn khi trang bị 2 món)
- Hiệu ứng bộ 4 món (cộng cố định +100 khi trang bị 4 món, phân bổ đều cho mỗi trang bị)
- Chỉ số cơ bản (Thể/Kình/Ngự/Mẫn/Thế) → Phái sinh (Chỉ số cơ bản · Tỷ lệ phán định)
- Chỉ số cơ bản nhân vật (Thiên phú / Ngũ âm Thái bình lạc / Quan âm, v.v.)

---

## Hiệu ứng không phản ánh trong tính toán

- Định âm chuyên PvP (Định âm khe 6) — chỉ hiển thị, không đóng góp vào tính toán

---

## Về sai lệch với chỉ số trong game

Chỉ số Võ cách được tính bằng cách giả định chỉ số cơ bản nhân vật (Thiên phú / Ngũ âm Thái bình lạc / Quan âm, v.v.) đã **đạt mức tối đa chung cho tất cả người chơi**.
Nếu nhân vật chưa đạt tối đa, giá trị trên công cụ có thể cao hơn giá trị trong game thực tế.
Đây là thiết kế để cho phép so sánh độ mạnh tuyệt đối của trang bị.

---

## Cách dùng

1. **Mở công cụ** → https://wwm-metrics.pages.dev
2. Nhấn nút **📥** → Nhập dữ liệu từ Công cụ Dữ liệu Chính thức Yến Vân.
3. Thử và xác nhận các cấu hình khác nhau với dữ liệu đã nhập!

---

## Công nghệ sử dụng

- **HTML / CSS / JavaScript** (không framework)
- Lưu trữ trên Cloudflare Pages
- LocalStorage cho dữ liệu nhập, giá trị cơ sở và cài đặt sẵn

---

## Từ khóa

`Yến Vân` `Where Winds Meet` `WWM` `Chỉ số Võ cách` `Martial Index` `tính sát thương` `giá trị kỳ vọng` `tối ưu hóa trang bị` `Điều luật` `Định âm` `tâm pháp` `thiên phú võ học` `風燕伝` `武格指数` `燕云十六声` `풍연전`
