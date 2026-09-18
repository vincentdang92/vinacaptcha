import React, { useState, useEffect } from 'react';
import { Drawer, Typography, Spin, Tag, Row, Col, Card, Button, Space, message, Tooltip } from 'antd';
import {
  SafetyCertificateOutlined,
  StopOutlined,
  CopyOutlined,
  FilterOutlined,
  EnvironmentOutlined,
  HistoryOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { API_BASE_URL } from '../config';

const { Text } = Typography;

interface IpDetailDrawerProps {
  ip: string | null;
  open: boolean;
  onClose: () => void;
  onFilterLogs?: (ip: string) => void;
  onBanStatusChange?: () => void;
}

export const IpDetailDrawer: React.FC<IpDetailDrawerProps> = ({
  ip,
  open,
  onClose,
  onFilterLogs,
  onBanStatusChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [intelData, setIntelData] = useState<any>(null);
  const [banning, setBanning] = useState(false);

  useEffect(() => {
    if (open && ip) {
      setLoading(true);
      const token = localStorage.getItem('vinacaptcha_token');
      axios
        .get(`${API_BASE_URL}/ip-intelligence/${encodeURIComponent(ip)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        .then((res) => {
          setIntelData(res.data);
          setLoading(false);
        })
        .catch((err) => {
          console.error('[IpDetailDrawer] Lỗi khi lấy thông tin IP:', err);
          message.error('Không thể tải thông tin chi tiết IP.');
          setLoading(false);
        });
    } else {
      setIntelData(null);
    }
  }, [open, ip]);

  const handleCopyIp = () => {
    if (ip) {
      navigator.clipboard.writeText(ip);
      message.success(`Đã sao chép IP: ${ip}`);
    }
  };

  const handleToggleBan = async () => {
    if (!ip) return;
    setBanning(true);
    const token = localStorage.getItem('vinacaptcha_token');
    const isCurrentlyBanned = Boolean(intelData?.reputation?.is_banned);
    const endpoint = isCurrentlyBanned ? 'unban' : 'ban';

    try {
      await axios.post(
        `${API_BASE_URL}/ip-reputation/${endpoint}`,
        { ip },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      message.success(isCurrentlyBanned ? `Đã bỏ cấm IP ${ip}` : `Đã chặn/cấm IP ${ip} thành công`);
      setIntelData((prev: any) => ({
        ...prev,
        reputation: {
          ...prev?.reputation,
          is_banned: !isCurrentlyBanned,
        },
      }));
      if (onBanStatusChange) onBanStatusChange();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Thao tác chặn IP thất bại');
    } finally {
      setBanning(false);
    }
  };

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return 'Chưa ghi nhận';
    const d = new Date(ts);
    return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };

  const geo = intelData?.geo || {};
  const stats = intelData?.verification_stats || {};
  const rep = intelData?.reputation || {};
  const threat = intelData?.threat_intel || {};

  const riskScore = stats.avg_risk_score || 0;
  const riskColor = riskScore >= 70 ? '#ea5455' : riskScore >= 30 ? '#ff9f43' : '#28c76f';
  const riskLevel = riskScore >= 70 ? 'CAO / NGUY HIỂM' : riskScore >= 30 ? 'TRUNG BÌNH' : 'THẤP / AN TOÀN';

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
          <Space>
            <SafetyCertificateOutlined style={{ color: '#7367f0', fontSize: 20 }} />
            <span>Hồ Sơ Chi Tiết IP</span>
          </Space>
          {ip && (
            <Tooltip title="Sao chép địa chỉ IP">
              <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyIp}>
                {ip}
              </Button>
            </Tooltip>
          )}
        </div>
      }
      placement="right"
      width={560}
      open={open}
      onClose={onClose}
      styles={{ body: { padding: '16px 20px', backgroundColor: '#f8fafc' } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px' }}>
          <Button
            icon={<FilterOutlined />}
            onClick={() => {
              if (ip && onFilterLogs) {
                onFilterLogs(ip);
                onClose();
              }
            }}
          >
            Lọc Lịch Sử Của IP Này
          </Button>
          <Space>
            <Button
              danger={!rep.is_banned}
              type={rep.is_banned ? 'default' : 'primary'}
              icon={rep.is_banned ? <UnlockOutlined /> : <StopOutlined />}
              loading={banning}
              onClick={handleToggleBan}
            >
              {rep.is_banned ? 'Bỏ Cấm IP (Unban)' : 'Chặn IP Này (Ban)'}
            </Button>
            <Button onClick={onClose}>Đóng</Button>
          </Space>
        </div>
      }
    >
      {loading ? (
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <Spin size="large" tip="Đang tra cứu Threat Intel & Geolocation..." />
        </div>
      ) : !intelData ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Text type="secondary">Không có dữ liệu cho IP này.</Text>
        </div>
      ) : (
        <div>
          {/* Header Banner */}
          <Card
            variant="borderless"
            style={{
              marginBottom: 16,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: '#ffffff',
            }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Text style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Địa Chỉ IP Tra Cứu
                </Text>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: '#ffffff', marginTop: 2 }}>
                  {ip}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {geo.countryCode && (
                    <Tag color="blue" style={{ margin: 0 }}>
                      🌍 {geo.country} ({geo.countryCode})
                    </Tag>
                  )}
                  {rep.is_banned ? (
                    <Tag color="error" style={{ margin: 0, fontWeight: 600 }}>
                      🚫 ĐANG BỊ CẤM
                    </Tag>
                  ) : (
                    <Tag color="success" style={{ margin: 0 }}>
                      🟢 HOẠT ĐỘNG
                    </Tag>
                  )}
                  {geo.is_hosting && (
                    <Tag color="volcano" style={{ margin: 0 }}>
                      ☁️ Datacenter / Cloud
                    </Tag>
                  )}
                  {geo.is_proxy && (
                    <Tag color="purple" style={{ margin: 0 }}>
                      🛡️ Proxy / VPN
                    </Tag>
                  )}
                  {geo.is_mobile && (
                    <Tag color="cyan" style={{ margin: 0 }}>
                      📱 Mạng Di Động
                    </Tag>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>ĐIỂM RỦI RO TB</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: riskColor, marginTop: 2 }}>
                  {riskScore.toFixed(0)}<span style={{ fontSize: 14 }}>/100</span>
                </div>
                <div style={{ fontSize: 11, color: riskColor, fontWeight: 600 }}>{riskLevel}</div>
              </div>
            </div>
          </Card>

          {/* 1. Vị Trí Địa Lý & Mạng (GeoIP / Network) */}
          <Card
            title={
              <Space>
                <EnvironmentOutlined style={{ color: '#00cfe8' }} />
                <span>Vị Trí Địa Lý & Tuyến Mạng (Whois / ASN)</span>
              </Space>
            }
            variant="borderless"
            style={{ marginBottom: 16, borderRadius: 10 }}
            styles={{ body: { padding: '14px 18px' } }}
          >
            <Row gutter={[16, 12]}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Quốc Gia & Thành Phố</Text>
                <Text strong style={{ fontSize: 13 }}>
                  {geo.city ? `${geo.city}, ` : ''}{geo.region ? `${geo.region}, ` : ''}{geo.country || 'Chưa xác định'}
                </Text>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Nhà Mạng Cung Cấp (ISP)</Text>
                <Text strong style={{ fontSize: 13 }}>{geo.isp || '—'}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Mã Tuyến Mạng (AS Number)</Text>
                <Text strong style={{ fontSize: 13, fontFamily: 'monospace' }}>{geo.as || '—'}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Tổ Chức Quản Lý (Org)</Text>
                <Text strong style={{ fontSize: 13 }}>{geo.org || '—'}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Múi Giờ Hệ Thống</Text>
                <Text style={{ fontSize: 13 }}>{geo.timezone || '—'}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Tọa Độ GPS (Ước tính)</Text>
                <Text style={{ fontSize: 13, fontFamily: 'monospace' }}>
                  {geo.lat && geo.lon ? `${geo.lat}, ${geo.lon}` : '—'}
                </Text>
              </Col>
            </Row>
          </Card>

          {/* 2. Lịch Sử & Hoạt Động Trên NhanHoaCaptcha */}
          <Card
            title={
              <Space>
                <HistoryOutlined style={{ color: '#7367f0' }} />
                <span>Hoạt Động Trên Hệ Thống Captcha</span>
              </Space>
            }
            variant="borderless"
            style={{ marginBottom: 16, borderRadius: 10 }}
            styles={{ body: { padding: '14px 18px' } }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <div style={{ backgroundColor: 'rgba(115,103,240,0.06)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Tổng Request</Text>
                <Text strong style={{ fontSize: 18, color: '#7367f0' }}>{stats.total_requests || 0}</Text>
              </div>
              <div style={{ backgroundColor: 'rgba(40,199,111,0.06)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Thành Công (Pass)</Text>
                <Text strong style={{ fontSize: 18, color: '#28c76f' }}>{stats.pass_count || 0}</Text>
              </div>
              <div style={{ backgroundColor: 'rgba(234,84,85,0.06)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Thất Bại (Fail/Block)</Text>
                <Text strong style={{ fontSize: 18, color: '#ea5455' }}>{stats.fail_count || 0}</Text>
              </div>
            </div>

            <Row gutter={[16, 12]}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Lần Đầu Xuất Hiện</Text>
                <Text style={{ fontSize: 13 }}>{formatTimestamp(stats.first_seen || rep.first_seen_at)}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Lần Gần Nhất Ghi Nhận</Text>
                <Text style={{ fontSize: 13 }}>{formatTimestamp(stats.last_seen || rep.last_seen_at)}</Text>
              </Col>
              <Col span={24}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Các Website / Domain Đã Truy Cập</Text>
                {stats.visited_sites && stats.visited_sites.length > 0 ? (
                  <Space wrap size={[6, 6]}>
                    {stats.visited_sites.map((domain: string, idx: number) => (
                      <Tag key={idx} color="default" style={{ fontSize: 12 }}>
                        🌐 {domain}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>Chưa có bản ghi tên miền cụ thể</Text>
                )}
              </Col>
            </Row>
          </Card>

          {/* 3. Phân Tích Threat Intelligence & Danh Mục Đe Dọa */}
          <Card
            title={
              <Space>
                <ThunderboltOutlined style={{ color: '#ff9f43' }} />
                <span>Threat Intelligence & Cảnh Báo An Ninh</span>
              </Space>
            }
            variant="borderless"
            style={{ borderRadius: 10 }}
            styles={{ body: { padding: '14px 18px' } }}
          >
            <Row gutter={[16, 12]}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Khớp Danh Mục Threat Intel</Text>
                {threat.is_matched ? (
                  <Tag color="error" style={{ fontSize: 12, marginTop: 2 }}>
                    ⚠️ {threat.category?.toUpperCase() || 'THREAT'} ({threat.source || 'Threat Intel'})
                  </Tag>
                ) : (
                  <Tag color="success" style={{ fontSize: 12, marginTop: 2 }}>
                    ✓ Sạch (Không thuộc danh sách đen đã biết)
                  </Tag>
                )}
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Số Site Bị Quấy Rối (Seen)</Text>
                <Text strong style={{ fontSize: 13 }}>{rep.site_count_seen || 1} site(s)</Text>
              </Col>
              <Col span={24}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Số Lần Thất Bại Tích Lũy</Text>
                <Text style={{ fontSize: 13, color: rep.fail_count > 5 ? '#ea5455' : '#1e293b' }}>
                  {rep.fail_count || 0} lần (Ngưỡng tự động chặn: &gt; 10 lần)
                </Text>
              </Col>
            </Row>
          </Card>
        </div>
      )}
    </Drawer>
  );
};
