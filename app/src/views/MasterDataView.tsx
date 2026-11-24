import React, { useEffect, useState } from 'react';
import { BookOpen, Edit3, Package, Search, X } from 'lucide-react';
import { apiGet, apiSend, fmtVnd } from '../api';

interface Props {
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

export default function MasterDataView({ onToast }: Props) {
  const [subTab, setSubTab] = useState<'products' | 'guides'>('products');
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);

  const loadProducts = async () => {
    const res = await apiGet(`/api/master/products?q=${encodeURIComponent(q)}&type=${encodeURIComponent(typeFilter)}`);
    setProducts(res);
  };

  const loadGuides = async () => {
    setGuides(await apiGet(`/api/guides?q=${encodeURIComponent(q)}`));
  };

  useEffect(() => {
    if (subTab === 'products') loadProducts();
    else loadGuides();
  }, [subTab, typeFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (subTab === 'products') loadProducts();
    else loadGuides();
  };

  const saveEdit = async () => {
    try {
      await apiSend(`/api/master/products/${encodeURIComponent(editing.barcode)}`, 'PUT', editing);
      onToast(`Đã cập nhật SKU ${editing.barcode}`);
      setEditing(null);
      loadProducts();
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#3B281A]">Danh Mục Master & Thư Viện HDLR / HDBQ</h1>
          <p className="text-xs text-[#6e5543]">Nguồn sự thật duy nhất (682 mã: Sản phẩm + Phí POS + Bao bì BN-*) & 12 bộ hướng dẫn lắp ráp/bảo quản.</p>
        </div>
        <div className="flex bg-[#EFE7DC] p-1 rounded-lg self-start">
          <button
            onClick={() => setSubTab('products')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subTab === 'products' ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
          >
            <Package className="w-3.5 h-3.5" /> Master Data SKU
          </button>
          <button
            onClick={() => setSubTab('guides')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subTab === 'guides' ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
          >
            <BookOpen className="w-3.5 h-3.5" /> Thư viện HDLR / HDBQ
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#6e5543] absolute left-3 top-2.5" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={subTab === 'products' ? 'Tìm theo Barcode, tên sản phẩm, NCC...' : 'Tìm hướng dẫn lắp ráp / bảo quản (Kito, Cheri, Oki, Welin...)'}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs"
          />
        </div>
        {subTab === 'products' && (
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs font-medium"
          >
            <option value="">Tất cả phân loại</option>
            <option value="PRODUCT">Sản phẩm nội thất (PRODUCT)</option>
            <option value="SERVICE_FEE">Phí dịch vụ POS (19 SKU)</option>
            <option value="PACKAGING">Bao bì / Túi giấy (BN-*)</option>
          </select>
        )}
        <button type="submit" className="px-4 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold cursor-pointer">
          Tìm kiếm
        </button>
      </form>

      {subTab === 'products' ? (
        <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#F8F4EC] border-b border-[#E6DDD1] text-[#6e5543]">
                  <th className="py-2.5 px-3">Barcode</th>
                  <th className="py-2.5 px-3">Tên sản phẩm / Loại</th>
                  <th className="py-2.5 px-2 text-right">Giá bán</th>
                  <th className="py-2.5 px-2 text-right">Nặng (kg)</th>
                  <th className="py-2.5 px-2 text-right">P_Handling</th>
                  <th className="py-2.5 px-2 text-right">P_Install</th>
                  <th className="py-2.5 px-2 text-center">Bảo hành</th>
                  <th className="py-2.5 px-2 text-center">Min 3001</th>
                  <th className="py-2.5 px-2 text-center">Sửa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E9DF]">
                {products.map(p => (
                  <tr key={p.barcode} className="hover:bg-[#FAF7F2]">
                    <td className="py-2 px-3 font-mono text-[11px]">{p.barcode}</td>
                    <td className="py-2 px-3">
                      <div className="font-medium text-[#3B281A]">
                        {p.name_vn}
                        {p.is_top_50 ? <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">Top 50</span> : null}
                        {p.net_weight_g >= 25000 ? <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-100 text-[#9A2B26] text-[10px] font-bold">≥25kg (2 KTV)</span> : null}
                      </div>
                      <div className="text-[10px] text-[#6e5543]">{p.item_type} • {p.supplier_name || '—'}</div>
                    </td>
                    <td className="py-2 px-2 text-right font-medium">{p.retail_price ? fmtVnd(p.retail_price) : '—'}</td>
                    <td className="py-2 px-2 text-right">{p.net_weight_g ? (p.net_weight_g / 1000).toFixed(1) : '—'}</td>
                    <td className="py-2 px-2 text-right">{fmtVnd(p.p_handling)}</td>
                    <td className="py-2 px-2 text-right">{fmtVnd(p.p_installation)}</td>
                    <td className="py-2 px-2 text-center">{p.warranty_months ? `${p.warranty_months}T` : 'Không'}</td>
                    <td className="py-2 px-2 text-center font-semibold">{p.min_stock_3001}</td>
                    <td className="py-2 px-2 text-center">
                      <button onClick={() => setEditing({ ...p })} className="p-1 rounded hover:bg-[#EFE7DC] text-[#3B281A] cursor-pointer">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {guides.map(g => (
            <div key={g.id} className="bg-white rounded-xl p-4 border border-[#E6DDD1] space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-[#F8F4EC] border border-[#D6BCA5] text-[10px] font-bold text-[#3B281A]">{g.product_line}</span>
                <span className="text-[10px] text-[#6e5543]">{g.source_file}</span>
              </div>
              <h3 className="font-bold text-sm text-[#3B281A]">{g.title}</h3>
              <pre className="whitespace-pre-wrap font-sans text-xs text-[#4a392d] bg-[#FAF7F2] p-3 rounded-lg max-h-48 overflow-y-auto border border-[#EFE7DC]">
                {g.content_md}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E6DDD1] pb-2">
              <div className="font-bold text-[#3B281A]">Cập nhật SKU {editing.barcode}</div>
              <button onClick={() => setEditing(null)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="font-semibold text-[#6e5543]">Tên sản phẩm</label>
                <input value={editing.name_vn} onChange={e => setEditing({ ...editing, name_vn: e.target.value })} className="w-full mt-1 px-2.5 py-1.5 border border-[#D6BCA5] rounded-lg" />
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">P_Handling (đ)</label>
                <input type="number" value={editing.p_handling} onChange={e => setEditing({ ...editing, p_handling: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-1.5 border border-[#D6BCA5] rounded-lg" />
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">P_Installation (đ)</label>
                <input type="number" value={editing.p_installation} onChange={e => setEditing({ ...editing, p_installation: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-1.5 border border-[#D6BCA5] rounded-lg" />
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Khối lượng (gram)</label>
                <input type="number" value={editing.net_weight_g} onChange={e => setEditing({ ...editing, net_weight_g: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-1.5 border border-[#D6BCA5] rounded-lg" />
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Min Stock 3001</label>
                <input type="number" value={editing.min_stock_3001} onChange={e => setEditing({ ...editing, min_stock_3001: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-1.5 border border-[#D6BCA5] rounded-lg" />
              </div>
              <label className="col-span-2 flex items-center gap-2 mt-1">
                <input type="checkbox" checked={Boolean(editing.is_top_50)} onChange={e => setEditing({ ...editing, is_top_50: e.target.checked ? 1 : 0 })} />
                <span>Đánh dấu SKU Top 50 ưu tiên châm hàng</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Hủy</button>
              <button onClick={saveEdit} className="px-4 py-1.5 rounded-lg bg-[#3B281A] text-white text-xs font-semibold cursor-pointer">Lưu thay đổi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
