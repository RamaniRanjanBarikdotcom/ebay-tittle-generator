import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Input,
  Popconfirm,
  Segmented,
  Spin,
  Table,
  Tooltip,
  message
} from 'antd';
import {
  DatabaseOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  TableOutlined,
  InboxOutlined
} from '@ant-design/icons';
import { formatDecimalDE } from '../../utils/format.js';

const SENSITIVE_TABLES = new Set(['app_settings']);

const SQLITE_TABLE_LABELS = {
  products: 'Products',
  generated_titles: 'Generated Titles',
  title_history: 'Title History',
  title_knowledge_base: 'Knowledge Base',
  app_settings: 'App Settings',
  app_logs: 'App Logs',
  language_settings: 'Language Settings',
  extracted_elements: 'Extracted Elements',
  sku_import_counts: 'Import Counts',
  price_history: 'Price History',
  users: 'Users'
};

const MYSQL_TABLE_LABELS = {
  app_products: 'Products',
  app_generated_titles: 'Generated Titles',
  app_title_history: 'Title History',
  app_title_knowledge_base: 'Knowledge Base',
  app_settings: 'App Settings',
  app_logs: 'App Logs',
  app_extracted_elements: 'Extracted Elements',
  app_sku_import_counts: 'Import Counts',
  app_price_history: 'Price History',
  app_csv_exports: 'CSV Exports',
  app_users: 'Users'
};

function formatCellValue(value, colName) {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: 12 }}>null</span>
    );
  }
  if (colName === 'password_hash' || colName === 'password') {
    return <span style={{ color: 'var(--muted)', letterSpacing: 2 }}>••••••••</span>;
  }
  const col = String(colName || '').toLowerCase();
  if ((col.includes('price') || col.includes('preis')) && !col.includes('adjustment') && !col.includes('status')) {
    const formatted = formatDecimalDE(value, { fallback: value });
    return formatted;
  }

  const str = String(value);
  if ((str.startsWith('{') || str.startsWith('[')) && str.length > 60) {
    return (
      <Tooltip
        title={
          <pre style={{ maxWidth: 420, whiteSpace: 'pre-wrap', margin: 0, fontSize: 11 }}>
            {str}
          </pre>
        }
      >
        <span style={{ cursor: 'help', color: 'var(--brand)', fontSize: 12 }}>
          {str.slice(0, 52)}…
        </span>
      </Tooltip>
    );
  }
  if (str.length > 120) {
    return (
      <Tooltip title={str}>
        <span style={{ cursor: 'help' }}>{str.slice(0, 117)}…</span>
      </Tooltip>
    );
  }
  return str;
}

function buildColumns(cols) {
  return cols.map((col) => ({
    title: (
      <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {col}
      </span>
    ),
    dataIndex: col,
    key: col,
    ellipsis: true,
    width:
      col === 'id' ? 64
      : col.includes('title') || col.includes('message') || col.includes('details') ? 300
      : col.includes('_at') || col.includes('_date') ? 170
      : 150,
    render: (value) => formatCellValue(value, col)
  }));
}

export default function DBViewerTab({ isAdmin }) {
  const [dbSource, setDbSource] = useState('mysql');
  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });
  const [searchText, setSearchText] = useState('');

  const loadTables = useCallback(async (source) => {
    setTablesLoading(true);
    setSelectedTable(null);
    setTableData([]);
    setColumns([]);
    setSelectedRowKeys([]);
    try {
      const result =
        source === 'mysql'
          ? await window.api.getAppDbTables()
          : await window.api.getLocalDbTables();
      if (result.success) setTables(result.data || []);
      else message.error(result.error || 'Failed to load tables');
    } finally {
      setTablesLoading(false);
    }
  }, []);

  const loadTableData = useCallback(async (tableName, page = 1, pageSize = 50, source, search = '') => {
    if (!tableName) return;
    setDataLoading(true);
    setSelectedRowKeys([]);
    try {
      const result =
        source === 'mysql'
          ? await window.api.getAppDbTableData({ table: tableName, page, pageSize, search })
          : await window.api.getLocalDbTableData({ table: tableName, page, pageSize, search });
      if (result.success) {
        const { rows, total, columns: cols } = result.data;
        setTableData(rows || []);
        setPagination({ current: page, pageSize, total: total || 0 });
        setColumns(buildColumns(cols || []));
      } else {
        message.error(result.error || 'Failed to load table data');
      }
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTables(dbSource);
  }, [dbSource, loadTables]);

  useEffect(() => {
    if (selectedTable) {
      loadTableData(selectedTable, 1, pagination.pageSize, dbSource, searchText);
    }
  }, [selectedTable]);

  useEffect(() => {
    setSearchText('');
  }, [dbSource, selectedTable]);

  const handleDelete = async () => {
    if (!selectedRowKeys.length || !selectedTable) return;
    const result = await window.api.deleteLocalDbRows({
      table: selectedTable,
      ids: selectedRowKeys
    });
    if (result.success) {
      message.success(`Deleted ${result.data.deleted} row(s)`);
      setSelectedRowKeys([]);
      await loadTableData(selectedTable, 1, pagination.pageSize, dbSource);
      await loadTables(dbSource);
    } else {
      message.error(result.error || 'Delete failed');
    }
  };

  const tableLabel = (name) => {
    if (dbSource === 'sqlite') return SQLITE_TABLE_LABELS[name] || name;
    return MYSQL_TABLE_LABELS[name] || name;
  };

  const canDelete =
    isAdmin &&
    dbSource === 'sqlite' &&
    selectedRowKeys.length > 0 &&
    !SENSITIVE_TABLES.has(selectedTable);

  const isMysql = dbSource === 'mysql';

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', minHeight: 520 }}>

      {/* ── Header bar ── */}
      <div style={{
        padding: '18px 24px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--brand), var(--brand-2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', lineHeight: 1.2 }}>
              DB Viewer
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {isMysql ? 'MySQL / App SQL database' : 'Local SQLite database'}
              {!isMysql && isAdmin && ' · Admin: select rows to delete'}
            </div>
          </div>
        </div>

        <Segmented
          value={dbSource}
          onChange={setDbSource}
          options={[
            {
              value: 'mysql',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: isMysql ? '#22c55e' : 'var(--muted)',
                    flexShrink: 0, transition: 'background 200ms'
                  }} />
                  MySQL / App SQL
                </span>
              )
            },
            {
              value: 'sqlite',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: !isMysql ? '#3b82f6' : 'var(--muted)',
                    flexShrink: 0, transition: 'background 200ms'
                  }} />
                  SQLite (Local)
                </span>
              )
            }
          ]}
        />
      </div>

      {/* ── Body: sidebar + data pane ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--surface-soft)'
        }}>
          {/* Sidebar header */}
          <div style={{
            padding: '12px 14px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--muted)' }}>
              Tables
            </span>
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined style={{ fontSize: 12 }} />}
              loading={tablesLoading}
              onClick={() => loadTables(dbSource)}
              style={{ color: 'var(--muted)', padding: '0 6px', height: 24 }}
            />
          </div>

          {/* Table list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            {tablesLoading ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <Spin size="small" />
              </div>
            ) : tables.length === 0 ? (
              <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                {isMysql ? 'No App SQL profile configured' : 'No tables found'}
              </div>
            ) : (
              tables.map((t) => {
                const isSelected = selectedTable === t.name;
                return (
                  <button
                    key={t.name}
                    onClick={() => setSelectedTable(t.name)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: isSelected
                        ? 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(8,145,178,0.08))'
                        : 'transparent',
                      cursor: 'pointer',
                      marginBottom: 2,
                      textAlign: 'left',
                      transition: 'background 150ms',
                      outline: isSelected ? '1px solid rgba(37,99,235,0.25)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(15,23,42,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <TableOutlined style={{
                        fontSize: 12,
                        color: isSelected ? 'var(--brand)' : 'var(--muted)',
                        flexShrink: 0
                      }} />
                      <span style={{
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected ? 'var(--brand)' : 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {tableLabel(t.name)}
                      </span>
                    </span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: t.count > 0 ? (isSelected ? 'var(--brand)' : 'var(--muted)') : '#ccc',
                      flexShrink: 0,
                      minWidth: 24,
                      textAlign: 'right'
                    }}>
                      {t.count > 999999 ? `${Math.floor(t.count / 1000)}k` : t.count}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Data pane */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedTable ? (
            <>
              {/* Data pane header */}
              <div style={{
                padding: '11px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexShrink: 0,
                background: 'var(--surface-strong)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    background: isMysql
                      ? 'rgba(34,197,94,0.1)'
                      : 'rgba(59,130,246,0.1)',
                    color: isMysql ? '#16a34a' : '#2563eb',
                    border: `1px solid ${isMysql ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)'}`
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: isMysql ? '#22c55e' : '#3b82f6'
                    }} />
                    {tableLabel(selectedTable)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {pagination.total.toLocaleString()} rows
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Input.Search
                    allowClear
                    size="small"
                    value={searchText}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchText(value);
                      if (!value.trim()) {
                        loadTableData(selectedTable, 1, pagination.pageSize, dbSource, '');
                      }
                    }}
                    onSearch={(value) =>
                      loadTableData(selectedTable, 1, pagination.pageSize, dbSource, value)
                    }
                    prefix={<SearchOutlined />}
                    placeholder="Search item / SKU / title..."
                    style={{ width: 260 }}
                  />
                  {canDelete && (
                    <Popconfirm
                      title={`Delete ${selectedRowKeys.length} selected row(s)?`}
                      description={`From table "${selectedTable}". This cannot be undone.`}
                      onConfirm={handleDelete}
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                      cancelText="Cancel"
                      placement="bottomRight"
                    >
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        style={{ fontSize: 12 }}
                      >
                        Delete {selectedRowKeys.length} row{selectedRowKeys.length !== 1 ? 's' : ''}
                      </Button>
                    </Popconfirm>
                  )}
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={dataLoading}
                    onClick={() =>
                      loadTableData(selectedTable, pagination.current, pagination.pageSize, dbSource, searchText)
                    }
                    style={{ fontSize: 12 }}
                  >
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Table */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                <Table
                  size="small"
                  loading={dataLoading}
                  rowKey={(record) => record.id ?? record.rowid ?? JSON.stringify(record)}
                  dataSource={tableData}
                  columns={columns}
                  scroll={{ x: 'max-content' }}
                  style={{ fontSize: 13 }}
                  rowSelection={
                    isAdmin && dbSource === 'sqlite' && !SENSITIVE_TABLES.has(selectedTable)
                      ? { selectedRowKeys, onChange: setSelectedRowKeys, columnWidth: 40 }
                      : undefined
                  }
                  pagination={{
                    current: pagination.current,
                    pageSize: pagination.pageSize,
                    total: pagination.total,
                    showSizeChanger: true,
                    pageSizeOptions: ['20', '50', '100', '200'],
                    size: 'small',
                    showTotal: (total, range) =>
                      `${range[0]}–${range[1]} of ${total.toLocaleString()} rows`,
                    onChange: (page, pageSize) => {
                      setPagination((p) => ({ ...p, current: page, pageSize }));
                      loadTableData(selectedTable, page, pageSize, dbSource, searchText);
                    },
                    style: { padding: '10px 16px' }
                  }}
                />
              </div>
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              color: 'var(--muted)'
            }}>
              <InboxOutlined style={{ fontSize: 40, opacity: 0.3 }} />
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Select a table to browse its data
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {tables.length > 0
                  ? `${tables.length} table${tables.length !== 1 ? 's' : ''} available`
                  : tablesLoading ? 'Loading…' : 'No tables found'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
