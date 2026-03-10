import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Space, Table, Tabs, message, Progress } from 'antd';

const HIDDEN_COLUMNS = new Set(['id', '__preview_id', 'session_id', 'created_at', 'updated_at', 'raw_query_data']);

export default function ImportTab({ t }) {
  const [filePath, setFilePath] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const [preview, setPreview] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('excel');

  const previewColumns = useMemo(() => {
    const orderedKeys = [];
    const seen = new Set();
    preview.forEach((row) => {
      Object.keys(row || {}).forEach((key) => {
        if (HIDDEN_COLUMNS.has(key)) return;
        if (seen.has(key)) return;
        seen.add(key);
        orderedKeys.push(key);
      });
    });
    return orderedKeys.map((key) => ({
      title: key,
      dataIndex: key,
      width: key.toLowerCase().includes('title') ? 320 : 150
    }));
  }, [preview]);

  const loadProducts = async () => {
    const products = await window.api.getProducts();
    if (products.success) {
      setPreview(products.data);
    }
  };

  const handlePickFile = async () => {
    const path = await window.api.openExcelDialog();
    if (path) setFilePath(path);
  };

  const handleImport = async () => {
    if (!filePath) {
      message.warning(t('messages.missingExcel'));
      return;
    }
    setLoading(true);
    try {
      const result = await window.api.importExcel(filePath);
      if (!result.success) {
        message.error(result.error || 'Import failed');
        return;
      }
      setImportSummary(result.data);
      await loadProducts();
      if ((result.data?.inserted || 0) === 0) {
        message.warning('No rows imported. Only products with sold rate 0 are imported.');
      } else {
        message.success(t('messages.importSuccess'));
      }
    } catch (error) {
      message.error(error.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleImportJtl = async () => {
    setLoading(true);
    try {
      const result = await window.api.importJtlData();
      if (!result.success) {
        message.error(result.error || 'JTL import failed');
        return;
      }
      setImportSummary(result.data);
      await loadProducts();
      if ((result.data?.inserted || 0) === 0) {
        message.warning('No rows imported. Only products with sold rate 0 are imported.');
      } else {
        message.success(t('messages.importSuccess'));
      }
    } catch (error) {
      message.error(error.message || 'JTL import failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    let cleanupProgress;
    let cleanupDbStatus;
    if (window.api?.getDbAgentStatus) {
      window.api.getDbAgentStatus().then((result) => {
        if (result?.success) {
          setDbConnected(Boolean(result.data?.connected));
        }
      });
    }
    if (window.api?.onDbAgentStatus) {
      cleanupDbStatus = window.api.onDbAgentStatus((status) => {
        setDbConnected(Boolean(status?.connected));
      });
    }
    if (window.api?.onProgress) {
      cleanupProgress = window.api.onProgress((data) => {
        if (data.scope === 'import') {
          setProgress(data);
        }
      });
    }
    return () => {
      if (cleanupProgress) cleanupProgress();
      if (cleanupDbStatus) cleanupDbStatus();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'jtl' && dbConnected) {
      handleImportJtl();
    }
  }, [activeTab, dbConnected]);

  useEffect(() => {
    if (!dbConnected && activeTab === 'jtl') {
      setActiveTab('excel');
    }
  }, [dbConnected, activeTab]);

  return (
    <div className="panel">
      <h2>{t('import.title')}</h2>
      <p className="panel-subtext">{t('import.subtitle')}</p>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'excel',
            label: t('import.excelTab'),
            children: (
              <Card title={t('import.excelImport')} variant="outlined">
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Button onClick={handlePickFile}>{t('import.selectExcel')}</Button>
                  <div className="empty-state">
                    {filePath ? filePath : t('import.dragHint')}
                  </div>
                  <Button type="primary" loading={loading} onClick={handleImport}>
                    {t('import.importBtn')}
                  </Button>
                  <Button
                    onClick={async () => {
                      await window.api.resetSession();
                      setPreview([]);
                      setImportSummary(null);
                    }}
                  >
                    {t('import.reset')}
                  </Button>
                  {importSummary ? (
                    <div className="empty-state" style={{ textAlign: 'left', lineHeight: 2 }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent-green, #059669)' }}>
                        ✓ Imported: {importSummary.inserted}
                      </span>
                      {'  ·  '}
                      <span>Total rows: {importSummary.total}</span>
                      {'  ·  '}
                      <span>Skipped (sold &gt; 0): {(importSummary.skipped || 0) - (importSummary.skippedNonPrinter || 0)}</span>
                      {importSummary.skippedNonPrinter > 0 && (
                        <>
                          {'  ·  '}
                          <span style={{ color: 'var(--accent-amber, #d97706)', fontWeight: 600 }}>
                            ⚠ Non-printer products skipped: {importSummary.skippedNonPrinter}
                          </span>
                        </>
                      )}
                    </div>
                  ) : null}
                </Space>
              </Card>
            )
          },
          ...(dbConnected
            ? [
                {
                  key: 'jtl',
                  label: t('import.jtlTab'),
                  children: (
                    <Card title={t('import.jtlTitle')} variant="outlined">
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <div className="empty-state">{t('import.jtlHint')}</div>
                      </Space>
                    </Card>
                  )
                }
              ]
            : [])
        ]}
      />
      <div style={{ marginTop: 16 }}>
        <Card title={t('import.preview')} variant="outlined">
          {preview.length ? (
            <Table
              size="small"
              bordered
              rowKey={(record, index) => record.__preview_id || record.id || `row_${index}`}
              dataSource={preview}
              pagination={{ pageSize: 10 }}
              scroll={{ x: true, y: 320 }}
              columns={previewColumns}
            />
          ) : (
            <div className="empty-state">{t('import.empty')}</div>
          )}
        </Card>
      </div>
      {progress ? (
        <div style={{ marginTop: 16 }}>
          <Progress percent={progress.percent || 0} status="active" />
          <div className="panel-subtext">{progress.message}</div>
        </div>
      ) : null}
    </div>
  );
}
