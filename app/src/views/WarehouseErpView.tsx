import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Ban, CheckCircle2, FileSpreadsheet,
  Plus, Printer, UploadCloud, Warehouse, X
} from 'lucide-react';
import { apiGet, apiSend, apiUpload, PrintDoc } from '../api';

interface Props {
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onPrint: (doc: PrintDoc) => void;
}

export default function WarehouseErpView({ onToast, onPrint }: Props) {
  const [subTab, setSubTabState] = useState<'slips' | 'erp' | 'reconcile'>(() => {
    const s = localStorage.getItem('benom_wh_subtab');
    return s === 'erp' || s === 'reconcile' ? s : 'slips';
  });
  const setSubTab = (v: 'slips' | 'erp' | 'reconcile') => {
    setSubTabState(v);
    localStorage.setItem('benom_wh_subtab', v);
  };
  const [slips, setSlips] = useState<any[]>([]);
  const [slipFilter, setSlipFilter] = useState('');
  const [showNewSlip, setShowNewSlip] = useState(false);

  // New Slip Form
  const [newSlip, setNewSlip] = useState<any>({
    slip_type: 'XK',
    expected_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    expected_time: '09:00',
    warehouse_code: '9005',
    partner_name: 'Toàn Nhất Logistics',
    carrier: 'Ahamove',
    purpose: 'Giao khách',
    ref_invoice: '',
    notes: '',
    items: [{ barcode: '', product_name: '', unit: 'Thùng', qty: 1 }],
  });

  // ERP Upload State
  const [erpUploading, setErpUploading] = useState(false);
  const [erpResult, setErpResult] = useState<any>(null);

  // Reconcile State
  const [recUploading, setRecUploading] = useState(false);
  const [recData, setRecData] = useState<any>(null);
  const [onlyDiff, setOnlyDiff] = useState(true);

  const loadSlips = async () => {
    try {
      setSlips(await apiGet(`/api/slips?type=${encodeURIComponent(slipFilter)}`));
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  useEffect(() => { loadSlips(); }, [slipFilter]);

  const submitNewSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiSend('/api/slips', 'POST', newSlip);
      onToast(`Đã tạo phiếu ${res.slip_no}${res.cutoff_warning ? ' (Có cảnh báo Cut-off)' : ''}`);
      setShowNewSlip(false);
      loadSlips();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const cancelSlip = async (s: any) => {
    const reason = prompt(`Nhập lý do hủy phiếu ${s.slip_no} (Lưu ý Đ5.3: hủy < 2h bị tính 50% phí xếp dỡ):`);
    if (reason === null) return;
    try {
      await apiSend(`/api/slips/${s.id}/status`, 'PUT', { status: 'Cancelled', cancel_reason: reason || 'Hủy lệnh' });
      onToast(`Đã chuyển phiếu ${s.slip_no} sang trạng thái Cancelled (giữ nguyên số thứ tự).`);
      loadSlips();
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const handleErpFile = async (file: File | undefined) => {
    if (!file) return;
    setErpUploading(true);
    try {
      const res = await apiUpload('/api/erp/upload', file);
      setErpResult(res);
      onToast(`Đã nạp ${res.imported_skus} SKU benom cho Store ${res.store_code} (${res.target_month})!`);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setErpUploading(false);
    }
  };

  const handleReconcileFile = async (file: File | undefined) => {
    if (!file) return;
    setRecUploading(true);
    try {
      const res = await apiUpload('/api/toannhat/reconcile', file);
      setRecData(res);
      onToast(`Đối soát xong ${res.total_skus} SKU: Khớp ${res.matched}, Lệch ${res.mismatched}`);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setRecUploading(false);
    }
  };

  // Live Cut-off preview
  const cutoffPreview = (() => {
    const warns: string[] = [];
    if (newSlip.expected_date) {
      const d = new Date(newSlip.expected_date + 'T00:00:00');
      const dow = d.getDay();
      if (dow === 0) warns.push('Chủ nhật: phụ phí xếp dỡ 200%–250% + 100k/h giám sát.');
      if (dow === 6 && parseInt(newSlip.expected_time, 10) >= 13) warns.push('Chiều Thứ 7: phụ phí 150%–200% + 100k/h.');
      if (newSlip.expected_date === new Date().toISOString().slice(0, 10)) warns.push('Đơn gấp trong ngày (< 4h): phí xếp dỡ 200% (HĐ 019-2026).');
    }
    if (parseInt(newSlip.expected_time, 10) >= 17) warns.push('Ngoài giờ 17h–21h: phí 150% + 100k/h giám sát.');
    return warns;
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#3B281A]">Kho 9005 Toàn Nhất & Dữ Liệu ERP Sidecar</h1>
          <p className="text-xs text-[#6e5543]">Quản lý Phiếu NK/XK (Cảnh báo Cut-off HĐ 019-2026), nạp file InventoryPLU CSV từ ERP Kohnan & Đối soát 3 chiều Excel Toàn Nhất (BD02).</p>
        </div>
        <div className="flex bg-[#EFE7DC] p-1 rounded-lg self-start">
          {[
            ['slips', 'Phiếu NK / XK'],
            ['erp', 'Nạp ERP CSV'],
            ['reconcile', 'Đối soát Toàn Nhất'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${subTab === id ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: SLIPS */}
      {subTab === 'slips' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {[['', 'Tất cả'], ['NK', 'Nhập kho (NK)'], ['XK', 'Xuất kho (XK)']].map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setSlipFilter(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${slipFilter === val ? 'bg-[#3B281A] text-white border-[#3B281A]' : 'bg-white text-[#3B281A] border-[#D6BCA5]'}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowNewSlip(true)}
              className="px-3.5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#563C28] cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Lập phiếu NK / XK
            </button>
          </div>

          <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#F8F4EC] border-b border-[#E6DDD1] text-[#6e5543]">
                    <th className="py-2.5 px-3">Số phiếu</th>
                    <th className="py-2.5 px-3">Ngày lập / Hẹn kho</th>
                    <th className="py-2.5 px-3">Mục đích & Đối tác</th>
                    <th className="py-2.5 px-3">Hàng hóa</th>
                    <th className="py-2.5 px-2 text-center">Trạng thái</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E9DF]">
                  {slips.map(s => (
                    <tr key={s.id} className={`hover:bg-[#FAF7F2] ${s.status === 'Cancelled' ? 'opacity-60' : ''}`}>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${s.slip_type === 'NK' ? 'bg-emerald-50 text-[#234E36]' : 'bg-blue-50 text-[#224B85]'}`}>
                          {s.slip_no}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-medium text-[#3B281A]">{s.slip_date}</div>
                        {s.expected_date && <div className="text-[10px] text-[#6e5543]">Hẹn: {s.expected_date} {s.expected_time}</div>}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#3B281A]">{s.purpose}</div>
                        <div className="text-[11px] text-[#6e5543]">{s.partner_name} {s.ref_invoice ? `• ĐH ${s.ref_invoice}` : ''}</div>
                        {s.cutoff_warning && (
                          <div className="mt-1 text-[10px] text-[#9A2B26] font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" /> {s.cutoff_warning}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 max-w-[220px]">
                        {s.items?.slice(0, 2).map((it: any, i: number) => (
                          <div key={i} className="truncate">• {it.product_name || it.barcode} (x{it.qty})</div>
                        ))}
                        {s.items?.length > 2 && <div className="text-[10px] text-[#6e5543]">+{s.items.length - 2} dòng khác</div>}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.status === 'Cancelled' ? 'bg-red-50 text-[#9A2B26]' :
                          s.status === 'Completed' ? 'bg-emerald-50 text-[#234E36]' : 'bg-amber-50 text-amber-800'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5">
                        <button
                          onClick={() => onPrint({ type: 'SLIP', data: s })}
                          className="px-2.5 py-1 rounded border border-[#D6BCA5] text-[#3B281A] hover:bg-[#F8F4EC] text-[11px] font-semibold cursor-pointer"
                        >
                          <Printer className="w-3 h-3 inline mr-1" /> In PDF
                        </button>
                        {s.status !== 'Cancelled' && (
                          <button
                            onClick={() => cancelSlip(s)}
                            className="px-2 py-1 rounded border border-red-200 text-[#9A2B26] hover:bg-red-50 text-[11px] cursor-pointer"
                            title="Hủy phiếu (không xóa số thứ tự)"
                          >
                            <Ban className="w-3 h-3 inline" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ERP CSV FILE-DROP SIDECAR */}
      {subTab === 'erp' && (
        <div className="bg-white rounded-2xl p-6 border border-[#E6DDD1] space-y-5">
          <div className="flex items-start gap-3">
            <Warehouse className="w-6 h-6 text-[#3B281A] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-[#3B281A]">Nạp File InventoryPLU CSV từ ERP Kohnan (Sidecar Mode)</h2>
              <p className="text-xs text-[#6e5543] mt-1">
                Kéo thả file CSV 69 cột tải từ ERP Kohnan (áp dụng cho cả Store <strong>3001</strong>, Kho <strong>9005</strong>, và Pop-up <strong>1001</strong>). Hệ thống tự động nhận diện tháng/kho, lọc sạch các mã không phải benom và cập nhật tức thì Dashboard & Diện tích kho 9005.
              </p>
            </div>
          </div>

          <label className="block border-2 border-dashed border-[#D6BCA5] rounded-2xl p-10 text-center bg-[#FAF7F2] hover:bg-[#F3ECE0] cursor-pointer transition-colors">
            <UploadCloud className="w-10 h-10 text-[#3B281A] mx-auto mb-2" />
            <div className="font-bold text-sm text-[#3B281A]">
              {erpUploading ? 'Đang xử lý & lọc SKU benom...' : 'Nhấn để chọn file InventoryPLU_*.csv'}
            </div>
            <div className="text-xs text-[#6e5543] mt-1">Hỗ trợ file dung lượng lớn (tối đa 50 MB)</div>
            <input type="file" accept=".csv" className="hidden" onChange={e => handleErpFile(e.target.files?.[0])} />
          </label>

          {erpResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-[#234E36] text-[#234E36] text-xs flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div>
                <strong>Nạp thành công!</strong> Kho/Store: <strong>{erpResult.store_code}</strong> • Tháng: <strong>{erpResult.target_month}</strong> • Đã lưu <strong>{erpResult.imported_skus}</strong> SKU benom có phát sinh (từ {erpResult.total_raw_lines.toLocaleString()} dòng ERP gốc).
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TOAN NHAT 3-WAY RECONCILIATION */}
      {subTab === 'reconcile' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-[#E6DDD1] space-y-4">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="w-6 h-6 text-[#234E36] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-[#3B281A]">Đối Soát 3 Chiều: Báo Cáo Excel Toàn Nhất (BD02) vs ERP Kho 9005</h2>
                <p className="text-xs text-[#6e5543] mt-1">
                  Tải lên file <code>BÁO CÁO TỒN KHO CÔNG TY KOHNAN THÁNG ...xlsx</code> từ Toàn Nhất. Hệ thống tự động bóc tiền tố <code>BD02- </code> / <code>BD02- R</code> (hàng hư hỏng) và so khớp trực tiếp với tồn ERP 9005 — giúp chốt biên bản đúng hạn 2 ngày làm việc theo HĐ 019-2026.
                </p>
              </div>
            </div>

            <label className="block border-2 border-dashed border-[#D6BCA5] rounded-2xl p-8 text-center bg-[#FAF7F2] hover:bg-[#F3ECE0] cursor-pointer">
              <UploadCloud className="w-9 h-9 text-[#234E36] mx-auto mb-2" />
              <div className="font-bold text-sm text-[#3B281A]">
                {recUploading ? 'Đang đối soát tồn kho 3 chiều...' : 'Chọn file Excel (.xlsx) Báo cáo tồn kho Toàn Nhất'}
              </div>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleReconcileFile(e.target.files?.[0])} />
            </label>
          </div>

          {recData && (
            <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
              <div className="p-4 bg-[#F8F4EC] border-b border-[#E6DDD1] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-xs">
                  <span>Sheet: <strong>{recData.sheet_used}</strong> (ERP {recData.erp_month})</span>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-[#234E36] font-bold">Khớp: {recData.matched} SKU</span>
                  <span className="px-2.5 py-1 rounded-full bg-red-50 text-[#9A2B26] font-bold">Lệch: {recData.mismatched} SKU</span>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-[#3B281A] cursor-pointer">
                  <input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} className="accent-[#9A2B26]" />
                  Chỉ hiện các mã lệch tồn
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-[#FAF7F2] border-b border-[#E6DDD1] text-[#6e5543]">
                      <th className="py-2.5 px-3">Barcode (Đã chuẩn hóa)</th>
                      <th className="py-2.5 px-3">Tên sản phẩm</th>
                      <th className="py-2.5 px-3 text-right">ERP 9005</th>
                      <th className="py-2.5 px-3 text-right">TN Hàng tốt</th>
                      <th className="py-2.5 px-3 text-right">TN Hư (R)</th>
                      <th className="py-2.5 px-3 text-right">Chênh lệch</th>
                      <th className="py-2.5 px-3 text-center">Kết luận</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0E9DF]">
                    {recData.comparison
                      .filter((r: any) => !onlyDiff || r.diff !== 0)
                      .map((r: any) => (
                        <tr key={r.barcode} className="hover:bg-[#FAF7F2]">
                          <td className="py-2 px-3 font-mono text-[11px]">{r.barcode}</td>
                          <td className="py-2 px-3 font-medium text-[#3B281A]">{r.product_name}</td>
                          <td className="py-2 px-3 text-right font-semibold">{r.erp_9005_qty}</td>
                          <td className="py-2 px-3 text-right">{r.toannhat_good_qty}</td>
                          <td className="py-2 px-3 text-right text-[#9A2B26]">{r.toannhat_damaged_qty || '—'}</td>
                          <td className={`py-2 px-3 text-right font-bold ${r.diff === 0 ? 'text-[#234E36]' : 'text-[#9A2B26]'}`}>
                            {r.diff > 0 ? `+${r.diff}` : r.diff}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.diff === 0 ? 'bg-emerald-50 text-[#234E36]' : 'bg-red-50 text-[#9A2B26]'}`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Slip Modal */}
      {showNewSlip && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-3 overflow-y-auto">
          <form onSubmit={submitNewSlip} className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
              <div className="font-bold">Lập Phiếu Yêu Cầu Nhập / Xuất Kho 9005</div>
              <button type="button" onClick={() => setShowNewSlip(false)} className="cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#6e5543]">Loại phiếu</label>
                  <select value={newSlip.slip_type} onChange={e => setNewSlip({ ...newSlip, slip_type: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                    <option value="XK">Xuất kho (XK)</option>
                    <option value="NK">Nhập kho (NK)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Mục đích</label>
                  <input value={newSlip.purpose} onChange={e => setNewSlip({ ...newSlip, purpose: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Ngày hẹn kho</label>
                  <input type="date" value={newSlip.expected_date} onChange={e => setNewSlip({ ...newSlip, expected_date: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Giờ hẹn</label>
                  <input type="time" value={newSlip.expected_time} onChange={e => setNewSlip({ ...newSlip, expected_time: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Chứng từ tham chiếu (ĐH/PO)</label>
                  <input value={newSlip.ref_invoice} onChange={e => setNewSlip({ ...newSlip, ref_invoice: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Đơn vị vận chuyển</label>
                  <input value={newSlip.carrier} onChange={e => setNewSlip({ ...newSlip, carrier: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
              </div>

              {cutoffPreview.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50 border border-[#9A2B26] text-[#9A2B26] space-y-1">
                  <div className="font-bold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Cảnh báo Hợp đồng 019-2026 (Toàn Nhất):</div>
                  {cutoffPreview.map((w, i) => <div key={i}>• {w}</div>)}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#3B281A]">Danh sách hàng hóa</span>
                  <button
                    type="button"
                    onClick={() => setNewSlip({ ...newSlip, items: [...newSlip.items, { barcode: '', product_name: '', unit: 'Thùng', qty: 1 }] })}
                    className="text-[#224B85] font-semibold hover:underline cursor-pointer"
                  >
                    + Thêm dòng
                  </button>
                </div>
                {newSlip.items.map((it: any, i: number) => (
                  <div key={i} className="grid grid-cols-12 gap-2">
                    <input placeholder="Barcode" value={it.barcode} onChange={e => { const a = [...newSlip.items]; a[i].barcode = e.target.value; setNewSlip({ ...newSlip, items: a }); }} className="col-span-4 px-2 py-1.5 border border-[#D6BCA5] rounded-lg" />
                    <input placeholder="Tên sản phẩm" value={it.product_name} onChange={e => { const a = [...newSlip.items]; a[i].product_name = e.target.value; setNewSlip({ ...newSlip, items: a }); }} className="col-span-6 px-2 py-1.5 border border-[#D6BCA5] rounded-lg" />
                    <input type="number" min={1} value={it.qty} onChange={e => { const a = [...newSlip.items]; a[i].qty = Number(e.target.value); setNewSlip({ ...newSlip, items: a }); }} className="col-span-2 px-2 py-1.5 border border-[#D6BCA5] rounded-lg text-center" />
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewSlip(false)} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Hủy</button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold cursor-pointer">Tạo phiếu</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
