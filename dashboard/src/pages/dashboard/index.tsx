import { Row, Col, Card, Typography, Table, Spin, Tag, Tooltip, Progress, Input, DatePicker, Select, Button, Space, Alert } from "antd";
import { 
  UserOutlined, 
  GlobalOutlined, 
  ClockCircleOutlined, 
  StopOutlined,
  CompassOutlined,
  MobileOutlined,
  LaptopOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  ReloadOutlined,
  ClearOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { API_BASE_URL } from "../../config";
import { IpDetailDrawer } from "../../components/ip-detail-drawer";

const { Title, Text } = Typography;

const STATS_URL = `${API_BASE_URL}/dashboard/stats`;

const FLAG_CONFIG: Record<string, { label: string; color: string }> = {
  RATE_LIMIT_5M_EXCEEDED: { label: '403 Rate Limit (5m)', color: 'error' },
  RATE_LIMIT_10S_BURST: { label: 'Burst Traffic (10s)', color: 'error' },
  RATE_LIMIT_1H_FLOOD: { label: 'Flood Traffic (1h)', color: 'error' },
  IP_REPUTATION_BANNED: { label: 'IP Bị Cấm', color: 'error' },
  IP_REPUTATION_SUSPICIOUS: { label: 'IP Khả Nghi', color: 'warning' },
  IP_REPUTATION_MULTI_SITE: { label: 'IP Tấn Công Đa Site', color: 'error' },
  THREAT_INTEL_ATTACK: { label: 'Threat Attack', color: 'volcano' },
  THREAT_INTEL_SCANNER: { label: 'Scanner Bot', color: 'volcano' },
  THREAT_INTEL_TOR: { label: 'Mạng Tor / Proxy Ẩn Danh', color: 'warning' },
  THREAT_INTEL_DATACENTER: { label: 'Datacenter / VPN', color: 'orange' },
  WEBDRIVER_AUTOMATION: { label: 'Webdriver Bot', color: 'purple' },
  HONEYPOT_FILLED: { label: 'Honeypot Triggered', color: 'magenta' },
  VIRTUAL_GPU_DETECTED: { label: 'Virtual GPU', color: 'gold' },
  PHYSICAL_INPUT_MISSING: { label: 'Không Tương Tác Vật Lý', color: 'warning' },
  REPEATED_SUBMIT_NO_MOTION: { label: 'Submit Lặp (0 Motion)', color: 'red' },
  REPEATED_SUBMIT_RAPID: { label: 'Submit Lặp Quá Nhanh', color: 'red' },
  REPEATED_SUBMIT_HIGH_COUNT: { label: 'Submit Lặp Nhiều Lần', color: 'red' },
  FAST_SUBMIT_SUBSECOND: { label: 'Submit < 0.6s', color: 'volcano' },
  FAST_SUBMIT_RAPID: { label: 'Submit Nhanh < 1.5s', color: 'gold' },
  CANVAS_FINGERPRINT_ANOMALY: { label: 'Canvas Fingerprint Bất Thường', color: 'orange' },
  SCREEN_ANOMALY: { label: 'Màn Hình Ảo 0x0', color: 'red' },
  HUMAN_INTERACTION_BONUS: { label: 'Tương Tác Tự Nhiên (Bonus)', color: 'success' },
};

interface RiskTriggerItem {
  key: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
  icon: string;
}

interface StatsData {
  totalRequests: number;
  totalSites: number;
  activeSites: number;
  knowledgeBaseIps: number;
  bannedIps: number;
  recentLogs: Array<{
    ip: string;
    site_domain?: string;
    challenge_type: string;
    result: string;
    risk_score: string;
    risk_breakdown: any;
    created_at: string;
  }>;
  chartData: Array<{
    date: string;
    passed: number;
    failed: number;
  }>;
  marketingStats?: {
    utmCampaigns: Array<{ campaign: string; source: string; total: number; passCount: number; failCount: number }>;
    deviceBreakdown: { mobile: number; desktop: number; touchScreenPct: number };
    userEngagement: { avgTimeOnPageMs: number; avgScrollDepthPct: number; pasteDetectedCount: number };
  };
  riskTriggers?: RiskTriggerItem[];
}

const defaultStats: StatsData = {
  totalRequests: 0,
  totalSites: 0,
  activeSites: 0,
  knowledgeBaseIps: 0,
  bannedIps: 0,
  recentLogs: [],
  chartData: [],
  marketingStats: {
    utmCampaigns: [],
    deviceBreakdown: { mobile: 0, desktop: 0, touchScreenPct: 0 },
    userEngagement: { avgTimeOnPageMs: 0, avgScrollDepthPct: 0, pasteDetectedCount: 0 },
  },
  riskTriggers: [],
};

export const DashboardPage = () => {
  const [stats, setStats] = useState<StatsData>(defaultStats);
  const [loading, setLoading] = useState(true);

  // Verification Logs Filter & Detail State
  const [logs, setLogs] = useState<any[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logLoading, setLogLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchIp, setSearchIp] = useState("");
  const [debouncedIp, setDebouncedIp] = useState("");
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [resultFilter, setResultFilter] = useState<string>("all");
  const [riskFactorFilter, setRiskFactorFilter] = useState<string>("all");
  const [ipSummary, setIpSummary] = useState<any>(null);
  const [selectedIpForDetail, setSelectedIpForDetail] = useState<string | null>(null);

  // Debounce tìm kiếm IP 350ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedIp(searchIp.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchIp]);

  // Fetch Verification Logs với bộ lọc tối ưu O(log N)
  const fetchLogs = useCallback(() => {
    setLogLoading(true);
    const token = localStorage.getItem("vinacaptcha_token");
    const params: any = {
      page,
      limit: pageSize,
    };
    if (debouncedIp) params.ip = debouncedIp;
    if (resultFilter && resultFilter !== "all") params.result = resultFilter;
    if (riskFactorFilter && riskFactorFilter !== "all") params.riskFactor = riskFactorFilter;
    if (dateRange && dateRange[0] && dateRange[1]) {
      params.startDate = dateRange[0].startOf("minute").toISOString();
      params.endDate = dateRange[1].endOf("minute").toISOString();
    }

    axios
      .get(`${API_BASE_URL}/verification-logs`, {
        params,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then((res) => {
        const data = res.data || {};
        setLogs(Array.isArray(data.data) ? data.data : []);
        setLogTotal(Number(data.total) || 0);
        setIpSummary(data.ipSummary || null);
        setLogLoading(false);
      })
      .catch((err) => {
        console.error("[Dashboard] Lỗi tải logs:", err);
        setLogLoading(false);
      });
  }, [page, pageSize, debouncedIp, dateRange, resultFilter, riskFactorFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    let isMounted = true;
    
    const fetchStats = () => {
      const token = localStorage.getItem("vinacaptcha_token");
      axios
        .get(STATS_URL, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        .then((res) => {
          if (isMounted) {
            const data = res?.data || {};
            setStats({
              totalRequests: Number(data.totalRequests) || 0,
              totalSites: Number(data.totalSites) || 0,
              activeSites: Number(data.activeSites) || 0,
              knowledgeBaseIps: Number(data.knowledgeBaseIps) || 0,
              bannedIps: Number(data.bannedIps) || 0,
              recentLogs: Array.isArray(data.recentLogs) ? data.recentLogs : [],
              chartData: Array.isArray(data.chartData) ? data.chartData : [],
              marketingStats: data.marketingStats || {
                utmCampaigns: [],
                deviceBreakdown: { mobile: 0, desktop: 0, touchScreenPct: 0 },
                userEngagement: { avgTimeOnPageMs: 0, avgScrollDepthPct: 0, pasteDetectedCount: 0 },
              },
              riskTriggers: Array.isArray(data.riskTriggers) ? data.riskTriggers : [],
            });
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error("[Dashboard] Không thể tải Stats:", err);
          if (isMounted) {
            setStats(defaultStats);
            setLoading(false);
          }
        });
    };

    // Lần tải đầu tiên
    fetchStats();

    // Thiết lập polling realtime mỗi 5 giây
    const interval = setInterval(() => {
      fetchStats();
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading && stats.totalSites === 0) {
    return (
      <div style={{ padding: "80px", display: "flex", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  const kpiCards = [
    {
      label: "Lượng Request",
      value: (stats.totalRequests ?? 0).toLocaleString(),
      icon: <UserOutlined />,
      color: "#7367f0",
      bg: "rgba(115,103,240,0.1)",
    },
    {
      label: "Tổng Site / Active",
      value: `${stats.totalSites ?? 0} / ${stats.activeSites ?? 0}`,
      icon: <GlobalOutlined />,
      color: "#28c76f",
      bg: "rgba(40,199,111,0.1)",
    },
    {
      label: "Knowledge Base (IPs)",
      value: (stats.knowledgeBaseIps ?? 0).toLocaleString(),
      icon: <ClockCircleOutlined />,
      color: "#00cfe8",
      bg: "rgba(0,207,232,0.1)",
    },
    {
      label: "IP Bị Banned",
      value: (stats.bannedIps ?? 0).toLocaleString(),
      icon: <StopOutlined />,
      color: "#ea5455",
      bg: "rgba(234,84,85,0.1)",
    },
  ];

  const chartData = Array.isArray(stats?.chartData) ? stats.chartData : [];

  // Tính max cho chart
  const maxTotal = Math.max(
    ...chartData.map((d) => (Number(d?.passed) || 0) + (Number(d?.failed) || 0)),
    1
  );

  return (
    <div style={{ padding: "0 0 24px" }}>
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.5); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}
      </style>
      {/* KPI Cards */}
      <Row gutter={[16, 16]}>
        {kpiCards.map((card) => (
          <Col key={card.label} xs={24} sm={12} xl={6}>
            <Card variant="borderless">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {card.label}
                  </Text>
                  <Title level={3} style={{ margin: "6px 0 0", fontWeight: 700 }}>
                    {card.value}
                  </Title>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: card.bg, color: card.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                  {card.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Row 2: Chart Full Width */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: 600 }}>Lượng Verify Captcha — 7 ngày gần nhất</Text>
                <Tag color="processing" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#1890ff', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                  REALTIME
                </Tag>
              </div>
            }
            variant="borderless"
            styles={{ body: { padding: "16px 20px" } }}
          >
            {chartData.length > 0 ? (
              <>
                {/* Legend */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginBottom: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#28c76f", display: "inline-block" }} />
                    <Text type="secondary" style={{ fontSize: 11 }}>Pass</Text>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#ea5455", display: "inline-block" }} />
                    <Text type="secondary" style={{ fontSize: 11 }}>Fail</Text>
                  </span>
                </div>

                {/* Chart bars */}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 250, padding: "0 4px" }}>
                  {chartData.map((day, i) => {
                    const passed = Number(day?.passed) || 0;
                    const failed = Number(day?.failed) || 0;
                    const total = passed + failed;
                    const heightPct = maxTotal > 0 ? Math.max((total / maxTotal) * 100, total > 0 ? 3 : 0) : 0;

                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", minWidth: 0 }}>
                        {/* Total count label */}
                        <Text style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: total === 0 ? 0 : 1 }}>
                          {total}
                        </Text>

                        {/* Stacked bar */}
                        <div style={{
                          width: "50%",
                          maxWidth: 80,
                          height: `${heightPct}%`,
                          minHeight: total > 0 ? 4 : 0,
                          display: "flex",
                          flexDirection: "column",
                          borderRadius: "4px 4px 0 0",
                          overflow: "hidden",
                        }}>
                          {/* Fail bar (top, đỏ) */}
                          {failed > 0 && (
                            <Tooltip title={`Fail: ${failed}`}>
                              <div style={{ backgroundColor: "#ea5455", flex: failed, width: "100%" }} />
                            </Tooltip>
                          )}
                          {/* Pass bar (bottom, xanh) */}
                          {passed > 0 && (
                            <Tooltip title={`Pass: ${passed}`}>
                              <div style={{ backgroundColor: "#28c76f", flex: passed, width: "100%" }} />
                            </Tooltip>
                          )}
                        </div>

                        {/* X-axis label */}
                        {(() => {
                          const isToday = day?.date === dayjs().format("YYYY-MM-DD");
                          return (
                            <div style={{ textAlign: "center", marginTop: 8 }}>
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: isToday ? 700 : 400,
                                  color: isToday ? "#1890ff" : undefined,
                                  display: "block",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {day?.date ? dayjs(day.date).format("DD/MM") : ""}
                              </Text>
                              {isToday && (
                                <Tag color="blue" style={{ fontSize: 9, lineHeight: "14px", padding: "0 4px", margin: "2px 0 0" }}>
                                  Hôm nay
                                </Tag>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>

                {/* Summary row */}
                <div style={{ display: "flex", gap: 40, marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(128,128,128,0.15)", justifyContent: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 4 }}>Tổng Pass</Text>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#28c76f" }}>
                      {chartData.reduce((s, d) => s + (Number(d?.passed) || 0), 0).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 4 }}>Tổng Fail</Text>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#ea5455" }}>
                      {chartData.reduce((s, d) => s + (Number(d?.failed) || 0), 0).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 4 }}>Tỉ lệ Pass</Text>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#7367f0" }}>
                      {(() => {
                        const tp = chartData.reduce((s, d) => s + (Number(d?.passed) || 0), 0);
                        const ta = chartData.reduce((s, d) => s + (Number(d?.passed) || 0) + (Number(d?.failed) || 0), 0);
                        return ta > 0 ? `${Math.round((tp / ta) * 100)}%` : "—";
                      })()}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 250 }}>
                <Text type="secondary">Chưa có dữ liệu — hãy submit thử form Widget trước!</Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Row 3: Cybersecurity & Risk Triggers + Marketing & UX Intelligence Analytics */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* Col 1: Top Risk Triggers & Threat Breakdown */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RobotOutlined style={{ color: '#ea5455' }} />
                  <Text style={{ fontWeight: 600 }}>Tác Nhân Gây Rủi Ro (Risk Triggers)</Text>
                </div>
                {riskFactorFilter !== 'all' && (
                  <Button 
                    size="small" 
                    type="link" 
                    onClick={() => {
                      setRiskFactorFilter('all');
                      setPage(1);
                    }}
                    style={{ padding: 0, fontSize: 11 }}
                  >
                    Bỏ lọc
                  </Button>
                )}
              </div>
            }
            variant="borderless"
            styles={{ body: { padding: '14px 18px' } }}
            style={{ height: '100%' }}
          >
            {stats?.riskTriggers && stats.riskTriggers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stats.riskTriggers.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      cursor: 'pointer',
                      padding: '6px 10px',
                      borderRadius: 6,
                      transition: 'all 0.2s',
                      backgroundColor: riskFactorFilter === item.key ? 'rgba(115,103,240,0.1)' : 'rgba(0,0,0,0.02)',
                      border: riskFactorFilter === item.key ? '1px solid #7367f0' : '1px solid transparent',
                    }}
                    onClick={() => {
                      setRiskFactorFilter(item.key);
                      setPage(1);
                    }}
                    title={`Bấm để lọc danh sách logs theo: ${item.label}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text strong style={{ fontSize: 12, color: item.color }}>
                        {item.label}
                      </Text>
                      <Space size={4}>
                        <Tag color={riskFactorFilter === item.key ? 'purple' : 'default'} style={{ fontSize: 11, margin: 0, fontWeight: 600 }}>
                          {item.count} ({item.percentage}%)
                        </Tag>
                        {riskFactorFilter === item.key && (
                          <Tag color="processing" style={{ fontSize: 10, margin: 0 }}>Đang Lọc</Tag>
                        )}
                      </Space>
                    </div>
                    <Progress
                      percent={item.percentage}
                      size="small"
                      strokeColor={item.color}
                      showInfo={false}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180 }}>
                <SafetyCertificateOutlined style={{ fontSize: 36, color: '#28c76f', marginBottom: 8 }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Chưa ghi nhận tác nhân rủi ro nào</Text>
              </div>
            )}
          </Card>
        </Col>

        {/* Col 2: UTM Campaign & Ad Fraud Monitor */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CompassOutlined style={{ color: '#7367f0' }} />
                <Text style={{ fontWeight: 600 }}>Chiến Dịch Ads (UTM)</Text>
              </div>
            }
            variant="borderless"
            styles={{ body: { padding: 0 } }}
            style={{ height: '100%' }}
          >
            <Table
              dataSource={stats?.marketingStats?.utmCampaigns || []}
              rowKey={(record) => record.campaign + record.source}
              pagination={false}
              size="small"
              locale={{ emptyText: "Chưa ghi nhận traffic từ UTM" }}
            >
              <Table.Column
                title="Chiến Dịch / Nguồn"
                render={(_: any, r: any) => (
                  <div>
                    <Text strong style={{ fontSize: 12 }}>{r.campaign}</Text>
                    <div><Tag color="geekblue" style={{ fontSize: 10, margin: 0 }}>{r.source}</Tag></div>
                  </div>
                )}
              />
              <Table.Column
                title="Lượt Submit"
                dataIndex="total"
                align="center"
                render={(total: number) => <Text strong style={{ fontSize: 12 }}>{total}</Text>}
              />
              <Table.Column
                title="Tỉ Lệ Click Tặc"
                render={(_: any, r: any) => {
                  const fraudRate = r.total > 0 ? Math.round((r.failCount / r.total) * 100) : 0;
                  const isHighFraud = fraudRate >= 30;
                  return (
                    <div>
                      <Tag color={isHighFraud ? "error" : fraudRate > 10 ? "warning" : "success"} style={{ fontSize: 10 }}>
                        {fraudRate}% Bot
                      </Tag>
                    </div>
                  );
                }}
              />
            </Table>
          </Card>
        </Col>

        {/* Col 3: Device & CRO Interaction Intelligence */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ThunderboltOutlined style={{ color: '#ff9f43' }} />
                <Text style={{ fontWeight: 600 }}>Thiết Bị & Trải Nghiệm CRO</Text>
              </div>
            }
            variant="borderless"
            styles={{ body: { padding: "16px 18px" } }}
            style={{ height: '100%' }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Mobile vs Desktop Split */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <MobileOutlined /> Mobile ({stats?.marketingStats?.deviceBreakdown?.mobile || 0})
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <LaptopOutlined /> Desktop ({stats?.marketingStats?.deviceBreakdown?.desktop || 0})
                  </Text>
                </div>
                {(() => {
                  const m = stats?.marketingStats?.deviceBreakdown?.mobile || 0;
                  const d = stats?.marketingStats?.deviceBreakdown?.desktop || 0;
                  const total = m + d;
                  const mobilePct = total > 0 ? Math.round((m / total) * 100) : 50;
                  return (
                    <Progress
                      percent={mobilePct}
                      showInfo={false}
                      strokeColor="#7367f0"
                      trailColor="#00cfe8"
                      size={["100%", 8]}
                    />
                  );
                })()}
              </div>

              {/* Interaction Metrics Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 2 }}>
                <div style={{ backgroundColor: "rgba(115,103,240,0.06)", borderRadius: 8, padding: "8px 10px" }}>
                  <Text type="secondary" style={{ fontSize: 10, display: "block" }}>⏱️ TG Điền Form TB</Text>
                  <Text strong style={{ fontSize: 14, color: "#7367f0" }}>
                    {stats?.marketingStats?.userEngagement?.avgTimeOnPageMs ? `${(stats.marketingStats.userEngagement.avgTimeOnPageMs / 1000).toFixed(1)}s` : "—"}
                  </Text>
                </div>
                <div style={{ backgroundColor: "rgba(40,199,111,0.06)", borderRadius: 8, padding: "8px 10px" }}>
                  <Text type="secondary" style={{ fontSize: 10, display: "block" }}>📜 Độ Sâu Cuộn TB</Text>
                  <Text strong style={{ fontSize: 14, color: "#28c76f" }}>
                    {stats?.marketingStats?.userEngagement?.avgScrollDepthPct ? `${stats.marketingStats.userEngagement.avgScrollDepthPct}%` : "—"}
                  </Text>
                </div>
                <div style={{ backgroundColor: "rgba(255,159,67,0.06)", borderRadius: 8, padding: "8px 10px" }}>
                  <Text type="secondary" style={{ fontSize: 10, display: "block" }}>📋 Lượt Paste Form</Text>
                  <Text strong style={{ fontSize: 14, color: "#ff9f43" }}>
                    {stats?.marketingStats?.userEngagement?.pasteDetectedCount || 0}
                  </Text>
                </div>
                <div style={{ backgroundColor: "rgba(0,207,232,0.06)", borderRadius: 8, padding: "8px 10px" }}>
                  <Text type="secondary" style={{ fontSize: 10, display: "block" }}>📱 Màn Hình Touch</Text>
                  <Text strong style={{ fontSize: 14, color: "#00cfe8" }}>
                    {stats?.marketingStats?.deviceBreakdown?.touchScreenPct ? `${stats.marketingStats.deviceBreakdown.touchScreenPct}%` : "—"}
                  </Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Row 4: Table Full Width với Bộ Lọc IP, Tác Nhân & Thời Gian Tối Ưu */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: 600 }}>Lịch Sử Verify Gần Nhất</Text>
                {logTotal > 0 && (
                  <Tag color="blue" style={{ fontSize: 11, borderRadius: 10, margin: 0 }}>
                    {logTotal} logs
                  </Tag>
                )}
                {riskFactorFilter !== 'all' && (
                  <Tag color="purple" closable onClose={() => { setRiskFactorFilter('all'); setPage(1); }} style={{ fontSize: 11, margin: 0 }}>
                    Tác nhân: {riskFactorFilter}
                  </Tag>
                )}
              </div>
            }
            extra={
              <Space wrap size={[8, 8]}>
                {/* 1. Ô tìm kiếm IP */}
                <Input
                  placeholder="Lọc theo IP (VD: 113.190...)"
                  prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                  allowClear
                  value={searchIp}
                  onChange={(e) => setSearchIp(e.target.value)}
                  style={{ width: 180, borderRadius: 6 }}
                />

                {/* 2. Bộ chọn khoảng thời gian */}
                <DatePicker.RangePicker
                  showTime={{ format: 'HH:mm' }}
                  format="DD/MM/YYYY HH:mm"
                  presets={[
                    { label: '1 Giờ Qua', value: [dayjs().subtract(1, 'hour'), dayjs()] },
                    { label: 'Hôm Nay', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
                    { label: '24 Giờ Qua', value: [dayjs().subtract(24, 'hour'), dayjs()] },
                    { label: '7 Ngày Qua', value: [dayjs().subtract(7, 'day'), dayjs()] },
                    { label: '30 Ngày Qua', value: [dayjs().subtract(30, 'day'), dayjs()] },
                  ]}
                  value={dateRange}
                  onChange={(dates) => {
                    setDateRange(dates);
                    setPage(1);
                  }}
                  placeholder={['Từ thời gian', 'Đến thời gian']}
                  style={{ borderRadius: 6 }}
                />

                {/* 3. Lọc theo tác nhân rủi ro (Risk Factor) */}
                <Select
                  value={riskFactorFilter}
                  onChange={(val) => {
                    setRiskFactorFilter(val);
                    setPage(1);
                  }}
                  style={{ width: 180 }}
                  options={[
                    { label: 'Tất cả tác nhân rủi ro', value: 'all' },
                    { label: '⚡ 403 Quá Nhanh (Rate Limit)', value: 'rate_limit' },
                    { label: '🤖 Trình Duyệt Webdriver', value: 'webdriver' },
                    { label: '🪤 Dính Bẫy Honeypot', value: 'honeypot' },
                    { label: '💻 GPU Máy Ảo Server', value: 'virtual_gpu' },
                    { label: '🌐 Threat Intel / Datacenter', value: 'threat_intel' },
                    { label: '🔁 Submit Lặp Không Motion', value: 'anti_automation' },
                    { label: '🚫 IP Bị Cấm (Banned)', value: 'banned_ip' },
                    { label: '🧭 Nguồn UTM Ads', value: 'utm' },
                  ]}
                />

                {/* 4. Lọc theo trạng thái Pass / Fail */}
                <Select
                  value={resultFilter}
                  onChange={(val) => {
                    setResultFilter(val);
                    setPage(1);
                  }}
                  style={{ width: 130 }}
                  options={[
                    { label: 'Tất cả kết quả', value: 'all' },
                    { label: '🟢 Chỉ PASS', value: 'pass' },
                    { label: '🔴 Chỉ FAIL/CẤM', value: 'fail' },
                  ]}
                />

                {/* 5. Nút làm mới */}
                <Button
                  icon={<ReloadOutlined spin={logLoading} />}
                  onClick={fetchLogs}
                  title="Làm mới danh sách"
                >
                  Làm mới
                </Button>
              </Space>
            }
            variant="borderless"
            styles={{ body: { padding: '12px 16px' } }}
            style={{ height: '100%' }}
          >
            {/* Banner tóm tắt IP Insight khi lọc theo IP */}
            {ipSummary && (
              <Alert
                type="info"
                showIcon
                icon={<SafetyCertificateOutlined style={{ fontSize: 20, color: '#7367f0' }} />}
                style={{
                  marginBottom: 14,
                  borderRadius: 8,
                  border: '1px solid #c7d2fe',
                  backgroundColor: '#f5f7ff',
                }}
                message={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <Space wrap size={[10, 6]}>
                      <Text strong style={{ fontSize: 13 }}>
                        🔍 Thống kê hoạt động IP: <span style={{ fontFamily: 'monospace', color: '#7367f0', fontSize: 14 }}>{ipSummary.ip}</span>
                      </Text>
                      <Tag color="blue" style={{ fontSize: 12 }}>
                        Tổng: <strong>{ipSummary.totalCount}</strong> lượt
                      </Tag>
                      <Tag color="success" style={{ fontSize: 12 }}>
                        ✓ {ipSummary.passCount} Pass ({Math.round((ipSummary.passCount / (ipSummary.totalCount || 1)) * 100)}%)
                      </Tag>
                      <Tag color="error" style={{ fontSize: 12 }}>
                        ✕ {ipSummary.failCount} Fail ({Math.round((ipSummary.failCount / (ipSummary.totalCount || 1)) * 100)}%)
                      </Tag>
                      <Tag color={ipSummary.avgRiskScore >= 70 ? 'error' : ipSummary.avgRiskScore >= 30 ? 'warning' : 'success'} style={{ fontSize: 12 }}>
                        Risk TB: {ipSummary.avgRiskScore}/100
                      </Tag>
                      {ipSummary.firstSeen && ipSummary.lastSeen && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          ⏱️ Lần đầu: {new Date(ipSummary.firstSeen).toLocaleDateString('vi-VN')} {new Date(ipSummary.firstSeen).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} → Gần nhất: {new Date(ipSummary.lastSeen).toLocaleDateString('vi-VN')} {new Date(ipSummary.lastSeen).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      )}
                    </Space>
                    <Space size={8}>
                      <Button
                        size="small"
                        type="primary"
                        icon={<EyeOutlined />}
                        onClick={() => setSelectedIpForDetail(ipSummary.ip)}
                        style={{ borderRadius: 6 }}
                      >
                        Xem Hồ Sơ Chi Tiết IP
                      </Button>
                      <Button
                        size="small"
                        icon={<ClearOutlined />}
                        onClick={() => {
                          setSearchIp('');
                          setDebouncedIp('');
                        }}
                        style={{ borderRadius: 6 }}
                      >
                        Xóa Lọc IP
                      </Button>
                    </Space>
                  </div>
                }
              />
            )}

            <Table
              dataSource={logs}
              rowKey={(record) => (record.id || record.ip) + record.created_at}
              loading={logLoading}
              pagination={{
                current: page,
                pageSize,
                total: logTotal,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                onChange: (p, ps) => {
                  setPage(p);
                  setPageSize(ps);
                },
                showTotal: (total, range) => `${range[0]}-${range[1]} của ${total} lượt verify`,
                size: 'small',
              }}
              size="small"
              scroll={{ x: true }}
            >
              <Table.Column
                title="IP / Site"
                render={(_: any, record: any) => (
                  <div>
                    <Tooltip title="Bấm để tra cứu Geolocation, ISP, ASN & Threat Intel chi tiết của IP">
                      <Tag
                        color="geekblue"
                        style={{
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          fontSize: 12,
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontWeight: 600,
                          marginBottom: 2,
                        }}
                        onClick={() => setSelectedIpForDetail(record.ip)}
                      >
                        🔍 {record.ip}
                      </Tag>
                    </Tooltip>
                    {record.site_domain && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 11 }}>🌐 {record.site_domain}</Text>
                      </div>
                    )}
                  </div>
                )}
              />

              <Table.Column
                title="Risk / Hành vi"
                render={(_: any, record: any) => {
                  const score = parseFloat(record.risk_score) || 0;
                  const scoreColor = score >= 70 ? '#ea5455' : score >= 30 ? '#ff9f43' : '#28c76f';
                  const levelName = score >= 70 ? 'HIGH' : score >= 30 ? 'MED' : 'LOW';
                  const signals = record.risk_breakdown?.clientSignals;

                  return (
                    <div>
                      <Tag color={score >= 70 ? 'error' : score >= 30 ? 'warning' : 'success'} style={{ fontSize: 11, marginBottom: 1 }}>{levelName}</Tag>
                      <div><Text style={{ color: scoreColor, fontSize: 11, fontWeight: 700 }}>{score.toFixed(0)}/100</Text></div>
                      
                      {/* Hiển thị tóm tắt Client Signals (Nguồn traffic/Hành vi) */}
                      {signals && (
                        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 190 }}>
                          {signals.webdriver && <Tag color="error" style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>Bot Webdriver</Tag>}
                          {signals.execution_count && signals.execution_count > 1 && (
                            <Tooltip title={`Lượt submit thứ ${signals.execution_count} trên cùng 1 phiên trang`}>
                              <Tag color="purple" style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>
                                🔁 Lặp #{signals.execution_count}
                              </Tag>
                            </Tooltip>
                          )}
                          {signals.time_on_page_ms !== undefined && (
                            <Tooltip title={`Khoảng cách submit: ${(signals.time_on_page_ms / 1000).toFixed(1)}s (Tổng thời gian trên trang: ${((signals.total_page_duration_ms || signals.time_on_page_ms) / 1000).toFixed(1)}s)`}>
                              <Tag color={signals.time_on_page_ms < 600 ? 'error' : 'default'} style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>
                                ⏱️ {(signals.time_on_page_ms / 1000).toFixed(1)}s
                              </Tag>
                            </Tooltip>
                          )}
                          <Tooltip title={`Tương tác lượt này: ${signals.mouse_moves || 0} di chuột, ${signals.mouse_clicks || 0} click, ${signals.key_strokes || 0} phím`}>
                            <Tag color={(signals.mouse_moves === 0 && signals.key_strokes === 0) ? 'error' : 'default'} style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>
                              🖱️ {signals.mouse_moves || 0} | ⌨️ {signals.key_strokes || 0}
                            </Tag>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              <Table.Column
                title="Chi Tiết Phân Tích"
                render={(_: any, record: any) => {
                  const bd = record.risk_breakdown || {};
                  const flags: string[] = Array.isArray(bd.flags) ? bd.flags : [];
                  const reasons: string[] = [];
                  if (bd.isBannedIp) reasons.push('IP Bị Cấm');
                  if (bd.clientBehaviorScore > 0) reasons.push(`Bot (+${bd.clientBehaviorScore})`);
                  if (bd.threatIntelScore > 0) reasons.push(`${bd.threatCategory || 'Threat'} (+${bd.threatIntelScore})`);
                  if (bd.reputationScore > 0) reasons.push(`Reputation (+${bd.reputationScore})`);
                  if (bd.rateLimitScore > 0) reasons.push(`RateLimit (+${bd.rateLimitScore})`);
                  if (reasons.length === 0 && flags.length === 0) reasons.push('Bình thường');

                  return (
                    <div style={{ maxWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Tag color={record.result === 'pass' ? 'success' : 'error'} style={{ fontSize: 11, margin: 0 }}>
                          {record.result ? record.result.toUpperCase() : 'UNKNOWN'}
                        </Tag>
                        {bd.threatCategory && (
                          <Tag color="volcano" style={{ fontSize: 10, margin: 0 }}>
                            {bd.threatCategory}
                          </Tag>
                        )}
                      </div>

                      {/* Hiển thị Flags rủi ro chi tiết nếu có */}
                      {flags.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {flags.map((flagKey: string) => {
                            const cfg = FLAG_CONFIG[flagKey] || { label: flagKey, color: 'default' };
                            return (
                              <Tag key={flagKey} color={cfg.color} style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>
                                {cfg.label}
                              </Tag>
                            );
                          })}
                        </div>
                      ) : (
                        <Tooltip title={reasons.join(' | ')}>
                          <div style={{ marginTop: 1, cursor: 'help' }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {reasons[0]}{reasons.length > 1 ? ' …' : ''}
                            </Text>
                          </div>
                        </Tooltip>
                      )}
                    </div>
                  );
                }}
              />

              <Table.Column
                title="Thời Gian"
                dataIndex="created_at"
                render={(ts: string) => {
                  const d = new Date(ts);
                  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
                  const diffHr = Math.floor(diffMin / 60);
                  const timeAgo = diffMin < 1 ? 'vừa xong'
                    : diffMin < 60 ? `${diffMin} phút trước`
                    : diffHr < 24 ? `${diffHr} giờ trước`
                    : d.toLocaleDateString('vi-VN');
                  return (
                    <div>
                      <Text style={{ fontSize: 12 }}>{timeAgo}</Text>
                      <div><Text type="secondary" style={{ fontSize: 11 }}>{d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Text></div>
                    </div>
                  );
                }}
              />
            </Table>
          </Card>
        </Col>
      </Row>

      {/* Drawer Tra Cứu Chi Tiết IP (IP Intelligence) */}
      <IpDetailDrawer
        ip={selectedIpForDetail}
        open={Boolean(selectedIpForDetail)}
        onClose={() => setSelectedIpForDetail(null)}
        onFilterLogs={(ip) => {
          setSearchIp(ip);
          setDebouncedIp(ip);
          setPage(1);
        }}
        onBanStatusChange={fetchLogs}
      />
    </div>
  );
};

