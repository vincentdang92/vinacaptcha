import { List, useTable } from "@refinedev/antd";
import { useNotification, useInvalidate } from "@refinedev/core";
import { Table, Tag, Typography, Button, Modal } from "antd";
import { UserOutlined, StopOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../config";

const { Text } = Typography;

export const IpReputationPage = () => {
  const { tableProps } = useTable({
    resource: "ip-reputation",
    syncWithLocation: true,
  });

  const { open } = useNotification();
  const invalidate = useInvalidate();

  const handleToggleBan = (ip: string, isCurrentlyBanned: boolean) => {
    Modal.confirm({
      title: isCurrentlyBanned ? 'Bỏ Cấm IP này?' : 'Cấm IP này?',
      icon: <ExclamationCircleOutlined />,
      content: isCurrentlyBanned 
        ? `IP ${ip} sẽ được phép truy cập lại (tùy thuộc vào Risk Score).`
        : `IP ${ip} sẽ bị từ chối phát token ngay lập tức trên mọi sites.`,
      okText: 'Đồng ý',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          const action = isCurrentlyBanned ? 'unban' : 'ban';
          const token = localStorage.getItem("vinacaptcha_token");
          
          await axios.post(
            `${API_BASE_URL}/ip-reputation/${ip}/${action}`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          open?.({
            type: "success",
            message: "Thành công",
            description: `Đã ${isCurrentlyBanned ? 'bỏ cấm' : 'cấm'} IP ${ip}.`,
          });
          
          invalidate({
            resource: "ip-reputation",
            invalidates: ["list"],
          });
        } catch (error: any) {
          open?.({
            type: "error",
            message: "Lỗi",
            description: error.response?.data?.message || "Không thể cập nhật trạng thái IP",
          });
        }
      }
    });
  };

  return (
    <List 
      title="Danh Sách IP Reputation (Cảnh báo nội bộ)"
      headerProps={{ style: { marginBottom: 16 } }}
    >
      <Table 
        {...tableProps} 
        rowKey="ip_cidr" 
        size="small"
        pagination={{
          ...tableProps.pagination,
          showSizeChanger: true,
        }}
      >
        <Table.Column 
          dataIndex="ip_cidr" 
          title="IP / CIDR" 
          render={(val) => (
            <Text strong style={{ fontFamily: "monospace" }}>
              <UserOutlined style={{ marginRight: 8, color: '#ccc' }}/>
              {val}
            </Text>
          )}
        />
        
        <Table.Column 
          dataIndex="fail_count" 
          title="Số Lần Vi Phạm" 
          sorter={(a: any, b: any) => a.fail_count - b.fail_count}
          render={(val) => (
            <Text style={{ color: val >= 10 ? '#ea5455' : val >= 5 ? '#ff9f43' : 'inherit' }}>
              {val} lần
            </Text>
          )}
        />

        <Table.Column 
          dataIndex="site_count_seen" 
          title="Số Site Phát Hiện" 
          render={(val) => (
            <Text style={{ fontWeight: 500 }}>{val} site</Text>
          )}
        />

        <Table.Column 
          dataIndex="is_banned" 
          title="Trạng Thái" 
          render={(banned) => (
            banned 
              ? <Tag color="error" icon={<StopOutlined />}>BANNED</Tag>
              : <Tag color="success" icon={<CheckCircleOutlined />}>ACTIVE</Tag>
          )}
        />

        <Table.Column 
          dataIndex="last_seen_at" 
          title="Phát Hiện Lần Cuối" 
          render={(val) => (
            <Text type="secondary">
              {new Date(val).toLocaleString('vi-VN')}
            </Text>
          )}
        />

        <Table.Column 
          title="Thao Tác" 
          render={(_, record: any) => (
            <Button 
              size="small" 
              danger={!record.is_banned}
              onClick={() => handleToggleBan(record.ip_cidr, record.is_banned)}
            >
              {record.is_banned ? 'Bỏ Cấm' : 'Cấm IP'}
            </Button>
          )}
        />
      </Table>
    </List>
  );
};
