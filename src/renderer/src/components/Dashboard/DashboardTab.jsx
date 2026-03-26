import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Row, Statistic, Tag, message } from 'antd';
import {
  ReloadOutlined,
  RiseOutlined,
  FallOutlined,
  FileTextOutlined,
  ShopOutlined,
  ThunderboltOutlined,
  ExportOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';

const MARKETPLACE_COLORS = {
  ebay: '#e53238',
  amazon: '#ff9900',
  kaufland: '#cc071e',
  otto: '#f00020'
};

export default function DashboardTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.getDashboardStats();
      if (result.success) setStats(result.data);
      else message.error(result.error || 'Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const s = stats || {};

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2>Dashboard</h2>
          <p className="panel-subtext">Overview of your TitleCraft activity</p>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={loadStats}>
          Refresh
        </Button>
      </div>

      {/* Main KPIs */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          {
            label: 'Total SKUs (cached)',
            value: s.totalSkus ?? '-',
            icon: <ShopOutlined />,
            color: '#1677ff'
          },
          {
            label: 'New SKUs Today',
            value: s.newSkusToday ?? '-',
            icon: <ClockCircleOutlined />,
            color: '#13c2c2'
          },
          {
            label: 'Titles Generated',
            value: s.titlesGenerated ?? '-',
            icon: <ThunderboltOutlined />,
            color: '#52c41a'
          },
          {
            label: 'Titles Today',
            value: s.titlesGeneratedToday ?? '-',
            icon: <FileTextOutlined />,
            color: '#722ed1'
          },
          {
            label: 'Exported Today',
            value: s.exportedToday ?? '-',
            icon: <ExportOutlined />,
            color: '#eb2f96'
          }
        ].map((item) => (
          <Col key={item.label} xs={12} sm={8} md={6} lg={4}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic
                title={item.label}
                value={item.value}
                prefix={item.icon}
                valueStyle={{ color: item.color, fontSize: 22 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Price changes today */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              title="Price Decreased Today (−€0.02)"
              value={s.priceDecreased ?? '-'}
              prefix={<FallOutlined />}
              valueStyle={{ color: '#f5222d', fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              title="Price Increased Today (+€0.02)"
              value={s.priceIncreased ?? '-'}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#52c41a', fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              title="Pending Price Updates"
              value={s.pendingPriceUpdates ?? '-'}
              valueStyle={{ color: s.pendingPriceUpdates > 0 ? '#faad14' : '#8c8c8c', fontSize: 22 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Marketplace breakdown */}
      <Card title="Titles by Marketplace" size="small">
        <Row gutter={[12, 12]}>
          {['ebay', 'amazon', 'kaufland', 'otto'].map((mp) => (
            <Col key={mp} xs={12} sm={6}>
              <Card
                size="small"
                style={{ textAlign: 'center', borderTop: `3px solid ${MARKETPLACE_COLORS[mp]}` }}
              >
                <Statistic
                  title={<Tag color={MARKETPLACE_COLORS[mp]} style={{ textTransform: 'capitalize' }}>{mp}</Tag>}
                  value={s.byMarketplace?.[mp] ?? 0}
                  valueStyle={{ color: MARKETPLACE_COLORS[mp], fontSize: 20 }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
}
