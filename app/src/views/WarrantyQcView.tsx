import React, { useEffect, useState } from 'react';
import {
  AlertOctagon, ClipboardList, Clock, Factory, FileOutput, PackagePlus,
  Plus, Printer, Search, ShieldCheck, Wrench, X
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { apiGet, apiSend, AuthUser, fmtVnd, PrintDoc } from '../api';
import Bm03Modal from '../components/Bm03Modal';
import Bm04Modal from '../components/Bm04Modal';

const WOOD_DEFECT_CATEGORIES = [
  'Cong vênh / Co ngót gỗ',
  'Bong keo / Nứt mối ghép / Veneer',
  'Lỗi sơn PU / Trầy xước / Lệch màu',
  'Lệch lỗ khoan / Lỗi ngũ kim',
  'Xẹp mút / Rách nỉ / Lỗi may sofa',
  'Vỡ kính / Đá / Đèn điện',
  'Lỗi đóng gói / Thiếu phụ kiện',
  'Khác',
];

interface Props {
  user: AuthUser;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onPrint: (doc: PrintDoc) => void;
}

type SubTab = 'warranty' | 'bm03' | 'bm04' | 'qc' | 'support';

export default function WarrantyQcView({ user, onToast, onPrint }: Props) {
  const canCreateOrEditQc = user.role === 'ADMIN' || user.role === 'EDITOR';
  const canUpdateTicketOrLog = user.role === 'ADMIN' || user.role === 'EDITOR' || user.role === 'KTV';

  const [subTab, setSubTabState] = useState<SubTab>(() => {
    const s = localStorage.getItem('benom_war_subtab') as SubTab;
    return ['warranty', 'bm03', 'bm04', 'qc', 'support'].includes(s) ? s : 'warranty';
  });
  const setSubTab = (v: SubTab) => {
    setSubTabState(v);
    localStorage.setItem('benom_war_subtab', v);
  };

  const [tickets, setTickets] = useState<any[]>([]);
  const [bm03List, setBm03List] = useState<any[]>([]);
  const [bm04List, setBm04List] = useState<any[]>([]);
  const [qcList, setQcList] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  // Active modals
  const [activeBm03, setActiveBm03] = useState<any>(null);
  const [activeBm04, setActiveBm04] = useState<any>(null);
  const [showNewQc, setShowNewQc] = useState(false);
  const [qcSkuQuery, setQcSkuQuery] = useState('');
  const [qcSkuMatches, setQcSkuMatches] = useState<any[]>([]);
  const [newQc, setNewQc] = useState({
    supplier_name: '',
    barcode: '',
    product_name: '',
    defect_category: WOOD_DEFECT_CATEGORIES[2],
    issue: '',
    defective_qty: 1,
    sold_qty: 0,
    stock_qty: 0,
    action: 'Back to factory',
    est_out: 'TBU',
    est_in: 'TBU',
  });

  // Lookup
  const [lookupQ, setLookupQ] = useState('');
  const [lookupRes, setLookupRes] = useState<any[]>([]);

  // Create Ticket Modal
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newTicket, setNewTicket] = useState({
    invoice_no: '', customer_name: '', customer_phone: '', address: '',
    barcode: '', product_name: '', channel: 'Zalo OA', issue_desc: '',
    service_level: 'C1', is_in_warranty: true, ktv_assigned: 'Trần Anh Tuyến',
  });

  // New Support Log
  const [newLog, setNewLog] = useState({
    log_date: new Date().toISOString().slice(0, 10),
    staff_name: user.full_name || 'Trần Anh Tuyến',
    category: 'QC Xưởng NCC',
    location: 'Xưởng Bình Dương / Store 3001',
    hours: 4,
    notes: '',
  });

  const loadAll = async () => {
    try {
      const [t, b3, b4, q, s] = await Promise.all([
        apiGet('/api/warranty'),
        apiGet('/api/bm03'),
        apiGet('/api/bm04'),
        apiGet('/api/qc-returns'),
        apiGet('/api/support-logs'),
      ]);
      setTickets(t);
      setBm03List(b3);
      setBm04List(b4);
      setQcList(q);
      setLogs(s);
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  useEffect(() => { loadAll(); }, []);

  const doLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupQ.trim()) return;
    try {
      setLookupRes(await apiGet(`/api/warranty/lookup?q=${encodeURIComponent(lookupQ)}`));
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const prefillTicketFromLookup = (r: any) => {
    setNewTicket({
      invoice_no: r.invoice_no,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      address: r.address,
      barcode: r.barcode,
      product_name: r.product_name,
      channel: 'Zalo OA',
      issue_desc: '',
      service_level: 'C1',
      is_in_warranty: r.warranty_status === 'Còn bảo hành',
      ktv_assigned: 'Trần Anh Tuyến',
    });
    setShowNewTicket(true);
  };

  const submitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiSend('/api/warranty', 'POST', newTicket);
      onToast(`Đã tạo Ticket bảo hành ${res.ticket_no} (tự động tính mốc SLA 2h/24h/48h GMT+7)!`);
      setShowNewTicket(false);
      loadAll();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const updateTicketStatus = async (t: any, status: string) => {
    try {
      await apiSend(`/api/warranty/${t.id}`, 'PUT', { ...t, status });
      onToast(`Cập nhật ${t.ticket_no} → ${status}`);
      loadAll();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const searchQcSku = async (val: string) => {
    setQcSkuQuery(val);
    if (val.trim().length < 2) { setQcSkuMatches([]); return; }
    try {
      const res = await apiGet(`/api/master/products?q=${encodeURIComponent(val.trim())}&include_stock_9005=1`);
      setQcSkuMatches(res.slice(0, 6));
    } catch { /* ignore */ }
  };

  const pickQcSku = (p: any) => {
    setNewQc(prev => ({
      ...prev,
      barcode: p.barcode,
      product_name: p.name_vn,
      supplier_name: p.supplier_name || prev.supplier_name,
      stock_qty: Number(p.stock_9005 || 0),
    }));
    setQcSkuQuery(p.name_vn);
    setQcSkuMatches([]);
  };

  const submitNewQc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiSend('/api/qc-returns', 'POST', newQc);
      onToast(`Đã ghi nhận lô hàng lỗi ${newQc.product_name} (Tỷ lệ lỗi: ${res.defect_rate}%)!`);
      setShowNewQc(false);
      setQcSkuQuery('');
      setNewQc({
        supplier_name: '', barcode: '', product_name: '', defect_category: WOOD_DEFECT_CATEGORIES[2],
        issue: '', defective_qty: 1, sold_qty: 0, stock_qty: 0, action: 'Back to factory', est_out: 'TBU', est_in: 'TBU',
      });
      loadAll();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const updateQcStatus = async (q: any, status: string) => {
    try {
      await apiSend(`/api/qc-returns/${q.id}`, 'PUT', { ...q, status });
      onToast(`Đã cập nhật QC ${q.product_name} → ${status}`);
      loadAll();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const generateQcSlip = async (q: any, slipType: 'XK' | 'NK') => {
    try {
      const res = await apiSend(`/api/qc-returns/${q.id}/generate-slip`, 'POST', { slip_type: slipType });
      onToast(`Đã tạo phiếu ${res.slip_no} (${slipType === 'XK' ? 'Trả xưởng NCC' : 'Nhận lại từ xưởng'}) & tự gắn vào lô QC!`);
      loadAll();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const printBm03 = async (item: any) => {
    try {
      const full = item.signature_data === undefined && item.id ? await apiGet(`/api/bm03/${item.id}`) : item;
      onPrint({ type: 'BM03', data: full });
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const printBm04 = async (item: any) => {
    try {
      const full = item.driver_signature_data === undefined && item.id ? await apiGet(`/api/bm04/${item.id}`) : item;
      onPrint({ type: 'BM04', data: full });
    } catch (e: any) {
      onToast(e.message, 'err');
    }
  };

  const submitSupportLog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiSend('/api/support-logs', 'POST', newLog);
      onToast('Đã ghi nhận giờ Support chéo phòng ban!');
      setNewLog({ ...newLog, notes: '' });
      loadAll();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const totalDefective = qcList.filter(x => x.status !== 'Closed').reduce((s, x) => s + (x.defective_qty || 0), 0);
  const totalSupportHours = logs.reduce((s, x) => s + Number(x.hours || 0), 0);

  // QC Factory Analytics by Supplier (TASK-12)
  const qcBySupplier = (() => {
    const m = new Map<string, { supplier: string; units: number; skus: number }>();
    for (const q of qcList) {
      const key = q.supplier_name || 'Khác';
      const cur = m.get(key) || { supplier: key, units: 0, skus: 0 };
      cur.units += Number(q.defective_qty || 0);
      cur.skus += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.units - a.units);
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#3B281A]">Hậu Mãi (BM-02 / 03 / 04), QC Xưởng Đồ Gỗ & Support</h1>
          <p className="text-xs text-[#6e5543]">Quy trình khép kín BEN-PRO-WarrantyReturn & SOP-BENOM-SCM-03: tra cứu bảo hành, thu hồi Cấp 3, claim 3PL 48h & theo dõi chất lượng xưởng NCC.</p>
        </div>
        <div className="flex flex-wrap bg-[#EFE7DC] p-1 rounded-lg self-start gap-0.5">
          {[
            ['warranty', `BM-02 (${tickets.length})`],
            ['bm03', `BM-03 (${bm03List.length})`],
            ['bm04', `BM-04 (${bm04List.length})`],
            ['qc', `QC Xưởng (${totalDefective} sp)`],
            ['support', `Support (${totalSupportHours}h)`],
          ].map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => setSubTab(id as SubTab)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${subTab === id ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: WARRANTY BM-02 */}
      {subTab === 'warranty' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-4 border border-[#E6DDD1] space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm text-[#3B281A] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#234E36]" /> Tra Cứu Bảo Hành Tức Thì (SĐT / Mã Hóa Đơn / Tên Khách)
              </div>
              {canCreateOrEditQc && (
                <button
                  onClick={() => setShowNewTicket(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#3B281A] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Tạo Ticket BM-02
                </button>
              )}
            </div>
            <form onSubmit={doLookup} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#6e5543] absolute left-3 top-2.5" />
                <input
                  value={lookupQ}
                  onChange={e => setLookupQ(e.target.value)}
                  placeholder="Nhập SĐT khách hàng (VD: 09...) hoặc mã hóa đơn POS..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#D6BCA5] text-xs"
                />
              </div>
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#224B85] text-white text-xs font-semibold cursor-pointer">Tra cứu</button>
            </form>

            {lookupRes.length > 0 && (
              <div className="divide-y divide-[#EFE7DC] border-t border-[#EFE7DC] pt-2 text-xs">
                {lookupRes.slice(0, 8).map((r, i) => (
                  <div key={i} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-[#3B281A]">{r.customer_name}</span> ({r.customer_phone}) — <strong>{r.product_name}</strong>
                      <div className="text-[11px] text-[#6e5543]">ĐH {r.invoice_no} • Ngày giao: {r.handover_date || '—'} • Chính sách: {r.warranty_policy}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.warranty_status === 'Còn bảo hành' ? 'bg-emerald-50 text-[#234E36]' : 'bg-red-50 text-[#9A2B26]'
                      }`}>
                        {r.warranty_status} {r.days_left > 0 ? `(còn ${r.days_left} ngày)` : ''}
                      </span>
                      {canCreateOrEditQc && (
                        <button
                          onClick={() => prefillTicketFromLookup(r)}
                          className="px-2.5 py-1 rounded bg-[#3B281A] text-white text-[11px] font-semibold cursor-pointer"
                        >
                          Mở Ticket
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ticket Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tickets.map(t => (
              <div key={t.id} className="bg-white rounded-xl p-4 border border-[#E6DDD1] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-[#3B281A] text-white text-[10px] font-bold">{t.ticket_no}</span>
                    <span className="px-2 py-0.5 rounded bg-[#F8F4EC] border border-[#D6BCA5] text-[10px] font-bold text-[#3B281A]">Cấp {t.service_level}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.is_in_warranty ? 'bg-emerald-50 text-[#234E36]' : 'bg-amber-50 text-amber-800'}`}>
                      {t.is_in_warranty ? 'Trong BH' : 'Ngoài BH'}
                    </span>
                  </div>
                  {canUpdateTicketOrLog ? (
                    <select
                      value={t.status}
                      onChange={e => updateTicketStatus(t, e.target.value)}
                      className="text-[11px] font-semibold px-2 py-1 rounded border border-[#D6BCA5] bg-white"
                    >
                      <option value="New">New</option>
                      <option value="Assessing">Đang chẩn đoán</option>
                      <option value="In Progress">Đang xử lý</option>
                      <option value="Resolved">Đã xong</option>
                      <option value="Closed">Đóng Ticket</option>
                    </select>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-[#F8F4EC] border border-[#D6BCA5] text-[10px] font-bold text-[#3B281A]">
                      {t.status}
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-[#3B281A]">{t.product_name}</div>
                <div className="text-xs text-[#6e5543]">{t.customer_name} • {t.customer_phone} • ĐH {t.invoice_no || '—'}</div>
                <div className="text-xs bg-[#FAF7F2] p-2.5 rounded-lg border border-[#EFE7DC]">{t.issue_desc}</div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6e5543] pt-1">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-[#9A2B26]" /> SLA xử lý (GMT+7): <strong>{t.sla_resolve_at || '—'}</strong></div>
                    {(t.responded_at || t.resolved_at) && (
                      <div className="text-[10px] text-[#234E36]">
                        {t.responded_at ? `Phản hồi: ${t.responded_at}` : ''}{t.responded_at && t.resolved_at ? ' • ' : ''}{t.resolved_at ? `Hoàn tất: ${t.resolved_at}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {t.bm03_no ? (
                      <button
                        onClick={() => {
                          const found = bm03List.find(x => x.doc_no === t.bm03_no);
                          if (found) setActiveBm03(found); else setSubTab('bm03');
                        }}
                        className="px-2 py-1 rounded bg-emerald-50 border border-[#234E36] text-[#234E36] text-[10px] font-bold cursor-pointer"
                      >
                        ✓ {t.bm03_no}
                      </button>
                    ) : canUpdateTicketOrLog ? (
                      <button
                        onClick={() => setActiveBm03({
                          ticket_id: t.id, ticket_no: t.ticket_no, invoice_no: t.invoice_no,
                          customer_name: t.customer_name, customer_phone: t.customer_phone,
                          barcode: t.barcode, product_name: t.product_name, damage_other: t.issue_desc,
                        })}
                        className="px-2 py-1 rounded bg-[#F8F4EC] border border-[#D6BCA5] text-[#3B281A] hover:bg-[#EFE7DC] text-[10px] font-semibold cursor-pointer"
                      >
                        + BM-03
                      </button>
                    ) : null}

                    {t.bm04_no ? (
                      <button
                        onClick={() => {
                          const found = bm04List.find(x => x.doc_no === t.bm04_no);
                          if (found) setActiveBm04(found); else setSubTab('bm04');
                        }}
                        className="px-2 py-1 rounded bg-red-50 border border-[#9A2B26] text-[#9A2B26] text-[10px] font-bold cursor-pointer"
                      >
                        ✓ {t.bm04_no}
                      </button>
                    ) : canUpdateTicketOrLog ? (
                      <button
                        onClick={() => setActiveBm04({
                          ticket_id: t.id, ticket_no: t.ticket_no, invoice_no: t.invoice_no,
                          barcode: t.barcode, product_name: t.product_name, issue_desc: t.issue_desc,
                        })}
                        className="px-2 py-1 rounded bg-red-50 border border-red-200 text-[#9A2B26] hover:bg-red-100 text-[10px] font-semibold cursor-pointer"
                      >
                        + BM-04
                      </button>
                    ) : null}

                    <button
                      onClick={() => onPrint({ type: 'WARRANTY', data: t })}
                      className="px-2 py-1 rounded border border-[#D6BCA5] text-[#3B281A] font-semibold hover:bg-[#F8F4EC] cursor-pointer flex items-center gap-1"
                    >
                      <Printer className="w-3 h-3" /> In BM-02
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: BM-03 KIỂM ĐỊNH & THU HỒI (TASK-11) */}
      {subTab === 'bm03' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-[#E6DDD1]">
            <div>
              <div className="font-bold text-sm text-[#3B281A] flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-[#3B281A]" /> Biên Bản Kiểm Định Kỹ Thuật & Thu Hồi Sản Phẩm (BM-03)
              </div>
              <div className="text-[11px] text-[#6e5543]">Áp dụng đổi mới 1-1 / thu hồi Cấp độ 3 về DC 9005 (Claim NCC hoặc gia công B-grade & Inventory Adjustment).</div>
            </div>
            {canUpdateTicketOrLog && (
              <button
                onClick={() => setActiveBm03({})}
                className="px-3.5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Lập BM-03 mới
              </button>
            )}
          </div>

          {bm03List.length === 0 ? (
            <div className="bg-white rounded-xl p-10 text-center text-xs text-[#6e5543] border border-[#E6DDD1]">
              Chưa có biên bản BM-03 nào. Bấm <strong>"Lập BM-03 mới"</strong> hoặc tạo trực tiếp từ thẻ Ticket BM-02.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bm03List.map(item => (
                <div key={item.id} className="bg-white rounded-xl p-4 border border-[#E6DDD1] flex flex-col justify-between gap-3">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-[#3B281A] text-white font-bold text-[10px]">{item.doc_no}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.status === 'Closed' ? 'bg-emerald-50 text-[#234E36]' : 'bg-amber-50 text-amber-800'}`}>{item.status}</span>
                    </div>
                    <div className="font-bold text-sm text-[#3B281A]">{item.product_name} (x{item.qty})</div>
                    <div className="text-[#6e5543]">{item.customer_name} • {item.doc_date} • {item.location}</div>
                    <div className="text-[11px]"><strong>Nguyên nhân:</strong> {item.root_cause}</div>
                    <div className="text-[11px] text-[#224B85]"><strong>Xử lý:</strong> {item.customer_resolution} • {item.warehouse_disposition}</div>
                    {item.inv_adj_code && <div className="text-[10px] font-mono text-[#234E36]">ERP Adj: {item.inv_adj_code}</div>}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-[#EFE7DC]">
                    <button onClick={() => setActiveBm03(item)} className="flex-1 py-1.5 rounded-lg bg-[#3B281A] text-white text-xs font-semibold cursor-pointer">
                      {canUpdateTicketOrLog ? 'Mở / Cập nhật' : 'Xem chi tiết'}
                    </button>
                    <button onClick={() => printBm03(item)} className="px-3 py-1.5 rounded-lg border border-[#D6BCA5] text-xs font-semibold cursor-pointer" title="In A4 PDF">
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BM-04 SỰ CỐ GIAO NHẬN & CLAIM 3PL (TASK-11) */}
      {subTab === 'bm04' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-[#E6DDD1]">
            <div>
              <div className="font-bold text-sm text-[#9A2B26] flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4" /> Biên Bản Sự Cố Giao Nhận & Claim Đền Bù 3PL (BM-04 • SLA 48h)
              </div>
              <div className="text-[11px] text-[#6e5543]">Ghi nhận hư hỏng vận chuyển, chụp ảnh AWB, lấy chữ ký tài xế tại hiện trường để claim Ahamove / Xanh SM / Sagawa / Nhất Tín.</div>
            </div>
            {canUpdateTicketOrLog && (
              <button
                onClick={() => setActiveBm04({})}
                className="px-3.5 py-2 rounded-lg bg-[#9A2B26] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Lập BM-04 Sự cố 3PL
              </button>
            )}
          </div>

          {bm04List.length === 0 ? (
            <div className="bg-white rounded-xl p-10 text-center text-xs text-[#6e5543] border border-[#E6DDD1]">
              Chưa có biên bản sự cố giao nhận BM-04 nào.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bm04List.map(item => (
                <div key={item.id} className="bg-white rounded-xl p-4 border border-[#E6DDD1] flex flex-col justify-between gap-3">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-[#9A2B26] text-white font-bold text-[10px]">{item.doc_no}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.claim_status === 'Compensated' ? 'bg-emerald-50 text-[#234E36]' : 'bg-red-50 text-[#9A2B26]'}`}>
                        {item.claim_status}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-[#3B281A]">{item.carrier} • ĐH {item.invoice_no || '—'}</div>
                    <div className="text-[#6e5543]">Tài xế: {item.driver_name || '—'} • Xe: {item.vehicle_plate || '—'}</div>
                    <div className="text-[11px] font-bold text-[#9A2B26]">Giá trị Claim: {fmtVnd(item.claim_amount)}</div>
                    <div className="text-[10px] text-[#6e5543] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#9A2B26]" /> Hạn đền bù 48h: <strong>{item.claim_deadline_at || '—'}</strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-[#EFE7DC]">
                    <button onClick={() => setActiveBm04(item)} className="flex-1 py-1.5 rounded-lg bg-[#9A2B26] text-white text-xs font-semibold cursor-pointer">
                      {canUpdateTicketOrLog ? 'Mở / Cập nhật Claim' : 'Xem chi tiết'}
                    </button>
                    <button onClick={() => printBm04(item)} className="px-3 py-1.5 rounded-lg border border-[#D6BCA5] text-xs font-semibold cursor-pointer" title="In A4 PDF">
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: QC XƯỞNG ĐỒ GỖ & NỘI THẤT (TASK-12) */}
      {subTab === 'qc' && (
        <div className="space-y-4">
          {/* Analytics Chart by Supplier */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl p-4 border border-[#E6DDD1]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-sm text-[#3B281A]">Phân Tích Số Lượng Hàng Lỗi Theo Xưởng NCC</h3>
                  <p className="text-[11px] text-[#6e5543]">Cơ sở họp chất lượng với xưởng sản xuất đồ gỗ/nội thất & cấn trừ công nợ.</p>
                </div>
                {canCreateOrEditQc && (
                  <button
                    onClick={() => setShowNewQc(true)}
                    className="px-3 py-1.5 rounded-lg bg-[#9A2B26] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ghi nhận hàng lỗi QC
                  </button>
                )}
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={qcBySupplier} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EFE7DC" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#6e5543' }} />
                    <YAxis dataKey="supplier" type="category" width={95} tick={{ fontSize: 11, fill: '#3B281A' }} />
                    <Tooltip formatter={(v: any) => [`${v} sản phẩm lỗi`, 'Tổng lỗi']} />
                    <Bar dataKey="units" fill="#9A2B26" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-[#E6DDD1] flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-sm text-[#3B281A] mb-2">Tổng Quan QC Trả Xưởng</h3>
                <div className="text-3xl font-bold text-[#9A2B26]">{totalDefective} <span className="text-sm font-normal text-[#6e5543]">sp đang mở</span></div>
                <div className="text-xs text-[#6e5543] mt-1">Tổng {qcList.length} lô QC từ {qcBySupplier.length} xưởng NCC</div>
              </div>
              <div className="text-[11px] text-[#6e5543] bg-[#FAF7F2] p-3 rounded-lg border border-[#EFE7DC] mt-3">
                Bấm <strong>+ XK trả xưởng</strong> hoặc <strong>+ NK xưởng trả</strong> ngay trên từng dòng để tự động tạo phiếu kho Toàn Nhất 9005 và gắn số chứng từ đối soát.
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
            <div className="p-4 bg-[#F8F4EC] border-b border-[#E6DDD1] flex items-center justify-between">
              <div className="font-bold text-sm text-[#3B281A] flex items-center gap-2">
                <Factory className="w-4 h-4 text-[#9A2B26]" /> Danh Sách Lô Hàng Lỗi Trả Xưởng NCC
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#FAF7F2] border-b border-[#E6DDD1] text-[#6e5543]">
                    <th className="py-2.5 px-3">NCC</th>
                    <th className="py-2.5 px-3">Sản phẩm & Nhóm lỗi gỗ/nội thất</th>
                    <th className="py-2.5 px-2 text-center">SL Lỗi</th>
                    <th className="py-2.5 px-2 text-center">Tỷ lệ</th>
                    <th className="py-2.5 px-3">Chứng từ Kho 9005</th>
                    <th className="py-2.5 px-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E9DF]">
                  {qcList.map(q => (
                    <tr key={q.id} className="hover:bg-[#FAF7F2]">
                      <td className="py-2.5 px-3 font-semibold text-[#3B281A] whitespace-nowrap">{q.supplier_name}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#3B281A]">{q.product_name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {q.defect_category && q.defect_category !== 'Khác' && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-semibold">
                              {q.defect_category}
                            </span>
                          )}
                          <span className="text-[11px] text-[#9A2B26]">{q.issue}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-[#9A2B26]">{q.defective_qty}</td>
                      <td className="py-2.5 px-2 text-center">{q.defect_rate ? `${q.defect_rate}%` : '—'}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap space-y-1">
                        <div className="flex items-center gap-1">
                          {q.ref_xk_no ? (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#224B85] font-mono text-[10px] font-bold">{q.ref_xk_no}</span>
                          ) : canCreateOrEditQc ? (
                            <button onClick={() => generateQcSlip(q, 'XK')} className="px-2 py-0.5 rounded bg-[#F8F4EC] border border-[#D6BCA5] text-[#3B281A] hover:bg-[#EFE7DC] text-[10px] font-semibold cursor-pointer">
                              <FileOutput className="w-3 h-3 inline mr-0.5" /> + XK trả xưởng
                            </button>
                          ) : null}
                          {q.ref_nk_no ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-[#234E36] font-mono text-[10px] font-bold">{q.ref_nk_no}</span>
                          ) : canCreateOrEditQc ? (
                            <button onClick={() => generateQcSlip(q, 'NK')} className="px-2 py-0.5 rounded bg-emerald-50 border border-[#234E36]/40 text-[#234E36] hover:bg-emerald-100 text-[10px] font-semibold cursor-pointer">
                              <PackagePlus className="w-3 h-3 inline mr-0.5" /> + NK nhận lại
                            </button>
                          ) : null}
                        </div>
                        <div className="text-[10px] text-[#6e5543]">Out: {q.est_out || 'TBU'} • In: {q.est_in || 'TBU'}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        {canCreateOrEditQc ? (
                          <select
                            value={q.status}
                            onChange={e => updateQcStatus(q, e.target.value)}
                            className="px-2 py-1 rounded border border-[#D6BCA5] bg-white text-[11px] font-semibold"
                          >
                            <option value="Open">Open (Chờ xuất trả)</option>
                            <option value="Sent to Factory">Đã xuất về xưởng</option>
                            <option value="Returned">Xưởng đã trả hàng</option>
                            <option value="Closed">Hoàn tất (Closed)</option>
                          </select>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-[#F8F4EC] border border-[#D6BCA5] text-[10px] font-bold text-[#3B281A]">
                            {q.status}
                          </span>
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

      {/* TAB 5: CROSS-DEPT SUPPORT LOG */}
      {subTab === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {canUpdateTicketOrLog && (
            <form onSubmit={submitSupportLog} className="bg-white rounded-xl p-5 border border-[#E6DDD1] space-y-3 text-xs h-fit">
              <div className="font-bold text-sm text-[#3B281A] flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-[#224B85]" /> Ghi Nhận Giờ Support Chéo
              </div>
              <p className="text-[11px] text-[#6e5543]">Dữ liệu minh bạch hóa khối lượng hỗ trợ QC Xưởng, Store 3001 & Pop-up 1001 cho báo cáo tuần với Sếp.</p>
              <div>
                <label className="font-semibold text-[#6e5543]">Ngày thực hiện</label>
                <input type="date" value={newLog.log_date} onChange={e => setNewLog({ ...newLog, log_date: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Nhân sự</label>
                <input value={newLog.staff_name} onChange={e => setNewLog({ ...newLog, staff_name: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Hạng mục hỗ trợ</label>
                <select value={newLog.category} onChange={e => setNewLog({ ...newLog, category: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                  <option value="QC Xưởng NCC">QC tại Xưởng NCC</option>
                  <option value="Hỗ trợ Store 3001">Hỗ trợ Store 3001 (Trưng bày/Lắp mẫu)</option>
                  <option value="Hỗ trợ Pop-up 1001">Hỗ trợ Pop-up 1001 (Aeon Bình Tân)</option>
                  <option value="Phối hợp Marketing/Sales">Phối hợp Marketing / Chụp ảnh</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-[#6e5543]">Số giờ</label>
                  <input type="number" step="0.5" min={0.5} value={newLog.hours} onChange={e => setNewLog({ ...newLog, hours: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Địa điểm</label>
                  <input value={newLog.location} onChange={e => setNewLog({ ...newLog, location: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Nội dung chi tiết</label>
                <textarea rows={2} value={newLog.notes} onChange={e => setNewLog({ ...newLog, notes: e.target.value })} placeholder="VD: QC lô giường Kito trước khi nhập kho 9005..." className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
              </div>
              <button type="submit" className="w-full py-2 rounded-lg bg-[#3B281A] text-white font-semibold hover:bg-[#563C28] cursor-pointer">
                Lưu nhật ký
              </button>
            </form>
          )}

          <div className={`${canUpdateTicketOrLog ? 'lg:col-span-2' : 'lg:col-span-3'} bg-white rounded-xl border border-[#E6DDD1] overflow-hidden`}>
            <div className="p-4 bg-[#F8F4EC] border-b border-[#E6DDD1] font-bold text-sm text-[#3B281A]">
              Lịch Sử Hỗ Trợ Chéo Phòng Ban (Tổng: {totalSupportHours} giờ)
            </div>
            <div className="divide-y divide-[#F0E9DF] text-xs">
              {logs.map(l => (
                <div key={l.id} className="p-3.5 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-[#224B85] font-bold text-[10px]">{l.category}</span>
                      <span className="font-semibold text-[#3B281A]">{l.staff_name}</span>
                      <span className="text-[#6e5543]">• {l.log_date}</span>
                    </div>
                    <div className="mt-1 text-[#3B281A]">{l.notes || l.location}</div>
                  </div>
                  <span className="shrink-0 px-2.5 py-1 rounded-lg bg-[#F8F4EC] border border-[#D6BCA5] font-bold text-[#3B281A]">
                    {l.hours}h
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* New Ticket Modal */}
      {showNewTicket && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-3">
          <form onSubmit={submitTicket} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-3.5 bg-[#3B281A] text-[#F8F4EC] flex items-center justify-between">
              <div className="font-bold">Tạo Phiếu Tiếp Nhận Bảo Hành (BM-02)</div>
              <button type="button" onClick={() => setShowNewTicket(false)} className="cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#6e5543]">Khách hàng *</label>
                  <input required value={newTicket.customer_name} onChange={e => setNewTicket({ ...newTicket, customer_name: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Số điện thoại *</label>
                  <input required value={newTicket.customer_phone} onChange={e => setNewTicket({ ...newTicket, customer_phone: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Mã hóa đơn</label>
                  <input value={newTicket.invoice_no} onChange={e => setNewTicket({ ...newTicket, invoice_no: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Mức độ xử lý (SLA)</label>
                  <select value={newTicket.service_level} onChange={e => setNewTicket({ ...newTicket, service_level: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white">
                    <option value="C1">Cấp 1 — Tại nhà (SLA 48h)</option>
                    <option value="C2">Cấp 2 — Thay linh kiện (SLA 48h)</option>
                    <option value="C3">Cấp 3 — Thu hồi về xưởng (SLA 7–10 ngày)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-[#6e5543]">Sản phẩm *</label>
                  <input required value={newTicket.product_name} onChange={e => setNewTicket({ ...newTicket, product_name: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-[#6e5543]">Mô tả sự cố *</label>
                  <textarea required rows={3} value={newTicket.issue_desc} onChange={e => setNewTicket({ ...newTicket, issue_desc: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <label className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" checked={newTicket.is_in_warranty} onChange={e => setNewTicket({ ...newTicket, is_in_warranty: e.target.checked })} />
                  <span>Còn trong thời hạn bảo hành (Miễn phí)</span>
                </label>
              </div>
            </div>
            <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewTicket(false)} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Hủy</button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold cursor-pointer">Tạo Ticket</button>
            </div>
          </form>
        </div>
      )}

      {/* New QC Factory Return Modal (TASK-12) */}
      {showNewQc && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-3 overflow-y-auto">
          <form onSubmit={submitNewQc} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-3.5 bg-[#9A2B26] text-white flex items-center justify-between">
              <div className="font-bold text-sm">Ghi Nhận Lô Hàng Lỗi QC Xưởng NCC</div>
              <button type="button" onClick={() => setShowNewQc(false)} className="cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="relative">
                <label className="font-semibold text-[#6e5543]">Tìm nhanh sản phẩm từ Master Data (tự điền NCC & tồn 9005)</label>
                <input
                  value={qcSkuQuery}
                  onChange={e => searchQcSku(e.target.value)}
                  placeholder="Gõ tên SP hoặc Barcode..."
                  className="w-full mt-1 px-3 py-2 border border-[#D6BCA5] rounded-lg"
                />
                {qcSkuMatches.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#3B281A] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {qcSkuMatches.map(p => (
                      <button type="button" key={p.barcode} onClick={() => pickQcSku(p)} className="w-full text-left px-3 py-2 hover:bg-[#F8F4EC] border-b border-[#F0E9DF] flex justify-between cursor-pointer">
                        <div>
                          <div className="font-semibold text-[#3B281A]">{p.name_vn}</div>
                          <div className="text-[10px] text-[#6e5543]">{p.barcode} • {p.supplier_name || '—'}</div>
                        </div>
                        <span className="text-[10px] font-bold text-[#234E36]">Tồn 9005: {p.stock_9005 || 0}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#6e5543]">Xưởng / NCC *</label>
                  <input required value={newQc.supplier_name} onChange={e => setNewQc({ ...newQc, supplier_name: e.target.value })} placeholder="VD: HIỂU ĐỨC, SAVIMEX..." className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Barcode</label>
                  <input value={newQc.barcode} onChange={e => setNewQc({ ...newQc, barcode: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg font-mono" />
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-[#6e5543]">Tên sản phẩm *</label>
                  <input required value={newQc.product_name} onChange={e => setNewQc({ ...newQc, product_name: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-[#6e5543]">Nhóm lỗi đặc thù đồ gỗ / nội thất</label>
                  <select value={newQc.defect_category} onChange={e => setNewQc({ ...newQc, defect_category: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg bg-white font-semibold">
                    {WOOD_DEFECT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-[#6e5543]">Mô tả lỗi chi tiết *</label>
                  <input required value={newQc.issue} onChange={e => setNewQc({ ...newQc, issue: e.target.value })} placeholder="VD: Trầy cạnh mặt bàn sơn PU, lệch lỗ bắt vít..." className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">SL Lỗi *</label>
                  <input type="number" min={1} required value={newQc.defective_qty} onChange={e => setNewQc({ ...newQc, defective_qty: Number(e.target.value) || 1 })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg font-bold text-[#9A2B26]" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">SL Tồn kho (tính % lỗi)</label>
                  <input type="number" min={0} value={newQc.stock_qty} onChange={e => setNewQc({ ...newQc, stock_qty: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Dự kiến xuất trả xưởng</label>
                  <input value={newQc.est_out} onChange={e => setNewQc({ ...newQc, est_out: e.target.value })} placeholder="dd/mm hoặc TBU" className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Dự kiến xưởng trả về</label>
                  <input value={newQc.est_in} onChange={e => setNewQc({ ...newQc, est_in: e.target.value })} placeholder="dd/mm hoặc TBU" className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewQc(false)} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Hủy</button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-[#9A2B26] text-white text-xs font-semibold cursor-pointer">Lưu lô QC</button>
            </div>
          </form>
        </div>
      )}

      {/* BM-03 & BM-04 Modals */}
      {activeBm03 && (
        <Bm03Modal
          initial={activeBm03}
          readOnly={!canUpdateTicketOrLog}
          onClose={() => setActiveBm03(null)}
          onSaved={() => { onToast('Đã lưu Biên bản kiểm định & thu hồi BM-03!'); loadAll(); }}
          onPrint={doc => onPrint({ type: 'BM03', data: doc })}
        />
      )}
      {activeBm04 && (
        <Bm04Modal
          initial={activeBm04}
          readOnly={!canUpdateTicketOrLog}
          onClose={() => setActiveBm04(null)}
          onSaved={() => { onToast('Đã lưu Biên bản sự cố giao nhận BM-04 (hạn Claim 48h)!'); loadAll(); }}
          onPrint={doc => onPrint({ type: 'BM04', data: doc })}
        />
      )}
    </div>
  );
}
