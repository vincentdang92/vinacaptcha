import { useState, useEffect } from "react";
import { Row, Col, Card, Typography, Table, Tag, Button, Spin } from "antd";
import { SyncOutlined, SafetyOutlined, WarningOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../config";

const { Title, Text } = Typography;

const API_BASE = API_BASE_URL;

interface ThreatSummary {
  source: string;
  category: string;
  count: number;
  last_synced: string;
}

interface ThreatEntry {
  id: string;
  source: string;
  category: string;
  cidr: string;
  fetched_at: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  datacenter: "blue",
  tor: "purple",
  attacks: "red",
  spam: "orange",
  proxy_anon: "magenta",
};

const CATEGORY_LABEL: Record<string, string> = {
  datacenter: "Cloud/Datacenter",
  tor: "Tor Exit Node",
  attacks: "Botnet/Attacks",
  spam: "Spam/Abuse",
  proxy_anon: "Proxy ẩn danh",
};

const SOURCE_LABEL: Record<string, string> = {
  aws: "Amazon AWS",
  gcp: "Google Cloud",
  azure: "Microsoft Azure",
  tor_exit: "Tor Project",
  firehol_level1: "FireHOL Level 1",
  firehol_level2: "FireHOL Level 2",
};

export const ThreatIntelPage = () => {
  const [summary, setSummary] = useState<ThreatSummary[]>([]);
  const [entries, setEntries] = useState<ThreatEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    const userStr = localStorage.getItem("vinacaptcha_user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setIsAdmin(user.role === "admin");
      } catch {}
    }
  }, []);

  const fetchData = async (p = 1) => {
    setLoading(true);
    const start = (p - 1) * pageSize;
    const end = start + pageSize;
    const token = localStorage.getItem("vinacaptcha_token");
    try {
      const res = await axios.get(`${API_BASE}/threat-intel?_start=${start}&_end=${end}`, {
        headers: {
          "Cache-Control": "no-cache",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      setSummary(res.data.summary || []);
      setEntries(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error("[ThreatIntel] Lỗi khi tải dữ liệu:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    const token = localStorage.getItem("vinacaptcha_token");
    try {
      const res = await axios.post(`${API_BASE}/threat-intel/sync`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      console.log("[ThreatIntel] Sync kết quả:", res.data);
      await fetchData(1);
      setPage(1);
    } catch (err) {
      console.error("[ThreatIntel] Lỗi sync:", err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData(page);
  }, [page]);

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Threat Intelligence</Title>
          <Text type="secondary">Danh sách IP nguy hiểm từ các nguồn cộng đồng quốc tế</Text>
        </div>
        {isAdmin ? (
          <Button
            type="primary"
            icon={<SyncOutlined spin={syncing} />}
            loading={syncing}
            onClick={handleSync}
          >
            {syncing ? "Đang đồng bộ..." : "Đồng Bộ Ngay"}
          </Button>
        ) : (
          <Tag color="cyan" style={{ fontSize: 13, padding: "4px 10px" }}>
            Chế độ chỉ xem (Read-only)
          </Tag>
        )}
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {loading && summary.length === 0 ? (
          <Col span={24} style={{ textAlign: "center", padding: 40 }}>
            <Spin />
          </Col>
        ) : summary.length === 0 ? (
          <Col span={24}>
            <Card variant="borderless">
              <div style={{ textAlign: "center", padding: 40 }}>
                <WarningOutlined style={{ fontSize: 32, color: "#ff9f43", marginBottom: 12 }} />
                <div>
                  <Text type="secondary">Chưa có dữ liệu Threat Intel.</Text>
                </div>
                {isAdmin && (
                  <Button type="primary" onClick={handleSync} style={{ marginTop: 12 }} loading={syncing}>
                    Đồng Bộ Ngay
                  </Button>
                )}
              </div>
            </Card>
          </Col>
        ) : (
          summary.map((s) => (
            <Col key={`${s.source}-${s.category}`} xs={24} sm={12} xl={8}>
              <Card variant="borderless" styles={{ body: { padding: "16px 20px" } }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <Tag color={CATEGORY_COLOR[s.category] || "default"} style={{ marginBottom: 6 }}>
                      {CATEGORY_LABEL[s.category] || s.category}
                    </Tag>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                      {SOURCE_LABEL[s.source] || s.source}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Cập nhật: {s.last_synced ? new Date(s.last_synced).toLocaleString("vi-VN") : "—"}
                    </Text>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: CATEGORY_COLOR[s.category] === "red" ? "#ea5455" : "#7367f0" }}>
                      {s.count.toLocaleString()}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>dải IP</Text>
                  </div>
                </div>
              </Card>
            </Col>
          ))
        )}
      </Row>

      {/* Detail Table */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SafetyOutlined />
            <Text style={{ fontWeight: 600 }}>Danh Sách Chi Tiết ({total.toLocaleString()} dải IP)</Text>
          </div>
        }
        variant="borderless"
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={entries}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: false,
            showTotal: (t) => `Tổng ${t.toLocaleString()} dải IP`,
            onChange: (p) => setPage(p),
          }}
        >
          <Table.Column
            title="Nguồn"
            dataIndex="source"
            width={180}
            render={(src) => (
              <Text strong style={{ fontSize: 12 }}>{SOURCE_LABEL[src] || src}</Text>
            )}
          />
          <Table.Column
            title="Loại Rủi Ro"
            dataIndex="category"
            width={140}
            render={(cat) => (
              <Tag color={CATEGORY_COLOR[cat] || "default"}>
                {CATEGORY_LABEL[cat] || cat}
              </Tag>
            )}
          />
          <Table.Column
            title="CIDR / Dải IP"
            dataIndex="cidr"
            render={(cidr) => (
              <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{cidr}</Text>
            )}
          />
          <Table.Column
            title="Cập Nhật Lúc"
            dataIndex="fetched_at"
            width={160}
            render={(ts) => (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {ts ? new Date(ts).toLocaleString("vi-VN") : "—"}
              </Text>
            )}
          />
        </Table>
      </Card>
    </div>
  );
};
