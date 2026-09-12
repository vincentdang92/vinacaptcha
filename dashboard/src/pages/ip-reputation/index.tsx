import { useState, useEffect, useCallback } from "react";
import {
  Table,
  Tag,
  Typography,
  Button,
  Modal,
  Input,
  Select,
  Row,
  Col,
  Card,
  Statistic,
  Form,
  Radio,
  InputNumber,
  Space,
  Tooltip,
  theme,
  Popconfirm,
  App,
} from "antd";
import {
  UserOutlined,
  StopOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  GlobalOutlined,
  WarningOutlined,
  CopyOutlined,
  FireOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../config";

const { Title, Text, Paragraph } = Typography;

interface IpReputationItem {
  id: string;
  ip_cidr: string;
  fail_count: number;
  site_count_seen: number;
  is_banned: boolean;
  risk_level: "low" | "medium" | "high" | "banned";
  first_seen_at?: string;
  last_seen_at?: string;
  updated_at?: string;
}

interface IpStats {
  total_ips: number;
  banned_count: number;
  warning_count: number;
  multi_site_count: number;
}

export const IpReputationPage = () => {
  const [data, setData] = useState<IpReputationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<IpStats>({
    total_ips: 0,
    banned_count: 0,
    warning_count: 0,
    multi_site_count: 0,
  });

  // Search & Filter State
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Pagination State
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  // Modal Add / Ban IP State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [selectedActionType, setSelectedActionType] = useState<"ban" | "warning" | "custom">("ban");

  const { token } = theme.useToken();
  const { modal, message } = App.useApp();

  // ─── 1. Tải Dữ Liệu Thống Kê & Bảng ────────────────────────────────────────

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/ip-reputation/stats`);
      if (res.data) {
        setStats(res.data);
      }
    } catch {
      // Bỏ qua lỗi phụ
    }
  };

  const fetchData = useCallback(
    async (page = pagination.current, pageSize = pagination.pageSize) => {
      setLoading(true);
      try {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const params: Record<string, any> = {
          _start: start,
          _end: end,
        };

        if (searchText.trim()) {
          params.q = searchText.trim();
        }

        if (statusFilter && statusFilter !== "all") {
          params.status = statusFilter;
        }

        const res = await axios.get(`${API_BASE_URL}/ip-reputation`, { params });
        const totalHeader = res.headers["x-total-count"] || res.headers["X-Total-Count"];
        const total = totalHeader ? parseInt(totalHeader, 10) : res.data.length;

        setData(Array.isArray(res.data) ? res.data : []);
        setPagination({
          current: page,
          pageSize,
          total: isNaN(total) ? 0 : total,
        });
      } catch (err: any) {
        message.error(err.response?.data?.message || "Không thể tải danh sách IP Reputation");
      } finally {
        setLoading(false);
      }
    },
    [pagination.current, pagination.pageSize, searchText, statusFilter, message]
  );

  useEffect(() => {
    fetchStats();
    fetchData(1, pagination.pageSize);
  }, [searchText, statusFilter]);

  // ─── 2. Các Hành Động Thao Tác (Ban / Unban / Add / Delete) ─────────────────

  const handleToggleBan = (ip: string, isCurrentlyBanned: boolean) => {
    modal.confirm({
      title: isCurrentlyBanned ? `Bỏ Cấm IP: ${ip}?` : `Cấm Khẩn Cấp IP: ${ip}?`,
      icon: <ExclamationCircleOutlined style={{ color: isCurrentlyBanned ? token.colorSuccess : token.colorError }} />,
      content: isCurrentlyBanned
        ? `IP ${ip} sẽ được gỡ khỏi danh sách đen và cho phép truy cập lại bình thường.`
        : `IP ${ip} sẽ bị chặn toàn diện và bắt buộc giải thử thách cao cấp trên mọi website.`,
      okText: isCurrentlyBanned ? "Đồng Ý Bỏ Cấm" : "Xác Nhận Cấm IP",
      okType: isCurrentlyBanned ? "primary" : "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          const action = isCurrentlyBanned ? "unban" : "ban";
          await axios.post(`${API_BASE_URL}/ip-reputation/${action}`, { ip });
          message.success(`Đã ${isCurrentlyBanned ? "bỏ cấm" : "cấm"} IP ${ip} thành công`);
          await fetchData(pagination.current, pagination.pageSize);
          await fetchStats();
        } catch (error: any) {
          message.error(error.response?.data?.message || "Thao tác cập nhật IP thất bại");
        }
      },
    });
  };

  const handleDeleteIp = async (ip: string) => {
    try {
      await axios.post(`${API_BASE_URL}/ip-reputation/delete`, { ip });
      message.success(`Đã xóa IP ${ip} khỏi danh sách theo dõi`);
      await fetchData(pagination.current, pagination.pageSize);
      await fetchStats();
    } catch (error: any) {
      message.error(error.response?.data?.message || "Không thể xóa IP");
    }
  };

  const handleAddSubmit = async (values: any) => {
    setSubmittingAdd(true);
    try {
      let failCount = 11;
      let isBanned = true;

      if (values.action_type === "warning") {
        failCount = 5;
        isBanned = false;
      } else if (values.action_type === "custom") {
        failCount = values.fail_count || 11;
        isBanned = failCount > 10;
      }

      await axios.post(`${API_BASE_URL}/ip-reputation`, {
        ip: values.ip?.trim(),
        fail_count: failCount,
        is_banned: isBanned,
        reason: values.reason?.trim(),
      });

      message.success(`Đã thêm IP ${values.ip.trim()} vào danh sách thành công!`);
      setIsAddModalOpen(false);
      addForm.resetFields();
      fetchData(1, pagination.pageSize);
      fetchStats();
    } catch (error: any) {
      message.error(error.response?.data?.message || "Lỗi khi thêm IP");
    } finally {
      setSubmittingAdd(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success(`Đã sao chép IP ${text}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ─── THỐNG KÊ TỔNG QUAN METRIC CARDS ─────────────────────────────────── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: token.borderRadiusLG,
              background: token.colorBgContainer,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 13 }}>Tổng IP Đang Theo Dõi</Text>}
              value={stats.total_ips}
              prefix={<SafetyCertificateOutlined style={{ color: token.colorPrimary, marginRight: 8 }} />}
              valueStyle={{ fontWeight: 700 }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: token.borderRadiusLG,
              background: token.colorBgContainer,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 13 }}>IP Đang Bị CẤM (BANNED)</Text>}
              value={stats.banned_count}
              prefix={<StopOutlined style={{ color: token.colorError, marginRight: 8 }} />}
              valueStyle={{ fontWeight: 700, color: token.colorError }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: token.borderRadiusLG,
              background: token.colorBgContainer,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 13 }}>IP Mức Độ Cảnh Báo (2-10 Fails)</Text>}
              value={stats.warning_count}
              prefix={<WarningOutlined style={{ color: token.colorWarning, marginRight: 8 }} />}
              valueStyle={{ fontWeight: 700, color: token.colorWarning }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: token.borderRadiusLG,
              background: token.colorBgContainer,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 13 }}>Tấn Công Liên-Site (≥ 2 Sites)</Text>}
              value={stats.multi_site_count}
              prefix={<FireOutlined style={{ color: "#7367f0", marginRight: 8 }} />}
              valueStyle={{ fontWeight: 700, color: "#7367f0" }}
            />
          </Card>
        </Col>
      </Row>

      {/* ─── KHU VỰC BẢNG DỮ LIỆU & TÌM KIẾM ─────────────────────────────────── */}
      <Card
        bordered={false}
        style={{
          borderRadius: token.borderRadiusLG,
          background: token.colorBgContainer,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
        title={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
                🛡️ Danh Sách IP Reputation (Cảnh Báo Nội Bộ)
              </Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Hệ thống tự động ghi nhận và đồng bộ các IP vi phạm liên website để ngăn chặn botnet trên toàn mạng lưới
              </Text>
            </div>
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  addForm.resetFields();
                  setSelectedActionType("ban");
                  setIsAddModalOpen(true);
                }}
                style={{
                  borderRadius: token.borderRadius,
                  fontWeight: 600,
                  background: token.colorPrimary,
                }}
              >
                Thêm IP Cấm Mới
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  fetchStats();
                  fetchData(pagination.current, pagination.pageSize);
                }}
                loading={loading}
                style={{ borderRadius: token.borderRadius }}
              >
                Làm Mới
              </Button>
            </Space>
          </div>
        }
      >
        {/* ─── THANH TÌM KIẾM & BỘ LỌC ────────────────────────────────────────── */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} md={14} lg={16}>
            <Input
              placeholder="🔍 Tìm kiếm nhanh theo địa chỉ IP hoặc dải CIDR (VD: 27.74. hoặc 192.168.1.0/24)..."
              prefix={<SearchOutlined style={{ color: token.colorTextPlaceholder }} />}
              value={searchText}
              allowClear
              onChange={(e) => setSearchText(e.target.value)}
              style={{
                borderRadius: token.borderRadius,
                padding: "8px 12px",
              }}
            />
          </Col>
          <Col xs={24} md={10} lg={8}>
            <Select
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              style={{ width: "100%", height: 40 }}
              options={[
                { value: "all", label: "Tất Cả Trạng Thái Rủi Ro" },
                { value: "banned", label: "🚫 Đang Bị CẤM (BANNED)" },
                { value: "warning", label: "⚠️ Cảnh Báo (2-10 Fails)" },
                { value: "active", label: "✅ Bình Thường (< 2 Fails)" },
              ]}
            />
          </Col>
        </Row>

        {/* ─── BẢNG DỮ LIỆU IP REPUTATION ─────────────────────────────────────── */}
        <Table<IpReputationItem>
          dataSource={data}
          rowKey="ip_cidr"
          loading={loading}
          size="middle"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            showTotal: (total, range) => `${range[0]}-${range[1]} trong tổng số ${total} IP`,
            onChange: (page, pageSize) => {
              fetchData(page, pageSize);
            },
          }}
        >
          <Table.Column<IpReputationItem>
            dataIndex="ip_cidr"
            title="Địa Chỉ IP / CIDR"
            render={(val) => (
              <Space>
                <Text
                  strong
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 14,
                    color: token.colorText,
                  }}
                >
                  <UserOutlined style={{ marginRight: 6, color: token.colorTextSecondary }} />
                  {val}
                </Text>
                <Tooltip title="Sao chép IP">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(val)}
                    style={{ color: token.colorTextSecondary }}
                  />
                </Tooltip>
              </Space>
            )}
          />

          <Table.Column<IpReputationItem>
            dataIndex="fail_count"
            title="Lần Vi Phạm (Fails)"
            sorter={(a, b) => a.fail_count - b.fail_count}
            render={(val) => {
              let color = token.colorText;
              if (val >= 11) color = token.colorError;
              else if (val >= 5) color = token.colorWarning;
              else if (val >= 2) color = token.colorPrimary;

              return (
                <Text strong style={{ color, fontSize: 14 }}>
                  {val} <span style={{ fontSize: 12, fontWeight: 400, color: token.colorTextSecondary }}>lượt fail</span>
                </Text>
              );
            }}
          />

          <Table.Column<IpReputationItem>
            dataIndex="site_count_seen"
            title="Website Đã Quét"
            render={(val) => (
              <Tag
                color={val >= 2 ? "purple" : "default"}
                style={{ borderRadius: 12, padding: "2px 8px", fontWeight: 500 }}
              >
                <GlobalOutlined style={{ marginRight: 4 }} />
                {val} site{val > 1 ? "s" : ""}
              </Tag>
            )}
          />

          <Table.Column<IpReputationItem>
            dataIndex="is_banned"
            title="Mức Độ & Trạng Thái"
            render={(_, record) => {
              if (record.is_banned) {
                return (
                  <Tag color="error" icon={<StopOutlined />} style={{ fontWeight: 600, borderRadius: 4 }}>
                    BANNED (Khóa)
                  </Tag>
                );
              }
              if (record.fail_count >= 5) {
                return (
                  <Tag color="warning" icon={<ExclamationCircleOutlined />} style={{ fontWeight: 600, borderRadius: 4 }}>
                    HIGH RISK
                  </Tag>
                );
              }
              if (record.fail_count >= 2) {
                return (
                  <Tag color="processing" style={{ fontWeight: 500, borderRadius: 4 }}>
                    MEDIUM
                  </Tag>
                );
              }
              return (
                <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontWeight: 500, borderRadius: 4 }}>
                  ACTIVE (Bình thường)
                </Tag>
              );
            }}
          />

          <Table.Column<IpReputationItem>
            dataIndex="last_seen_at"
            title="Lần Cuối Phát Hiện"
            render={(val) => (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {val ? new Date(val).toLocaleString("vi-VN") : "—"}
              </Text>
            )}
          />

          <Table.Column<IpReputationItem>
            title="Thao Tác"
            width={180}
            render={(_, record) => (
              <Space size="small">
                <Button
                  size="small"
                  type={record.is_banned ? "default" : "primary"}
                  danger={!record.is_banned}
                  onClick={() => handleToggleBan(record.ip_cidr, record.is_banned)}
                  style={{
                    borderRadius: token.borderRadius,
                    fontWeight: 500,
                  }}
                >
                  {record.is_banned ? "Bỏ Cấm" : "Cấm IP"}
                </Button>

                <Popconfirm
                  title="Xóa IP khỏi danh sách theo dõi?"
                  description={`Xóa hoàn toàn lịch sử vi phạm của ${record.ip_cidr}?`}
                  okText="Xác Nhận Xóa"
                  cancelText="Hủy"
                  okType="danger"
                  onConfirm={() => handleDeleteIp(record.ip_cidr)}
                >
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    style={{ borderRadius: token.borderRadius }}
                  />
                </Popconfirm>
              </Space>
            )}
          />
        </Table>
      </Card>

      {/* ─── MODAL THÊM IP CẤM / CẢNH BÁO MỚI ──────────────────────────────── */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🚫</span>
            <span style={{ fontWeight: 700 }}>Thêm IP Cấm / Đưa Vào Danh Sách Theo Dõi</span>
          </div>
        }
        open={isAddModalOpen}
        onCancel={() => setIsAddModalOpen(false)}
        footer={null}
        destroyOnClose
        centered
      >
        <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 20 }}>
          IP hoặc Subnet được thêm vào đây sẽ lập tức có hiệu lực trên toàn bộ hệ sinh thái website sử dụng VinaCaptcha.
        </Paragraph>

        <Form
          form={addForm}
          layout="vertical"
          onFinish={handleAddSubmit}
          initialValues={{
            action_type: "ban",
            fail_count: 11,
          }}
        >
          <Form.Item
            name="ip"
            label={<Text strong>Địa Chỉ IP hoặc Dải CIDR</Text>}
            rules={[
              { required: true, message: "Vui lòng nhập địa chỉ IP hoặc CIDR" },
              {
                pattern:
                  /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([0-9]|[1-2][0-9]|3[0-2]))?$/,
                message: "Định dạng IP / CIDR không đúng (VD: 103.28.36.12 hoặc 192.168.1.0/24)",
              },
            ]}
          >
            <Input
              placeholder="VD: 113.161.42.10 hoặc 192.168.1.0/24"
              style={{ borderRadius: token.borderRadius, padding: "8px 12px", fontFamily: "monospace" }}
            />
          </Form.Item>

          <Form.Item
            name="action_type"
            label={<Text strong>Mức Độ Áp Dụng</Text>}
          >
            <Radio.Group
              onChange={(e) => setSelectedActionType(e.target.value)}
              style={{ width: "100%" }}
            >
              <Space direction="vertical" style={{ width: "100%" }}>
                <Radio value="ban">
                  <Text strong style={{ color: token.colorError }}>🚫 Cấm Khẩn Cấp (BANNED)</Text>
                  <Text type="secondary" style={{ display: "block", fontSize: 12, marginLeft: 24 }}>
                    Gán fail_count = 11. Chặn phát token và buộc giải PoW độ khó cao nhất trên mọi sites.
                  </Text>
                </Radio>

                <Radio value="warning">
                  <Text strong style={{ color: token.colorWarning }}>⚠️ Đánh Dấu Cảnh Báo (HIGH RISK)</Text>
                  <Text type="secondary" style={{ display: "block", fontSize: 12, marginLeft: 24 }}>
                    Gán fail_count = 5. Bắt buộc giải thử thách ghép hình Slider Captcha.
                  </Text>
                </Radio>

                <Radio value="custom">
                  <Text strong>Tùy chỉnh số lần Fail Count</Text>
                </Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          {selectedActionType === "custom" && (
            <Form.Item
              name="fail_count"
              label={<Text strong>Số lần vi phạm (Fail Count)</Text>}
              rules={[{ required: true, message: "Vui lòng nhập số lần fail" }]}
            >
              <InputNumber min={1} max={100} style={{ width: "100%" }} />
            </Form.Item>
          )}

          <Form.Item
            name="reason"
            label={<Text strong>Ghi Chú / Lý Do (Tùy chọn)</Text>}
          >
            <Input.TextArea
              rows={2}
              placeholder="VD: Nghi vấn botnet brute-force mật khẩu từ máy chủ nước ngoài..."
              style={{ borderRadius: token.borderRadius }}
            />
          </Form.Item>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
            <Button onClick={() => setIsAddModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={submittingAdd}
              style={{
                borderRadius: token.borderRadius,
                background: token.colorPrimary,
                fontWeight: 600,
              }}
            >
              Xác Nhận Lưu IP
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
