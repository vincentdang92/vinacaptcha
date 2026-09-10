# UI_GUIDELINES.md — Admin Dashboard (Refine + React 19 + Vite)

Đọc file này TRƯỚC khi viết bất kỳ page/component nào cho dashboard. Mục tiêu: agent code nhiều page ở nhiều buổi khác nhau vẫn ra 1 bộ UI đồng nhất, không phải style thủ công từng trang.

## 1. UI Kit — chốt

- **`@refinedev/antd` + `antd` v6**, không mix thêm UI kit khác (không Tailwind component riêng, không MUI, không tự viết component thay thế cái Ant Design đã có).
- Ant Design v6 support React 19 chính thức, không cần patch package (`@ant-design/v5-patch-for-react-19` chỉ cần nếu lỡ dùng v5 — dự án này dùng thẳng v6 nên bỏ qua).
- Layout dùng `ThemedLayoutV2` của `@refinedev/antd` — không tự viết layout sidebar/topbar riêng.

## 2. Design tokens — khai báo 1 chỗ, dùng ConfigProvider

KHÔNG hardcode màu/spacing trực tiếp trong từng component (`style={{ color: '#1677ff' }}`) — mọi giá trị phải qua theme token của Ant Design, khai báo tập trung ở `dashboard/src/theme.ts`:

```ts
// dashboard/src/theme.ts
export const themeTokens = {
  token: {
    colorPrimary: '#1677ff',      // hành động chính (nút submit, link)
    colorSuccess: '#52c41a',      // trạng thái pass/active
    colorWarning: '#faad14',      // trạng thái medium risk/pending
    colorError: '#ff4d4f',        // trạng thái fail/revoked/suspended
    borderRadius: 6,
    fontFamily: `-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
  },
};
```
- Áp dụng qua `<ConfigProvider theme={themeTokens}>` bọc ngoài `<Refine>` ở `App.tsx`.
- Muốn đổi màu chủ đạo toàn hệ thống → sửa 1 chỗ này, KHÔNG đi sửa từng file.

## 3. Typography

| Cấp | Component Ant Design | Dùng khi |
|---|---|---|
| Tiêu đề trang | `<Typography.Title level={3}>` | Đầu mỗi page (VD "Danh sách Site") |
| Tiêu đề section trong page | `<Typography.Title level={5}>` | Chia nhóm trong 1 page (VD "API Keys", "Thống kê") |
| Text thường | `<Typography.Text>` | Nội dung, mô tả |
| Text phụ/mờ | `<Typography.Text type="secondary">` | Timestamp, ghi chú phụ |

- Không dùng thẻ `<h1>-<h6>` hay `<p>` thuần — luôn qua `Typography` component để ăn theme token tự động.
- Không tự chỉnh `font-size` bằng inline style — nếu cỡ có sẵn không đủ, thêm token mới vào `theme.ts`, không vá tại chỗ.

## 4. Layout & cấu trúc mỗi page (List/Create/Edit/Show)

Theo đúng pattern Refine đã định nghĩa sẵn — mỗi resource (`sites`, `api-keys`, `verification-logs`...) có đúng 4 loại page này, không tự sáng tạo cấu trúc khác:

- **List**: `<List>` wrapper (nút "Create" tự động ở góc phải trên) + `<Table>` bên trong, filter/search nằm trên table, pagination dùng mặc định của Refine.
- **Create/Edit**: `<Create>`/`<Edit>` wrapper + `<Form>` bên trong, dùng `useForm` từ `@refinedev/antd`, không tự quản lý form state tay.
- **Show**: `<Show>` wrapper, hiển thị field dạng `<Descriptions>` cho thông tin tĩnh, `<Table>` con nếu có danh sách liên quan (VD trang Show của 1 site hiển thị luôn bảng API keys của site đó).
- Breadcrumb: để Refine tự sinh từ `resources` config, không tự viết breadcrumb tay.

## 5. Status tag — mapping màu cố định (dùng lại ở mọi nơi hiển thị trạng thái)

Tránh tình trạng mỗi trang tự chọn màu khác nhau cho cùng 1 ý nghĩa trạng thái:

| Trạng thái | Tag color (Ant Design) | Nguồn |
|---|---|---|
| `active` (site/account) | `success` (xanh lá) | SCHEMA.md `site_status`/`account_status` |
| `suspended` | `error` (đỏ) | SCHEMA.md |
| API key còn hiệu lực | `success` | `revoked_at IS NULL` |
| API key đã revoke | `default` (xám) | `revoked_at IS NOT NULL` |
| `pass` (verification_logs) | `success` | SCHEMA.md `verification_result` |
| `fail` | `error` | |
| `expired` | `warning` (vàng cam) | |
| `challenge_type: none` | `default` | |
| `challenge_type: slider` | `processing` (xanh dương) | |
| `challenge_type: pow` | `warning` | |

- Định nghĩa 1 hàm dùng chung `getStatusTagProps(status: string)` trong `dashboard/src/utils/status-tags.ts`, mọi page import từ đây — không copy-paste mapping màu vào từng component.

## 6. Spacing & responsive

- Dùng hệ spacing của Ant Design (`Space`, `Row`/`Col` với `gutter`), không tự đặt `margin`/`padding` bằng số tuỳ ý.
- Breakpoint theo mặc định Ant Design (`xs/sm/md/lg/xl/xxl`) — dashboard nội bộ ưu tiên desktop, nhưng vẫn phải dùng `Col` responsive thay vì fix width cứng, để không vỡ layout ở màn hình nhỏ hơn.

## 7. Việc KHÔNG được làm

- Không tự viết CSS module hoặc styled-component riêng để "trang này nhìn khác cho đẹp hơn" — mọi tuỳ biến phải qua `theme.ts` (mục 2) để áp dụng toàn hệ thống.
- Không dùng inline `style={{}}` cho màu sắc/font — chỉ chấp nhận cho spacing nhỏ lẻ khi Ant Design không có prop tương ứng (hiếm khi cần).
- Không tự thêm icon set khác ngoài `@ant-design/icons` (đã đi kèm sẵn, tránh tăng bundle vô ích).
- Không tạo page mới mà không theo 1 trong 4 cấu trúc List/Create/Edit/Show ở mục 4, trừ khi có lý do rõ ràng (VD trang Dashboard tổng quan/stats) — trường hợp đó phải note lại trong PR.

## 8. Trạng thái tài liệu

- [x] AGENTS.md
- [x] ARCHITECTURE.md
- [x] SCHEMA.md
- [x] API_CONTRACT.md
- [x] THREAT_INTEL_SOURCES.md
- [x] UI_GUIDELINES.md — file này
