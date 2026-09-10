import { Create } from "@refinedev/antd";
import { Form, Input, Select, Typography, Alert, Drawer } from "antd";

const { Text } = Typography;

export const SiteCreate = ({
  drawerProps,
  formProps,
  saveButtonProps,
}: any) => {
  return (
    <Drawer {...drawerProps} width={600} zIndex={1001}>
      <Create saveButtonProps={saveButtonProps}>
        <Alert
          message="Cấp phép nhúng Captcha"
          description="Khai báo thông tin tên website và tên miền được phép gọi API cấp token (/v1/issue). Mọi domain không khớp danh sách sẽ bị từ chối."
          type="info"
          showIcon
          style={{ marginBottom: 24, borderRadius: 6 }}
        />

        <Form {...formProps} layout="vertical">
          <Form.Item
            label="Tên Website / Dịch vụ"
            name="name"
            rules={[{ required: true, message: "Vui lòng nhập tên website" }]}
          >
            <Input placeholder="Ví dụ: Cổng thanh toán, Hệ thống Đăng nhập" size="large" />
          </Form.Item>

          <Form.Item
            label="Nền tảng (Platform)"
            name="platform"
            initialValue="web"
            rules={[{ required: true }]}
          >
            <Select
              size="large"
              options={[
                { label: "🌐 Web Browser", value: "web" },
                { label: "🍏 iOS Native App", value: "ios" },
                { label: "🤖 Android Native App", value: "android" },
              ]}
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.platform !== currentValues.platform}
          >
            {({ getFieldValue }) => {
              const platform = getFieldValue("platform");
              const isWeb = platform === "web" || !platform;
              return (
                <Form.Item
                  label={isWeb ? "Tên miền chính (Primary Domain)" : "Bundle ID / Package Name chính"}
                  name="primary_domain"
                  rules={[{ required: true, message: isWeb ? "Vui lòng nhập tên miền chính" : "Vui lòng nhập Bundle ID" }]}
                  extra={
                    <Text type="secondary" style={{ fontSize: "12px" }}>
                      {isWeb 
                        ? "Chỉ nhập domain (VD: nhanhoa.com hoặc localhost). Không nhập http:// hoặc đường dẫn con."
                        : "Nhập Bundle ID (iOS) hoặc Package Name (Android). VD: com.yourcompany.app"}
                    </Text>
                  }
                >
                  <Input placeholder={isWeb ? "VD: nhanhoa.com hoặc localhost" : "VD: com.yourcompany.app"} size="large" />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item
            label="Chế độ Thử thách (Challenge Mode)"
            name="challenge_mode"
            initialValue="auto"
            extra={
              <Text type="secondary" style={{ fontSize: "12px" }}>
                Chọn cách thức Captcha kiểm tra người dùng trên website này.
              </Text>
            }
          >
            <Select
              size="large"
              options={[
                { label: "🛡️ Tự động thích ứng theo Risk Score (Tàng hình / Kéo hình / PoW)", value: "auto" },
                { label: "👻 Luôn Tàng hình (Invisible Score Only - Không popup)", value: "none" },
                { label: "🧩 Luôn yêu cầu Kéo ghép hình (Slider Puzzle)", value: "slider" },
                { label: "⚡ Luôn yêu cầu Thuật toán ngầm (Proof of Work)", value: "pow" },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="Trạng thái kích hoạt"
            name="status"
            initialValue="active"
          >
            <Select
              size="large"
              options={[
                { label: "Hoạt động (Active)", value: "active" },
                { label: "Tạm dừng (Suspended)", value: "suspended" },
              ]}
            />
          </Form.Item>
        </Form>
      </Create>
    </Drawer>
  );
};
