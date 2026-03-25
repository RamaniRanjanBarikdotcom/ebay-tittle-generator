import { useEffect, useMemo, useState, useCallback } from 'react';
import { Button, Card, Input, Table, message, Tag, Space, Progress, Select } from 'antd';
import { formatDecimalDE, parseLooseNumber } from '../../utils/format.js';

const MARKETPLACE_MAX = { ebay: 80, amazon: 200, kaufland: 100, otto: 120 };
const MARKETPLACE_COLORS = { ebay: '#e53238', amazon: '#ff9900', kaufland: '#cc071e', otto: '#f00020' };

function getMax(marketplace) {
  return MARKETPLACE_MAX[marketplace] || 80;
}

export default function ReviewTab({ t }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [marketplaceFilter, setMarketplaceFilter] = useState('ebay');

  const titleMap = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const key = (r.title || '').trim().toLowerCase();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [rows]);

  const load = async () => {
    setLoading(true);
    const result = await window.api.getGeneratedTitles();
    setLoading(false);
    if (result.success) setRows(result.data);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (window.api?.onProgress) {
      const cleanup = window.api.onProgress((data) => {
        if (data.scope === 'generate' && data.percent === 100) load();
      });
      return cleanup;
    }
  }, []);

  const filteredRows = useMemo(
    () => rows.filter((r) => (r.marketplace || 'ebay') === marketplaceFilter),
    [rows, marketplaceFilter]
  );

  const handleTitleChange = (id, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, title: value } : r)));
  };

  const handleSave = async (record) => {
    const trimmed = (record.title || '').trim();
    const max = getMax(record.marketplace);
    if (!trimmed) { message.error(t('review.errorEmpty')); return; }
    if (trimmed.length > max) {
      message.error(`Title too long for ${record.marketplace} (max ${max} chars)`);
      return;
    }
    const result = await window.api.updateGeneratedTitle({ id: record.id, title: record.title });
    if (!result.success) { message.error(result.error || 'Update failed'); return; }
    message.success(t('review.saved'));
  };

  const handleSaveAll = useCallback(async () => {
    if (!filteredRows.length) return;

    const invalidRows = filteredRows.filter((r) => {
      const trimmed = (r.title || '').trim();
      return !trimmed || trimmed.length > getMax(r.marketplace);
    });

    if (invalidRows.length > 0) {
      message.error(`${invalidRows.length} titles have invalid length (empty or over marketplace limit)`);
      return;
    }

    const duplicateCount = filteredRows.filter((r) => {
      const key = (r.title || '').trim().toLowerCase();
      return key && titleMap.get(key) > 1;
    }).length;
    if (duplicateCount > 0) {
      message.warning(`${duplicateCount} duplicate titles found (will still save)`);
    }

    setSavingAll(true);
    setSaveProgress(0);

    let failed = 0;
    let saved = 0;
    const batchSize = 50;
    const totalRows = filteredRows.length;

    for (let i = 0; i < totalRows; i += batchSize) {
      const batch = filteredRows.slice(i, Math.min(i + batchSize, totalRows));
      const results = await Promise.allSettled(
        batch.map((row) => window.api.updateGeneratedTitle({ id: row.id, title: row.title }))
      );
      results.forEach((result) => {
        if (result.status === 'rejected' || !result.value?.success) failed += 1;
        else saved += 1;
      });
      setSaveProgress(Math.round(((i + batch.length) / totalRows) * 100));
    }

    setSavingAll(false);
    setSaveProgress(0);

    if (failed > 0) message.warning(`Saved ${saved} titles, ${failed} failed`);
    else message.success(`All ${saved} titles saved successfully`);
  }, [filteredRows, titleMap]);

  const isDuplicate = useCallback(
    (title) => {
      const key = (title || '').trim().toLowerCase();
      return key && titleMap.get(key) > 1;
    },
    [titleMap]
  );

  // Count per marketplace for tab badges
  const marketplaceCounts = useMemo(() => {
    const counts = {};
    rows.forEach((r) => {
      const mp = r.marketplace || 'ebay';
      counts[mp] = (counts[mp] || 0) + 1;
    });
    return counts;
  }, [rows]);

  return (
    <div className="panel">
      <h2>{t('review.title')}</h2>
      <p className="panel-subtext">{t('review.subtitle')}</p>
      <Card variant="borderless">
        <Space style={{ marginBottom: 12 }} direction="vertical" size="small">
          <Space wrap>
            {/* Marketplace filter */}
            <Select
              value={marketplaceFilter}
              onChange={setMarketplaceFilter}
              style={{ width: 140 }}
              options={['ebay', 'amazon', 'kaufland', 'otto'].map((mp) => ({
                value: mp,
                label: (
                  <span>
                    <Tag color={MARKETPLACE_COLORS[mp]} style={{ marginRight: 4 }}>
                      {mp}
                    </Tag>
                    {marketplaceCounts[mp] ?? 0}
                  </span>
                )
              }))}
            />
            <Button
              type="primary"
              onClick={handleSaveAll}
              loading={savingAll}
              disabled={!filteredRows.length}
            >
              Save All ({filteredRows.length})
            </Button>
            {filteredRows.length > 0 && (
              <Tag>
                Max {getMax(marketplaceFilter)} chars
              </Tag>
            )}
          </Space>
          {savingAll && (
            <Progress percent={saveProgress} size="small" status="active" style={{ width: 300 }} />
          )}
        </Space>

        {filteredRows.length ? (
          <Table
            size="small"
            rowKey="id"
            dataSource={filteredRows}
            loading={loading}
            pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['10', '50', '100', '500'] }}
            scroll={{ y: 500 }}
            columns={[
              { title: 'Item', dataIndex: 'item_number', width: 120 },
              { title: 'SKU', dataIndex: 'sku', width: 120 },
              { title: 'Var', dataIndex: 'variation_number', width: 50 },
              {
                title: 'Price Plan',
                width: 170,
                render: (_, record) => {
                  const oldPrice = parseLooseNumber(record.price);
                  const sold = parseLooseNumber(record.sold_count);
                  const nextPrice = parseLooseNumber(record.suggested_price);
                  if (oldPrice === null) return <Tag>n/a</Tag>;
                  if (sold !== null && sold === 0 && nextPrice !== null) {
                    return (
                      <Tag color="orange">
                        {formatDecimalDE(oldPrice, { fallback: '-' })} {'->'} {formatDecimalDE(nextPrice, { fallback: '-' })}
                      </Tag>
                    );
                  }
                  return <Tag color="green">{formatDecimalDE(oldPrice, { fallback: '-' })}</Tag>;
                }
              },
              {
                title: 'Title',
                dataIndex: 'title',
                render: (_, record) => (
                  <Input
                    value={record.title}
                    onChange={(e) => handleTitleChange(record.id, e.target.value)}
                    status={isDuplicate(record.title) ? 'warning' : undefined}
                  />
                )
              },
              {
                title: 'Len',
                dataIndex: 'title',
                width: 80,
                render: (value, record) => {
                  const len = (value || '').length;
                  const max = getMax(record.marketplace);
                  const dup = isDuplicate(value);
                  if (len > max) return <Tag color="red">{len}</Tag>;
                  if (dup) return <Tag color="orange">{len} dup</Tag>;
                  return <Tag color="green">{len}</Tag>;
                }
              },
              {
                title: 'Action',
                render: (_, record) => (
                  <Button size="small" type="primary" onClick={() => handleSave(record)}>
                    Save
                  </Button>
                ),
                width: 80
              }
            ]}
          />
        ) : (
          <div className="empty-state">{t('review.empty')}</div>
        )}
      </Card>
    </div>
  );
}
