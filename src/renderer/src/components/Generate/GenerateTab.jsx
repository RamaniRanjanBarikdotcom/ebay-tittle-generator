import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Space, Tag, message, Progress, Table, Input, Select } from 'antd';
import { ThunderboltOutlined, SearchOutlined, DownloadOutlined } from '@ant-design/icons';

export default function GenerateTab({ t, systemLanguage, generateCache, setGenerateCache, onViewReview }) {
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [progress, setProgress] = useState(null);
  const [products, setProducts] = useState([]);
  const [generatedRows, setGeneratedRows] = useState([]);
  const [extractedSearch, setExtractedSearch] = useState('');
  const [generatedSearch, setGeneratedSearch] = useState('');
  const [generatedMarketplace, setGeneratedMarketplace] = useState('ebay');
  const extractedRows = generateCache?.extractedRows || [];
  const summary = generateCache?.summary || null;
  const extractionComplete = products.length > 0 && extractedRows.length === products.length;

  const loadProducts = async () => {
    const res = await window.api.getProducts();
    if (res.success) setProducts(res.data || []);
  };

  const loadGenerated = async () => {
    const res = await window.api.getGeneratedTitles();
    if (res.success) setGeneratedRows(res.data || []);
  };

  const handleExtract = async () => {
    setLoadingExtract(true);
    try {
      const result = await window.api.extractElements();
      setLoadingExtract(false);
      if (!result.success) {
        message.error(result.error || 'Extraction failed');
        return;
      }
      const rows = result.data?.extracted || [];
      setGenerateCache((prev) => ({ ...(prev || {}), extractedRows: rows }));
      message.success(`Extracted elements for ${result.data?.total || rows.length} products`);
    } catch (error) {
      setLoadingExtract(false);
      message.error(error.message || 'Extraction failed');
    }
  };

  const handleExportExtracted = () => {
    if (!extractedRows.length) {
      message.warning('No extracted data to export');
      return;
    }

    const columns = [
      'item_number', 'sku', 'old_title', 'category', 'brand', 'printer_brand',
      'kompatibel', 'cartridge_models', 'printer_models', 'set_of', 'qty',
      'color', 'extra', 'variation_set_of', 'variation_color', 'variation_printer_model',
      'verification_status', 'verification_confidence', 'verification_issues'
    ];

    const escape = (val) => {
      const s = String(val ?? '').replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const header = columns.join(',');
    const rows = extractedRows.map((row) => columns.map((col) => escape(row[col])).join(','));
    const csv = [header, ...rows].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted_elements_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`Exported ${extractedRows.length} rows`);
  };

  const handleExportGenerated = () => {
    if (!generatedWithExtraction.length) {
      message.warning('No generated data to export');
      return;
    }

    const columns = [
      'item_number', 'sku', 'variation_number', 'old_title', 'new_title',
      'category', 'brand', 'printer_brand', 'kompatibel', 'cartridge_models',
      'printer_models', 'set_of', 'qty', 'color', 'extra',
      'verification_status', 'verification_confidence', 'verification_issues'
    ];

    const escape = (val) => {
      const s = String(val ?? '').replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const header = columns.join(',');
    const rows = generatedWithExtraction.map((row) => columns.map((col) => escape(row[col])).join(','));
    const csv = [header, ...rows].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generated_titles_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`Exported ${generatedWithExtraction.length} rows`);
  };

  const handleGenerate = async () => {
    if (!products.length) {
      message.warning('Import products first');
      return;
    }
    if (!extractionComplete) {
      message.warning('Run "Extract Elements from Old Titles" before generating titles');
      return;
    }

    setLoadingGenerate(true);
    setProgress({ percent: 0, message: 'Starting...' });

    try {
      const result = await window.api.generateTitles({
        language: 'de',
        autoDetect: false
      });
      setLoadingGenerate(false);

      if (!result.success) {
        message.error(result.error || t('messages.generationFailed'));
        return;
      }

      setGenerateCache((prev) => ({ ...(prev || {}), summary: result.data }));
      await loadGenerated();
      message.success(t('messages.generateSuccess'));
      if (onViewReview) onViewReview();
    } catch (error) {
      setLoadingGenerate(false);
      message.error(error.message || 'Generation failed');
    }
  };

  useEffect(() => {
    loadProducts();
    loadGenerated();
    if (window.api?.onProgress) {
      const cleanup = window.api.onProgress((data) => {
        if (data.scope === 'generate') {
          setProgress(data);
        }
        if (data.scope === 'import' && data.percent === 100) {
          setGeneratedRows([]);
          loadProducts();
        }
      });
      return cleanup;
    }
    return undefined;
  }, []);

  const renderSummary = () => {
    if (!summary) return t('generate.empty');
    return `Products: ${summary.productCount} | Titles: ${summary.generatedCount} | Price updates pending: ${summary.priceAdjustedCount || 0}`;
  };

  const extractedByProductId = useMemo(() => {
    const map = new Map();
    for (const row of extractedRows) {
      if (row?.id) map.set(row.id, row);
    }
    return map;
  }, [extractedRows]);

  const previewRows = useMemo(
    () =>
      products.map((row, index) => ({
        ...row,
        __rowKey: row.id ?? `preview-${row.item_number || 'item'}-${row.sku || 'sku'}-${index}`
      })),
    [products]
  );

  const extractedTableRows = useMemo(
    () =>
      extractedRows.map((row, index) => ({
        ...row,
        __rowKey: row.id ?? `extract-${row.item_number || 'item'}-${row.sku || 'sku'}-${index}`
      })),
    [extractedRows]
  );

  const filteredExtractedTableRows = useMemo(() => {
    const q = extractedSearch.trim().toLowerCase();
    if (!q) return extractedTableRows;
    return extractedTableRows.filter((row) => {
      const haystack = [
        row.item_number,
        row.sku,
        row.old_title,
        row.category,
        row.printer_brand,
        row.cartridge_models,
        row.printer_models,
        row.color
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [extractedTableRows, extractedSearch]);

  const generatedWithExtraction = useMemo(
    () =>
      generatedRows.map((row, index) => {
        const extracted = extractedByProductId.get(row.product_id) || {};
        return {
          __rowKey:
            row.id ??
            `generated-${row.product_id || 'product'}-${row.variation_number || 'var'}-${index}`,
          item_number: row.item_number,
          sku: row.sku,
          marketplace: row.marketplace || 'ebay',
          old_title: row.original_title,
          new_title: row.title,
          variation_number: row.variation_number,
          category: extracted.category || '',
          brand: extracted.brand || '',
          printer_brand: extracted.printer_brand || '',
          kompatibel: extracted.kompatibel || '',
          cartridge_models: extracted.cartridge_models || '',
          printer_models: extracted.printer_models || '',
          set_of: extracted.set_of || '',
          qty: extracted.qty || '',
          color: extracted.color || '',
          extra: extracted.extra || '',
          verification_status: extracted.verification_status || '',
          verification_confidence: extracted.verification_confidence ?? '',
          verification_issues: extracted.verification_issues || ''
        };
      }),
    [generatedRows, extractedByProductId]
  );

  const filteredGeneratedWithExtraction = useMemo(() => {
    const q = generatedSearch.trim().toLowerCase();
    return generatedWithExtraction.filter((row) => {
      if (generatedMarketplace !== 'all' && row.marketplace !== generatedMarketplace) return false;
      if (!q) return true;
      const haystack = [
        row.item_number,
        row.sku,
        row.marketplace,
        row.old_title,
        row.new_title,
        row.cartridge_models,
        row.printer_models,
        row.color
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [generatedWithExtraction, generatedSearch, generatedMarketplace]);

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h2>{t('generate.title')}</h2>
          <p className="panel-subtext">{t('generate.subtitle')}</p>
        </div>
        <div className="panel-subtext" style={{ textAlign: 'right' }}>
          {t('generate.systemLanguage')}: <strong>{systemLanguage === 'de' ? 'German (Deutsch)' : 'English'}</strong>
          <div>{t('generate.marketNotice')}</div>
        </div>
      </div>

      <div className="grid-two">
        <Card title={t('generate.settings')} variant="outlined">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Tag color={products.length ? 'blue' : 'default'}>
              Step 1: Import data ({products.length} rows)
            </Tag>

            <Button
              size="large"
              loading={loadingExtract}
              disabled={!products.length}
              onClick={handleExtract}
              icon={<SearchOutlined />}
              style={{ width: '100%' }}
            >
              {loadingExtract ? 'Extracting Elements...' : 'Extract Elements from Old Titles'}
            </Button>
            <Tag color={extractionComplete ? 'green' : 'default'}>
              Step 2: Extract elements ({extractedRows.length}/{products.length})
            </Tag>

            <Button
              type="primary"
              size="large"
              loading={loadingGenerate}
              disabled={!extractionComplete}
              onClick={handleGenerate}
              icon={<ThunderboltOutlined />}
              style={{ width: '100%' }}
            >
              {loadingGenerate ? 'Generating...' : t('generate.generateBtn')}
            </Button>
            <Tag color={summary ? 'green' : 'default'}>Step 3: Generate titles</Tag>

            {summary ? <div className="empty-state">{renderSummary()}</div> : null}
          </Space>
        </Card>

        <Card title="Summary" variant="outlined">
          <div className="empty-state">{renderSummary()}</div>
          <div style={{ marginTop: 12 }}>
            <Tag color="blue">Imported rows: {products.length}</Tag>
            <Tag color="geekblue">Extracted rows: {extractedRows.length}</Tag>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title={t('generate.preview')} variant="outlined">
          {products.length ? (
            <Table
              size="small"
              rowKey="__rowKey"
              dataSource={previewRows}
              pagination={{ pageSize: 10 }}
              scroll={{ x: true, y: 320 }}
              columns={[
                { title: 'Item number', dataIndex: 'item_number', width: 140 },
                { title: 'Old title', dataIndex: 'original_title' },
                { title: 'SKU', dataIndex: 'sku', width: 160 }
              ]}
            />
          ) : (
            <div className="empty-state">{t('generate.empty')}</div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Extracted Elements ({filteredExtractedTableRows.length}/{extractedRows.length})</span>
              <Space size={8} wrap>
                <Input.Search
                  allowClear
                  placeholder="Search extracted rows..."
                  value={extractedSearch}
                  onChange={(e) => setExtractedSearch(e.target.value)}
                  onSearch={setExtractedSearch}
                  style={{ width: 260 }}
                />
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  disabled={!extractedRows.length}
                  onClick={handleExportExtracted}
                >
                  Export CSV
                </Button>
              </Space>
            </div>
          }
          variant="outlined"
        >
          {extractedRows.length ? (
            <Table
              size="small"
              rowKey="__rowKey"
              dataSource={filteredExtractedTableRows}
              pagination={{ pageSize: 10 }}
              scroll={{ x: true, y: 320 }}
              columns={[
                { title: 'Item', dataIndex: 'item_number', width: 120 },
                { title: 'SKU', dataIndex: 'sku', width: 140 },
                { title: 'Old title', dataIndex: 'old_title', width: 360 },
                { title: 'Category', dataIndex: 'category', width: 100 },
                { title: 'Brand', dataIndex: 'brand', width: 140 },
                { title: 'Printer brand', dataIndex: 'printer_brand', width: 140 },
                { title: 'Kompatibel', dataIndex: 'kompatibel', width: 140 },
                { title: 'Cartridge models', dataIndex: 'cartridge_models', width: 220 },
                { title: 'Printer models', dataIndex: 'printer_models', width: 220 },
                { title: 'Set of', dataIndex: 'set_of', width: 100 },
                { title: 'Qty', dataIndex: 'qty', width: 80 },
                { title: 'Color', dataIndex: 'color', width: 100 },
                { title: 'Extra', dataIndex: 'extra', width: 160 },
                { title: 'Verify', dataIndex: 'verification_status', width: 100 },
                { title: 'Conf %', dataIndex: 'verification_confidence', width: 90 },
                { title: 'Issues', dataIndex: 'verification_issues', width: 260 }
              ]}
            />
          ) : (
            <div className="empty-state">Run &quot;Extract Elements from Old Titles&quot; to preview extracted title parts.</div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Generated Titles + Extraction ({filteredGeneratedWithExtraction.length}/
                {generatedWithExtraction.length})
              </span>
              <Space size={8} wrap>
                <Select
                  value={generatedMarketplace}
                  onChange={setGeneratedMarketplace}
                  style={{ width: 150 }}
                  options={[
                    { value: 'all', label: 'All Marketplaces' },
                    { value: 'ebay', label: 'eBay' },
                    { value: 'amazon', label: 'Amazon' },
                    { value: 'kaufland', label: 'Kaufland' },
                    { value: 'otto', label: 'Otto' }
                  ]}
                />
                <Input.Search
                  allowClear
                  placeholder="Search generated rows..."
                  value={generatedSearch}
                  onChange={(e) => setGeneratedSearch(e.target.value)}
                  onSearch={setGeneratedSearch}
                  style={{ width: 260 }}
                />
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  disabled={!generatedWithExtraction.length}
                  onClick={handleExportGenerated}
                >
                  Export CSV
                </Button>
              </Space>
            </div>
          }
          variant="outlined"
        >
          {generatedWithExtraction.length ? (
            <Table
              size="small"
              rowKey="__rowKey"
              dataSource={filteredGeneratedWithExtraction}
              pagination={{ pageSize: 10 }}
              scroll={{ x: true, y: 320 }}
              columns={[
                { title: 'Item', dataIndex: 'item_number', width: 120 },
                { title: 'SKU', dataIndex: 'sku', width: 140 },
                { title: 'Marketplace', dataIndex: 'marketplace', width: 110 },
                { title: 'Variation', dataIndex: 'variation_number', width: 100 },
                { title: 'Old title', dataIndex: 'old_title', width: 320 },
                { title: 'New title', dataIndex: 'new_title', width: 320 },
                { title: 'Category', dataIndex: 'category', width: 100 },
                { title: 'Brand', dataIndex: 'brand', width: 140 },
                { title: 'Printer brand', dataIndex: 'printer_brand', width: 140 },
                { title: 'Kompatibel', dataIndex: 'kompatibel', width: 140 },
                { title: 'Cartridge models', dataIndex: 'cartridge_models', width: 220 },
                { title: 'Printer models', dataIndex: 'printer_models', width: 220 },
                { title: 'Set of', dataIndex: 'set_of', width: 100 },
                { title: 'Qty', dataIndex: 'qty', width: 80 },
                { title: 'Color', dataIndex: 'color', width: 100 },
                { title: 'Extra', dataIndex: 'extra', width: 160 },
                { title: 'Verify', dataIndex: 'verification_status', width: 100 },
                { title: 'Conf %', dataIndex: 'verification_confidence', width: 90 },
                { title: 'Issues', dataIndex: 'verification_issues', width: 260 }
              ]}
            />
          ) : (
            <div className="empty-state">Generate titles to inspect output with extracted elements per row.</div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Tag color="blue">{t('generate.tagVariations')}</Tag>
        <Tag color="green">{t('generate.tagLimit')}</Tag>
        <Tag color="purple">{t('generate.tagDuplicate')}</Tag>
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
