export function normalizeProductRecord(row = {}) {
  return {
    id: row.id ?? null,
    itemNumber: String(row.item_number || '').trim(),
    sku: String(row.sku || '').trim(),
    oldTitle: String(row.original_title || '').trim(),
    source: row.source || 'excel',
    sessionId: row.session_id || null,
    category: row.category || null,
    brand: row.brand || null,
    ebayCategoryName: row.ebay_category_name || null,
    price: row.price ?? null,
    quantity: row.quantity ?? null,
    soldCount: row.sold_count ?? null,
    suggestedPrice: row.suggested_price ?? null,
    priceAdjustment: row.price_adjustment || null,
    priceUpdateStatus: row.price_update_status || null
  };
}
