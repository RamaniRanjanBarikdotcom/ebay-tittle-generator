import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Select, Space, Statistic, Table, Tag, Row, Col, message } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatPriceDE } from '../../utils/format.js';

function parseMetadata(metadata) {
  if (!metadata) return {};
  try {
    return typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
  } catch {
    return {};
  }
}

function actionColor(action) {
  if (action === 'imported') return 'blue';
  if (action === 'generated') return 'green';
  if (action === 'exported') return 'purple';
  if (action === 'deleted') return 'red';
  return 'default';
}

function formatPrice(value) {
  return formatPriceDE(value, { fallback: '-' });
}


export default function HistoryTab({ t }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [search, setSearch] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.getHistory();
      if (result.success) setRows(result.data || []);
      else message.error(result.error || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const preparedRows = useMemo(
    () =>
      rows.map((row) => {
        const metadata = parseMetadata(row.metadata);
        const newPrice = row.suggested_price ?? metadata.suggested_price ?? metadata.new_price ?? null;
        const oldPrice = row.price ?? metadata.old_price ?? null;
        const soldCount = row.sold_count ?? metadata.sold_count ?? null;
        return {
          ...row,
          metadataObj: metadata,
          year: dayjs(row.created_at).format('YYYY'),
          month: dayjs(row.created_at).format('MM'),
          date: dayjs(row.created_at).format('DD'),
          old_price: oldPrice,
          new_price: newPrice,
          sold_count_value: soldCount,
          pricing_change: metadata.price_adjustment || row.price_adjustment || '-',
          file_target: row.export_filename || metadata.endpointUrl || '-'
        };
      }),
    [rows]
  );

  const yearOptions = useMemo(() => {
    const vals = [...new Set(preparedRows.map((r) => r.year))].sort((a, b) => Number(b) - Number(a));
    return vals.map((v) => ({ value: v, label: v }));
  }, [preparedRows]);

  const monthOptions = useMemo(() => {
    if (!selectedYear) return [];
    const vals = [
      ...new Set(preparedRows.filter((r) => r.year === selectedYear).map((r) => r.month))
    ].sort((a, b) => Number(b) - Number(a));
    return vals.map((v) => ({ value: v, label: dayjs(`${selectedYear}-${v}-01`).format('MMMM') }));
  }, [preparedRows, selectedYear]);

  const dateOptions = useMemo(() => {
    if (!selectedYear || !selectedMonth) return [];
    const vals = [
      ...new Set(
        preparedRows
          .filter((r) => r.year === selectedYear && r.month === selectedMonth)
          .map((r) => r.date)
      )
    ].sort((a, b) => Number(b) - Number(a));
    return vals.map((v) => ({ value: v, label: v }));
  }, [preparedRows, selectedYear, selectedMonth]);

  useEffect(() => {
    if (yearOptions.length && (!selectedYear || !yearOptions.find((y) => y.value === selectedYear))) {
      setSelectedYear(yearOptions[0].value);
    }
  }, [yearOptions]);

  useEffect(() => {
    if (monthOptions.length && (!selectedMonth || !monthOptions.find((m) => m.value === selectedMonth))) {
      setSelectedMonth(monthOptions[0].value);
    }
  }, [monthOptions]);

  useEffect(() => {
    if (dateOptions.length && (!selectedDate || !dateOptions.find((d) => d.value === selectedDate))) {
      setSelectedDate(dateOptions[0].value);
    }
  }, [dateOptions]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return preparedRows.filter((row) => {
      if (actionFilter.length && !actionFilter.includes(row.action)) return false;
      if (selectedYear && row.year !== selectedYear) return false;
      if (selectedMonth && row.month !== selectedMonth) return false;
      if (selectedDate && row.date !== selectedDate) return false;
      if (q) {
        const haystack = [
          row.item_number,
          row.sku,
          row.original_title,
          row.new_title,
          row.export_filename,
          row.destination,
          row.session_id
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [preparedRows, actionFilter, selectedYear, selectedMonth, selectedDate, search]);

  const dayStats = useMemo(() => {
    const stats = { total: filteredRows.length, imported: 0, generated: 0, exported: 0, deleted: 0 };
    filteredRows.forEach((row) => {
      if (row.action in stats) stats[row.action] += 1;
    });
    return stats;
  }, [filteredRows]);

  return (
    <div className="panel">
      <h2>{t('history.title')}</h2>
      <p className="panel-subtext">{t('history.subtitle')}</p>

      {/* Stats row */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { label: 'Total', value: dayStats.total, color: '#1677ff' },
          { label: 'Imported', value: dayStats.imported, color: '#1677ff' },
          { label: 'Generated', value: dayStats.generated, color: '#52c41a' },
          { label: 'Exported', value: dayStats.exported, color: '#722ed1' },
          { label: 'Deleted', value: dayStats.deleted, color: '#f5222d' }
        ].map((s) => (
          <Col key={s.label} xs={12} sm={8} md={5} lg={4}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic
                title={s.label}
                value={s.value}
                valueStyle={{ color: s.color, fontSize: 20 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card variant="borderless">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {/* Filters */}
          <Space wrap>
            <Select
              mode="multiple"
              placeholder={t('history.action')}
              value={actionFilter}
              onChange={setActionFilter}
              options={[
                { value: 'imported', label: 'Imported' },
                { value: 'generated', label: 'Generated' },
                { value: 'exported', label: 'Exported' },
                { value: 'deleted', label: 'Deleted' }
              ]}
              style={{ minWidth: 200 }}
            />
            <Select
              placeholder="Year"
              value={selectedYear}
              onChange={(v) => { setSelectedYear(v); setSelectedMonth(null); setSelectedDate(null); }}
              options={yearOptions}
              style={{ width: 110 }}
              allowClear
            />
            <Select
              placeholder="Month"
              value={selectedMonth}
              onChange={(v) => { setSelectedMonth(v); setSelectedDate(null); }}
              options={monthOptions}
              style={{ width: 130 }}
              disabled={!selectedYear}
              allowClear
            />
            <Select
              placeholder="Day"
              value={selectedDate}
              onChange={setSelectedDate}
              options={dateOptions}
              style={{ width: 100 }}
              disabled={!selectedYear || !selectedMonth}
              allowClear
            />
            <Input
              placeholder="Search SKU, title, item..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              style={{ width: 240 }}
            />
            <Button icon={<ReloadOutlined />} loading={loading} onClick={loadHistory}>
              Refresh
            </Button>
          </Space>

          <Table
            size="small"
            rowKey="id"
            loading={loading}
            dataSource={filteredRows}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} records` }}
            scroll={{ x: true, y: 520 }}
            locale={{ emptyText: t('history.empty') }}
            columns={[
              {
                title: t('history.createdAt'),
                dataIndex: 'created_at',
                width: 170,
                render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss')
              },
              {
                title: t('history.action'),
                dataIndex: 'action',
                width: 110,
                render: (v) => <Tag color={actionColor(v)}>{v}</Tag>
              },
              { title: t('history.itemNumber'), dataIndex: 'item_number', width: 150, ellipsis: true },
              { title: t('history.sku'), dataIndex: 'sku', width: 140, ellipsis: true },
              {
                title: t('history.oldTitle'),
                dataIndex: 'original_title',
                width: 260,
                ellipsis: true
              },
              {
                title: t('history.newTitle'),
                dataIndex: 'new_title',
                width: 260,
                ellipsis: true
              },
              {
                title: 'Old Price',
                dataIndex: 'old_price',
                width: 100,
                render: formatPrice
              },
              {
                title: 'Sold',
                dataIndex: 'sold_count_value',
                width: 70,
                render: (v) => (v === null || v === undefined ? '-' : v)
              },
              {
                title: 'New Price',
                dataIndex: 'new_price',
                width: 100,
                render: formatPrice
              },
              {
                title: 'Price Rule',
                dataIndex: 'pricing_change',
                width: 140,
                ellipsis: true
              },
              {
                title: t('history.destination'),
                dataIndex: 'destination',
                width: 110,
                render: (v) => v || '-'
              },
              {
                title: 'Session',
                dataIndex: 'session_id',
                width: 160,
                ellipsis: true,
                render: (v) => v || '-'
              },
              {
                title: 'File / Target',
                dataIndex: 'file_target',
                width: 220,
                ellipsis: true
              }
            ]}
            expandable={{
              expandedRowRender: (record) => (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11 }}>
                  {JSON.stringify(record.metadataObj || {}, null, 2)}
                </pre>
              ),
              rowExpandable: (record) =>
                record.metadataObj && Object.keys(record.metadataObj).length > 0
            }}
          />
        </Space>
      </Card>
    </div>
  );
}
