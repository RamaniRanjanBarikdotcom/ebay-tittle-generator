import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import { ClearOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const LEVEL_COLORS = { info: 'blue', warn: 'orange', warning: 'orange', error: 'red', debug: 'default' };

function renderDetails(details) {
  if (!details) return '-';
  try {
    const parsed = typeof details === 'string' ? JSON.parse(details) : details;
    return (
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 160, overflow: 'auto' }}>
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    return String(details);
  }
}

export default function LogsTab({ t, isAdmin }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState([]);
  const [eventFilter, setEventFilter] = useState('');
  const [clearing, setClearing] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.getLogs();
      if (result.success) setRows(result.data || []);
      else message.error(result.error || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (levelFilter.length && !levelFilter.includes(row.level)) return false;
      if (eventFilter && !String(row.event || '').toLowerCase().includes(eventFilter.toLowerCase())) return false;
      return true;
    });
  }, [rows, levelFilter, eventFilter]);

  const handleClear = async () => {
    setClearing(true);
    try {
      const result = await window.api.clearLogs();
      if (result.success) {
        message.success(`Cleared ${result.data.deleted} log entries`);
        setRows([]);
      } else {
        message.error(result.error || 'Failed to clear logs');
      }
    } finally {
      setClearing(false);
    }
  };

  const columns = [
    {
      title: 'Time',
      dataIndex: 'created_at',
      width: 168,
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: 'Level',
      dataIndex: 'level',
      width: 90,
      render: (v) => <Tag color={LEVEL_COLORS[v] || 'default'}>{v}</Tag>
    },
    {
      title: 'Event',
      dataIndex: 'event',
      width: 220,
      ellipsis: true
    },
    {
      title: 'Message',
      dataIndex: 'message',
      width: 280,
      ellipsis: true
    },
    {
      title: 'Session',
      dataIndex: 'session_id',
      width: 140,
      ellipsis: true,
      render: (v) => v || '-'
    },
    {
      title: 'Details',
      dataIndex: 'details',
      render: renderDetails
    }
  ];

  return (
    <div className="panel">
      <h2>{t('logs.title')}</h2>
      <p className="panel-subtext">{t('logs.subtitle')}</p>
      <Card variant="borderless">
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            mode="multiple"
            placeholder="Filter by level"
            value={levelFilter}
            onChange={setLevelFilter}
            style={{ minWidth: 180 }}
            options={[
              { value: 'info', label: 'Info' },
              { value: 'warn', label: 'Warn' },
              { value: 'error', label: 'Error' },
              { value: 'debug', label: 'Debug' }
            ]}
          />
          <Input.Search
            placeholder="Search event..."
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            onSearch={setEventFilter}
            style={{ width: 220 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={loadLogs}>
            Refresh
          </Button>
          {isAdmin && (
            <Popconfirm
              title="Clear all logs?"
              description="This will permanently delete all log entries."
              onConfirm={handleClear}
              okText="Clear All"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<ClearOutlined />} loading={clearing}>
                Clear Logs
              </Button>
            </Popconfirm>
          )}
          <Tag>{filtered.length} entries</Tag>
        </Space>
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          columns={columns}
          pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: ['50', '100', '200', '500'] }}
          scroll={{ x: true, y: 520 }}
          expandable={{
            expandedRowRender: (record) => renderDetails(record.details),
            rowExpandable: (record) => Boolean(record.details)
          }}
        />
      </Card>
    </div>
  );
}
