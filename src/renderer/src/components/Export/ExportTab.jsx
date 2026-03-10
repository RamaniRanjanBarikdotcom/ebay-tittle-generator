import React, { useEffect, useState } from 'react';
import { Button, Card, Space, message, Progress } from 'antd';

export default function ExportTab({ t, systemLanguage }) {
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [loadingCsv, setLoadingCsv] = useState(false);
  const [progress, setProgress] = useState(null);

  const handleExportExcel = async () => {
    const filePath = await window.api.saveExcelDialog('Generated_Titles.xlsx');
    if (!filePath) return;
    setLoadingExcel(true);
    const result = await window.api.exportExcel({ filePath, language: systemLanguage });
    setLoadingExcel(false);
    if (!result.success) {
      message.error(result.error || t('messages.noTitlesExport'));
      return;
    }
    message.success(t('messages.exportSuccess'));
  };

  const handleExportCsv = async () => {
    setLoadingCsv(true);
    const result = await window.api.exportCsv({ language: systemLanguage });
    setLoadingCsv(false);
    if (!result.success) {
      message.error(result.error || t('messages.noTitlesExport'));
      return;
    }
    const savedPath = result.data?.filePath ? ` (${result.data.filePath})` : '';
    message.success(`${t('messages.exportSuccess')}${savedPath}`);
  };

  useEffect(() => {
    if (window.api?.onProgress) {
      const cleanup = window.api.onProgress((data) => {
        if (data.scope === 'export') {
          setProgress(data);
        }
      });
      return cleanup;
    }
  }, []);

  return (
    <div className="panel">
      <h2>{t('export.title')}</h2>
      <p className="panel-subtext">{t('export.subtitle')}</p>
      <div className="grid-two">
        <Card title={t('export.excel')} variant="outlined">
          <Space direction="vertical" size={12}>
            <Button type="primary" loading={loadingExcel} onClick={handleExportExcel}>
              {t('export.excelBtn')}
            </Button>
          </Space>
        </Card>
        <Card title={t('export.csv')} variant="outlined">
          <Space direction="vertical" size={12}>
            <Button type="primary" loading={loadingCsv} onClick={handleExportCsv}>
              {t('export.csvBtn')}
            </Button>
          </Space>
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
