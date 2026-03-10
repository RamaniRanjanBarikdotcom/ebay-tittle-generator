import React, { useState } from 'react';
import { Button, Card, Input, Space, Typography, message } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      message.error('Enter username and password');
      return;
    }
    setLoading(true);
    try {
      const result = await window.api.authLogin(username.trim(), password);
      if (!result.success) {
        message.error(result.error || 'Login failed');
        return;
      }
      const token = result.data?.token;
      const user = result.data?.user;
      if (!token || !user) {
        message.error('Invalid login response');
        return;
      }
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      onLoginSuccess({ token, user });
    } catch (error) {
      message.error(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-grid">
        <section className="login-brand-panel">
          <div className="login-chip">Secure Workspace</div>
          <Title level={2} style={{ marginBottom: 8 }}>
            eBay Title Generator
          </Title>
          <Text type="secondary">
            Access your product workflow, title optimization, and pricing operations from one secured console.
          </Text>
        </section>
        <Card className="login-card">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Title level={3} style={{ marginBottom: 0 }}>
              Sign In
            </Title>
            <Text type="secondary">Admin or User login required</Text>
          </div>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            prefix={<UserOutlined />}
            onPressEnter={handleLogin}
          />
          <Input.Password
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            prefix={<LockOutlined />}
            onPressEnter={handleLogin}
          />
          <Button type="primary" size="large" loading={loading} onClick={handleLogin} block>
            Login
          </Button>
          <Text type="secondary">
            Default admin on first App SQL setup: <code>admin</code> / <code>admin123</code>
          </Text>
          </Space>
        </Card>
      </div>
    </div>
  );
}
