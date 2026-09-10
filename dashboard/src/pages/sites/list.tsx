import { useState, useEffect } from "react";
import {
  List,
  useTable,
  EditButton,
  DeleteButton,
  ShowButton,
  DateField,
  useDrawerForm,
} from "@refinedev/antd";
import { useShow } from "@refinedev/core";
import {
  Table,
  Tag,
  Space,
  Typography,
  Card,
  Row,
  Col,
  Input,
  Tooltip,
  message,
  Button,
  Progress,
  Alert,
} from "antd";
import {
  GlobalOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  CopyOutlined,
  SearchOutlined,
  PieChartOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../config";
import { getStatusTagProps } from "../../utils/status-tags";
import { SiteCreate } from "./create";
import { SiteEdit } from "./edit";
import { SiteShow } from "./show";

const { Text, Title } = Typography;

export const SiteList = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  const {
    drawerProps: createDrawerProps,
    formProps: createFormProps,
    saveButtonProps: createSaveButtonProps,
    show: createShow,
  } = useDrawerForm({
    action: "create",
  });

  const {
    drawerProps: editDrawerProps,
    formProps: editFormProps,
    saveButtonProps: editSaveButtonProps,
    show: editShow,
    id: editId,
  } = useDrawerForm({
    action: "edit",
  });

  // Since Refine doesn't have useDrawerShow, we can use useShow and manage drawer manually
  const [showDrawerOpen, setShowDrawerOpen] = useState(false);
  const [showId, setShowId] = useState<any>(null);
  const showQueryResult = useShow({ resource: "sites", id: showId });

  const [searchTerm, setSearchTerm] = useState("");

  const dataSource = (tableProps.dataSource || []).filter((item: any) =>
    item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.primary_domain?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("Đã sao chép Site ID vào clipboard!");
  };

  const totalSites = tableProps.dataSource?.length || 0;
  const activeSites = (tableProps.dataSource || []).filter((s: any) => s.status === "active").length;

  const [quotaStatus, setQuotaStatus] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem("vinacaptcha_token");
    if (token) {
      axios
        .get(`${API_BASE_URL}/accounts/quota-status`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => {
          setQuotaStatus(res.data);
        })
        .catch(() => {});
    }
  }, []);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {/* Alert cảnh báo nếu Quota >= 80% */}
      {quotaStatus && quotaStatus.percentage != null && quotaStatus.percentage >= 80 && (
        <Alert
          message={
            quotaStatus.percentage >= 100
              ? "Cảnh báo: Tài khoản của bạn đã sử dụng hết 100% hạn mức Captcha tháng này!"
              : `Cảnh báo: Bạn đã sử dụng ${quotaStatus.percentage}% hạn mức Captcha trong tháng!`
          }
          description={
            quotaStatus.percentage >= 100
              ? `Bạn đã đạt trần ${(quotaStatus.used_requests ?? 0).toLocaleString()} / ${(quotaStatus.max_requests ?? 0).toLocaleString()} requests. Các lượt xác thực tiếp theo sẽ bị tạm ngưng cho tới khi nâng cấp gói.`
              : `Đã dùng ${(quotaStatus.used_requests ?? 0).toLocaleString()} / ${(quotaStatus.max_requests ?? 0).toLocaleString()} requests. Vui lòng liên hệ Admin nếu cần mở rộng dung lượng.`
          }
          type={quotaStatus.percentage >= 100 ? "error" : "warning"}
          showIcon
          closable
        />
      )}

      {/* 4 Thẻ KPI / Thống kê phong cách Velzon */}
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} styles={{ body: { padding: "24px" } }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <Title level={3} style={{ margin: "0 0 8px", fontWeight: 600 }}>
                  {totalSites}
                </Title>
                <Text type="secondary" style={{ fontSize: "15px", display: "block" }}>
                  Websites Bảo Vệ
                </Text>
              </div>
              <div style={{ width: 42, height: 42, borderRadius: "6px", backgroundColor: "rgba(115, 103, 240, 0.16)", color: "#7367f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                <GlobalOutlined />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <Text style={{ color: "#28c76f", fontWeight: 500, fontSize: "14px" }}>
                +100%
              </Text>{" "}
              <Text type="secondary" style={{ fontSize: "14px" }}>
                so với tháng trước
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} styles={{ body: { padding: "24px" } }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <Title level={3} style={{ margin: "0 0 8px", fontWeight: 600 }}>
                  {activeSites}
                </Title>
                <Text type="secondary" style={{ fontSize: "15px", display: "block" }}>
                  Đang Hoạt Động
                </Text>
              </div>
              <div style={{ width: 42, height: 42, borderRadius: "6px", backgroundColor: "rgba(40, 199, 111, 0.16)", color: "#28c76f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                <CheckCircleOutlined />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <Text style={{ color: "#28c76f", fontWeight: 500, fontSize: "14px" }}>
                Active Status
              </Text>{" "}
              <Text type="secondary" style={{ fontSize: "14px" }}>
                sẵn sàng nhận verify
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} styles={{ body: { padding: "24px" } }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <Title level={3} style={{ margin: "0 0 8px", color: "#4b465c", fontWeight: 600 }}>
                  Redis
                </Title>
                <Text type="secondary" style={{ fontSize: "15px", display: "block" }}>
                  Xác Thực One-Time
                </Text>
              </div>
              <div style={{ width: 42, height: 42, borderRadius: "6px", backgroundColor: "rgba(255, 159, 67, 0.16)", color: "#ff9f43", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                <ThunderboltOutlined />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <Text style={{ color: "#00cfe8", fontWeight: 500, fontSize: "14px" }}>
                TTL 60s
              </Text>{" "}
              <Text type="secondary" style={{ fontSize: "14px" }}>
                chống replay attack
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} styles={{ body: { padding: "24px" } }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <Title level={3} style={{ margin: "0 0 8px", fontWeight: 600 }}>
                  {quotaStatus ? `${quotaStatus.percentage}%` : "—"}
                </Title>
                <Text type="secondary" style={{ fontSize: "15px", display: "block" }}>
                  Quota Tháng ({quotaStatus?.plan_name || "Gói Cước"})
                </Text>
              </div>
              <div style={{ width: 42, height: 42, borderRadius: "6px", backgroundColor: "rgba(115, 103, 240, 0.16)", color: "#7367f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                <PieChartOutlined />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Progress
                percent={quotaStatus?.percentage || 0}
                size="small"
                status={
                  quotaStatus?.percentage >= 100
                    ? "exception"
                    : quotaStatus?.percentage >= 80
                    ? "active"
                    : "normal"
                }
                strokeColor={
                  quotaStatus?.percentage >= 100
                    ? "#ea5455"
                    : quotaStatus?.percentage >= 80
                    ? "#ff9f43"
                    : "#7367f0"
                }
                showInfo={false}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ fontSize: "12px", color: "#6e6b7b" }}>
                  Đã dùng: <strong>{quotaStatus?.used_requests?.toLocaleString() || 0}</strong>
                </Text>
                <Text style={{ fontSize: "12px", color: "#6e6b7b" }}>
                  Max: <strong>{quotaStatus?.max_requests?.toLocaleString() || 0}</strong>
                </Text>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Danh sách Website theo chuẩn Refine Ant Design <List> */}
      <List
        createButtonProps={{
          onClick: () => createShow(),
        }}
        headerButtons={({ defaultButtons }) => (
          <Space>
            <Input
              placeholder="Tìm kiếm site, domain..."
              prefix={<SearchOutlined style={{ color: "#878a99" }} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
              style={{ width: 260 }}
            />
            {defaultButtons}
          </Space>
        )}
      >
        <Table {...tableProps} dataSource={dataSource} rowKey="id">
          <Table.Column
            dataIndex="name"
            title="TÊN WEBSITE / DỊCH VỤ"
            render={(name: string, record: any) => {
              let platformIcon = "🌐";
              let platformBg = "#e0f2fe";
              if (record.platform === "ios") {
                platformIcon = "🍏";
                platformBg = "#e5e5e5";
              } else if (record.platform === "android") {
                platformIcon = "🤖";
                platformBg = "#dcfce7";
              }
              return (
                <Space align="center">
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      backgroundColor: platformBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                    }}
                  >
                    {platformIcon}
                  </div>
                  <Text strong>{name}</Text>
                </Space>
              );
            }}
          />

          <Table.Column
            dataIndex="primary_domain"
            title="PRIMARY DOMAIN"
            render={(domain: string) => (
              <Tag color="processing" style={{ fontFamily: "monospace", fontSize: "12px", padding: "2px 8px" }}>
                {domain}
              </Tag>
            )}
          />

          <Table.Column
            dataIndex="id"
            title="SITE ID (UUID)"
            render={(id: string) => (
              <Space size="small">
                <Text
                  code
                  style={{ fontSize: "12px", color: "#878a99", maxWidth: 120, display: "inline-block" }}
                  ellipsis={{ tooltip: id }}
                >
                  {id}
                </Text>
                <Tooltip title="Sao chép Site ID">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined style={{ fontSize: 12, color: "#878a99" }} />}
                    onClick={() => handleCopy(id)}
                  />
                </Tooltip>
              </Space>
            )}
          />

          <Table.Column
            dataIndex="challenge_mode"
            title="CHẾ ĐỘ"
            render={(mode: string) => {
              const m = mode || "auto";
              if (m === "slider") return <Tag color="purple">🧩 SLIDER</Tag>;
              if (m === "pow") return <Tag color="orange">⚡ POW</Tag>;
              if (m === "none") return <Tag color="cyan">👻 TÀNG HÌNH</Tag>;
              return <Tag color="blue">🛡️ TỰ ĐỘNG</Tag>;
            }}
          />

          <Table.Column
            dataIndex="status"
            title="TRẠNG THÁI"
            render={(status: string) => {
              const tagProps = getStatusTagProps(status);
              return <Tag {...tagProps}>{status ? status.toUpperCase() : "ACTIVE"}</Tag>;
            }}
          />

          <Table.Column
            dataIndex="created_at"
            title="NGÀY TẠO"
            render={(value: string) => (
              <DateField value={value} format="DD/MM/YYYY HH:mm" style={{ fontSize: "12px", color: "#878a99" }} />
            )}
          />

          <Table.Column
            title="HÀNH ĐỘNG"
            dataIndex="actions"
            align="center"
            render={(_, record: any) => (
              <Space size="small">
                <ShowButton 
                  hideText 
                  size="small" 
                  recordItemId={record.id} 
                  onClick={() => { 
                    setShowId(record.id); 
                    setShowDrawerOpen(true); 
                  }} 
                />
                <EditButton 
                  hideText 
                  size="small" 
                  recordItemId={record.id} 
                  onClick={() => editShow(record.id)} 
                />
                <DeleteButton hideText size="small" recordItemId={record.id} />
              </Space>
            )}
          />
        </Table>
      </List>

      {/* Drawers */}
      <SiteCreate
        drawerProps={createDrawerProps}
        formProps={createFormProps}
        saveButtonProps={createSaveButtonProps}
      />
      
      <SiteEdit
        drawerProps={editDrawerProps}
        formProps={editFormProps}
        saveButtonProps={editSaveButtonProps}
        id={editId}
      />
      
      <SiteShow
        drawerProps={{
          open: showDrawerOpen,
          onClose: () => setShowDrawerOpen(false),
        }}
        id={showId}
        queryResult={showQueryResult}
      />
    </Space>
  );
};
