import { useApiUrl, useCustom } from "@refinedev/core";
import { Show } from "@refinedev/antd";
import { Typography, Card, Row, Col, Table, Tag, Space, Modal, Input, message, Drawer } from "antd";
import { KeyOutlined } from "@ant-design/icons";
import { useState } from "react";

const { Title, Text } = Typography;

export const SiteShow = ({
  drawerProps,
  id,
  queryResult,
}: any) => {
  const { data, isLoading } = queryResult || {};
  const record = data?.data;

  const apiUrl = useApiUrl();
  
  // Thực tế call API /admin/v1/sites/:siteId/api-keys
  const customQuery: any = useCustom({
    url: `${apiUrl}/sites/${id}/api-keys`,
    method: "get",
    queryOptions: {
      enabled: !!id,
    },
  });

  const apiKeys = customQuery?.data?.data || customQuery?.query?.data?.data || [];

  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <Drawer {...drawerProps} width={800} zIndex={1001}>
      <Show isLoading={isLoading}>
      <Row gutter={[24, 24]}>
        {/* Cột trái: Thông tin Site */}
        <Col xs={24} md={8}>
          <Card bordered={false} styles={{ body: { padding: "24px" } }}>
            <Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>
              Thông tin Website
            </Title>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <Text type="secondary" style={{ fontSize: "12px", textTransform: "uppercase" }}>Tên Website</Text>
                <div style={{ fontWeight: 500, fontSize: "15px" }}>{record?.name || "N/A"}</div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: "12px", textTransform: "uppercase" }}>Primary Domain</Text>
                <div style={{ fontWeight: 500, fontSize: "15px" }}>{record?.primary_domain || "N/A"}</div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: "12px", textTransform: "uppercase" }}>Site ID (UUID)</Text>
                <div style={{ fontFamily: "monospace", color: "#7367f0", background: "rgba(115,103,240,0.1)", padding: "4px 8px", borderRadius: "4px", display: "inline-block", marginTop: "4px" }}>
                  {record?.id || "N/A"}
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: "12px", textTransform: "uppercase" }}>Chế độ Thử thách</Text>
                <div style={{ marginTop: "4px" }}>
                  {(() => {
                    const m = record?.challenge_mode || "auto";
                    if (m === "slider") return <Tag color="purple">🧩 SLIDER PUZZLE</Tag>;
                    if (m === "pow") return <Tag color="orange">⚡ PROOF OF WORK</Tag>;
                    if (m === "none") return <Tag color="cyan">👻 TÀNG HÌNH (INVISIBLE)</Tag>;
                    return <Tag color="blue">🛡️ TỰ ĐỘNG (ADAPTIVE)</Tag>;
                  })()}
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: "12px", textTransform: "uppercase" }}>Trạng thái</Text>
                <div style={{ marginTop: "4px" }}>
                  <Tag color={record?.status === "active" ? "success" : "default"}>
                    {record?.status?.toUpperCase() || "N/A"}
                  </Tag>
                </div>
              </div>
            </div>
          </Card>
        </Col>

        {/* Cột phải: API Keys & Logs */}
        <Col xs={24} md={16}>
          <Card 
            bordered={false} 
            styles={{ body: { padding: "24px" } }}
            title={
              <Space>
                <KeyOutlined style={{ color: "#7367f0" }} />
                <span style={{ fontWeight: 600 }}>API Keys</span>
              </Space>
            }
          >
            <Table
              dataSource={apiKeys}
              rowKey="id"
              pagination={false}
              columns={[
                {
                  title: "Tiền tố (Prefix)",
                  dataIndex: "key_prefix",
                  render: (val) => <Text code>{val}****************</Text>
                },
                {
                  title: "Nhãn (Label)",
                  dataIndex: "label",
                  render: (val) => <Text strong>{val || "Chưa đặt tên"}</Text>
                },
                {
                  title: "Trạng thái",
                  dataIndex: "revoked_at",
                  render: (val) => (
                    <Tag color={val ? "default" : "success"}>
                      {val ? "ĐÃ THU HỒI" : "HOẠT ĐỘNG"}
                    </Tag>
                  )
                },
                {
                  title: "Ngày tạo",
                  dataIndex: "created_at",
                  render: (val) => new Date(val).toLocaleDateString("vi-VN")
                }
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Modal 
        title="Tạo API Key mới" 
        open={isModalOpen} 
        onOk={() => {
          message.success("Đã tạo API Key mới!");
          setIsModalOpen(false);
        }} 
        onCancel={() => setIsModalOpen(false)}
        okText="Generate"
        okButtonProps={{ style: { backgroundColor: "#7367f0" } }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">API Key chỉ được hiển thị 1 lần duy nhất. Vui lòng copy và lưu trữ an toàn.</Text>
        </div>
        <Input placeholder="Nhập Label (VD: Production Server)" size="large" />
      </Modal>
      </Show>
    </Drawer>
  );
};
