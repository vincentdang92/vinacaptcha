import { useState } from "react";
import { Edit } from '@refinedev/antd';
import { useApiUrl, useCustom, useCustomMutation } from "@refinedev/core";
import {
  Form,
  Input,
  Select,
  Typography,
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Alert,
  message,
  Divider,
} from "antd";
import {
  KeyOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  CodeOutlined,
} from "@ant-design/icons";

const { Text, Title } = Typography;

import { Drawer } from "antd";

export const SiteEdit = ({
  drawerProps,
  formProps,
  saveButtonProps,
  id: siteId,
}: any) => {
  const apiUrl = useApiUrl();
  const { mutate } = useCustomMutation();
  const [newLabel, setNewLabel] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  // Fetch API Keys của site
  const customQuery: any = useCustom({
    url: `${apiUrl}/sites/${siteId}/api-keys`,
    method: "get",
    queryOptions: {
      enabled: !!siteId,
    },
  });

  const apiKeys = customQuery?.data?.data || customQuery?.query?.data?.data || [];
  const refetch = () => {
    if (customQuery?.refetch) customQuery.refetch();
    else if (customQuery?.query?.refetch) customQuery.query.refetch();
  };

  const handleCreateApiKey = () => {
    const labelToUse = newLabel.trim() || `API Key (${new Date().toLocaleDateString("vi-VN")})`;
    mutate(
      {
        url: `${apiUrl}/sites/${siteId}/api-keys`,
        method: "post",
        values: { label: labelToUse },
      },
      {
        onSuccess: (res: any) => {
          setCreatedSecret(res.data.key);
          setNewLabel("");
          refetch();
          message.success("Tạo khóa API thành công!");
        },
      }
    );
  };

  const handleRevokeApiKey = (keyId: string) => {
    Modal.confirm({
      title: "Xác nhận thu hồi khóa API",
      content: "Bạn có chắc chắn muốn vô hiệu hóa khóa này? Mã nhúng widget đang dùng khóa này sẽ ngừng hoạt động ngay lập tức!",
      okText: "Thu hồi khóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: () => {
        mutate(
          {
            url: `${apiUrl}/sites/${siteId}/api-keys/${keyId}`,
            method: "delete",
            values: {},
          },
          {
            onSuccess: () => {
              refetch();
              message.success("Đã thu hồi khóa API!");
            },
          }
        );
      },
    });
  };

  const handleCopySecret = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("Đã sao chép khóa bí mật vào clipboard!");
  };

  return (
    <Drawer {...drawerProps} width={720} zIndex={1001}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {/* Form chỉnh sửa Site */}
        <Edit saveButtonProps={saveButtonProps}>
          <Form {...formProps} layout="vertical">
          <Form.Item
            label="Tên Website"
            name="name"
            rules={[{ required: true, message: "Vui lòng nhập tên website" }]}
          >
            <Input size="large" />
          </Form.Item>

          <Form.Item
            label="Nền tảng (Platform)"
            name="platform"
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
                >
                  <Input size="large" />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item
            label="Chế độ Thử thách (Challenge Mode)"
            name="challenge_mode"
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

          <Form.Item label="Trạng thái" name="status">
            <Select
              size="large"
              options={[
                { label: "Hoạt động (Active)", value: "active" },
                { label: "Tạm dừng (Suspended)", value: "suspended" },
              ]}
            />
          </Form.Item>
        </Form>
      </Edit>

      {/* Quản lý danh sách API Keys theo UI_GUIDELINES.md mục 4 */}
      {siteId && (
        <Card bordered={false}>
          <Title level={5} style={{ margin: "0 0 8px 0" }}>
            <KeyOutlined style={{ marginRight: 8, color: "#405189" }} />
            Khóa API Secrets
          </Title>
          <Text type="secondary" style={{ fontSize: "13px", display: "block", marginBottom: 20 }}>
            Widget truyền key qua header <code>X-Api-Key</code> khi khởi tạo. Backend của bạn dùng key này gán vào field <code>secret</code> khi gọi API xác thực (siteverify).
          </Text>

          {/* Tạo Key mới */}
          <Space style={{ marginBottom: 20, width: "100%" }}>
            <Input
              placeholder="Nhập nhãn nhận diện (VD: Production, Mobile App, Staging)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              style={{ width: 340 }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreateApiKey}
              style={{ backgroundColor: "#0ab39c" }}
            >
              Tạo Khóa Mới
            </Button>
          </Space>

          {/* Bảng API Keys */}
          <Table dataSource={apiKeys} rowKey="id" pagination={false}>
            <Table.Column
              dataIndex="key_prefix"
              title="TIỀN TỐ (PREFIX)"
              render={(prefix: string) => (
                <Text code strong style={{ color: "#405189", fontSize: "13px" }}>
                  {prefix}••••••••••••
                </Text>
              )}
            />

            <Table.Column
              dataIndex="label"
              title="NHÃN (LABEL)"
              render={(label: string) => <Text strong>{label || "Chưa đặt tên"}</Text>}
            />

            <Table.Column
              dataIndex="revoked_at"
              title="TRẠNG THÁI"
              render={(revokedAt: string | null) => (
                <Tag color={revokedAt ? "default" : "success"}>
                  {revokedAt ? "ĐÃ THU HỒI" : "HOẠT ĐỘNG"}
                </Tag>
              )}
            />

            <Table.Column
              dataIndex="created_at"
              title="NGÀY TẠO"
              render={(val: string) => (
                <Text type="secondary" style={{ fontSize: "12px" }}>
                  {new Date(val).toLocaleString("vi-VN")}
                </Text>
              )}
            />

            <Table.Column
              title="HÀNH ĐỘNG"
              align="center"
              render={(_, record: any) =>
                !record.revoked_at && (
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleRevokeApiKey(record.id)}
                  >
                    Thu hồi
                  </Button>
                )
              }
            />
          </Table>

          <Divider style={{ margin: "24px 0" }} />

          {/* Hướng dẫn nhúng Script Widget */}
          <div style={{ backgroundColor: "#1e293b", padding: 16, borderRadius: 8 }}>
            <Text strong style={{ color: "#38bdf8", display: "block", marginBottom: 8 }}>
              <CodeOutlined style={{ marginRight: 6 }} />
              Mã nhúng Widget HTML (&lt; 15KB)
            </Text>
            <Text style={{ color: "#94a3b8", fontSize: "12px", display: "block", marginBottom: 12 }}>
              Nhúng đoạn mã này vào trang web để kích hoạt hệ thống bẫy bot và cấp token xác thực:
            </Text>
            <pre style={{ margin: 0, color: "#f8fafc", fontFamily: "monospace", fontSize: "12px", overflowX: "auto" }}>
{`<!-- VinaCaptcha Container -->
<div id="vina-captcha-container"></div>

<!-- VinaCaptcha Script (< 15KB gzip) -->
<script src="${window.location.origin}/widget/vina-captcha.js"></script>
<script>
  new VinaCaptcha("vina-captcha-container", "YOUR_API_SECRET_KEY");
</script>`}
            </pre>
          </div>
        </Card>
      )}

      {/* Modal hiển thị khóa bí mật vừa tạo */}
      <Modal
        open={!!createdSecret}
        title="🔑 Khóa API Bí Mật Vừa Được Tạo"
        onOk={() => setCreatedSecret(null)}
        onCancel={() => setCreatedSecret(null)}
        okText="Tôi đã lưu khóa này"
        cancelButtonProps={{ style: { display: "none" } }}
      >
        <Alert
          message="Lưu ý bảo mật quan trọng"
          description="Khóa này chỉ hiển thị duy nhất 1 lần lúc này. Sau khi đóng cửa sổ, bạn sẽ không thể xem lại khóa đầy đủ."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
          }}
        >
          <Text code strong style={{ fontSize: "14px", color: "#405189", wordBreak: "break-all" }}>
            {createdSecret}
          </Text>
          <Button
            type="primary"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopySecret(createdSecret || "")}
            style={{ marginLeft: 12, backgroundColor: "#0ab39c" }}
          >
            Copy
          </Button>
        </div>
      </Modal>
      </Space>
    </Drawer>
  );
};
