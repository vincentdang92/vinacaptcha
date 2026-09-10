import {
  List,
  useTable,
} from "@refinedev/antd";
import { Table, Tag, Typography, Space, Button, Modal, Select, Form, Input, message } from "antd";
import { useState, useEffect } from "react";
import { useApiUrl, useCustomMutation } from "@refinedev/core";
import { KeyOutlined, EditOutlined } from "@ant-design/icons";

const { Text } = Typography;

export const AccountList = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  const apiUrl = useApiUrl();
  const { mutate } = useCustomMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetAccount, setResetAccount] = useState<any | null>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();

  const [plans, setPlans] = useState<any[]>([]);

  // Fetch plans
  useEffect(() => {
    import('axios').then(({ default: axios }) => {
      axios.get(`${apiUrl}/plans`).then((res) => {
        setPlans(Array.isArray(res.data) ? res.data : Array.isArray(res.data?.data) ? res.data.data : []);
      }).catch(() => {
        setPlans([]);
      });
    });
  }, [apiUrl]);

  const handleEdit = (record: any) => {
    form.setFieldsValue({
      status: record.status,
      plan_id: record.plan?.id || null,
      role: record.role,
      password: "",
    });
    setEditingId(record.id);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      mutate({
        url: `${apiUrl}/accounts/${editingId}`,
        method: "patch",
        values,
      }, {
        onSuccess: () => {
          setEditingId(null);
          message.success("Đã cập nhật thông tin người dùng thành công!");
        }
      });
    } catch (e) {}
  };

  const handleOpenResetPassword = (record: any) => {
    resetForm.resetFields();
    setResetAccount(record);
  };

  const handleResetPassword = async () => {
    try {
      const values = await resetForm.validateFields();
      mutate({
        url: `${apiUrl}/accounts/${resetAccount.id}`,
        method: "patch",
        values: { password: values.new_password },
      }, {
        onSuccess: () => {
          setResetAccount(null);
          message.success(`Đã đổi mật khẩu cho tài khoản ${resetAccount.email} thành công!`);
        }
      });
    } catch (e) {}
  };

  return (
    <>
      <List title="Quản lý Người Dùng">
        <Table {...tableProps} rowKey="id">
          <Table.Column
            dataIndex="email"
            title="EMAIL"
            render={(val: string) => <Text strong>{val}</Text>}
          />
          <Table.Column dataIndex="name" title="TÊN HIỂN THỊ" />
          <Table.Column
            dataIndex="role"
            title="VAI TRÒ"
            render={(role: string) => (
              <Tag color={role === 'admin' ? 'red' : 'blue'}>
                {role === 'admin' ? 'Admin' : 'User'}
              </Tag>
            )}
          />
          <Table.Column
            dataIndex="status"
            title="TRẠNG THÁI"
            render={(status: string, record: any) => (
              <Space direction="vertical" size="small">
                <Tag color={status === 'active' ? 'success' : 'error'}>
                  {status === 'active' ? 'Hoạt động' : 'Bị khóa'}
                </Tag>
                <Tag color={record.is_verified ? 'processing' : 'default'}>
                  {record.is_verified ? 'Đã kích hoạt mail' : 'Chưa kích hoạt mail'}
                </Tag>
              </Space>
            )}
          />
          <Table.Column
            title="GÓI CƯỚC"
            render={(_, record: any) => (
              <Text type="secondary">{record.plan?.name || 'Không có'}</Text>
            )}
          />
          <Table.Column
            title="HÀNH ĐỘNG"
            render={(_, record: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                  Cập nhật
                </Button>
                <Button
                  size="small"
                  icon={<KeyOutlined />}
                  onClick={() => handleOpenResetPassword(record)}
                >
                  Đổi mật khẩu
                </Button>
              </Space>
            )}
          />
        </Table>
      </List>

      {/* Modal Cập Nhật Thông Tin */}
      <Modal
        title="Cập nhật thông tin User"
        open={!!editingId}
        onOk={handleSave}
        onCancel={() => setEditingId(null)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Vai trò" name="role">
            <Select
              options={[
                { label: 'Admin', value: 'admin' },
                { label: 'User', value: 'user' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Trạng thái" name="status">
            <Select
              options={[
                { label: 'Hoạt động', value: 'active' },
                { label: 'Bị khóa (Suspended)', value: 'suspended' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Gói cước (Plan)" name="plan_id">
            <Select
              options={plans.map((p: any) => ({
                label: `${p.name} (Max ${p.max_domains} domains, ${p.max_requests} reqs)`,
                value: p.id,
              }))}
            />
          </Form.Item>
          <Form.Item
            label="Mật khẩu mới (Để trống nếu không đổi)"
            name="password"
          >
            <Input.Password placeholder="Nhập mật khẩu mới nếu muốn đổi..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Đặt Lại Mật Khẩu Riêng Biệt */}
      <Modal
        title={`Đặt lại mật khẩu: ${resetAccount?.email}`}
        open={!!resetAccount}
        onOk={handleResetPassword}
        onCancel={() => setResetAccount(null)}
        okText="Xác nhận đổi mật khẩu"
        cancelText="Hủy"
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            Mật khẩu mới sẽ được mã hóa và áp dụng ngay lập tức cho người dùng <strong>{resetAccount?.name}</strong> ({resetAccount?.email}).
          </Text>
        </div>
        <Form form={resetForm} layout="vertical">
          <Form.Item
            label="Mật khẩu mới"
            name="new_password"
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu mới!" },
              { min: 6, message: "Mật khẩu phải có ít nhất 6 ký tự!" },
            ]}
          >
            <Input.Password placeholder="Nhập mật khẩu mới..." autoFocus />
          </Form.Item>
          <Form.Item
            label="Xác nhận mật khẩu mới"
            name="confirm_password"
            dependencies={["new_password"]}
            rules={[
              { required: true, message: "Vui lòng xác nhận mật khẩu mới!" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("new_password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("Mật khẩu xác nhận không khớp!"));
                },
              }),
            ]}
          >
            <Input.Password placeholder="Nhập lại mật khẩu mới..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
