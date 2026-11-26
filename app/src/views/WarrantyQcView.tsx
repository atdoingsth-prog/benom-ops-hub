import React, { useEffect, useState } from 'react';
import {
  Clock, Factory, Plus, Printer, Search, ShieldCheck, Wrench, X
} from 'lucide-react';
import { apiGet, apiSend, AuthUser, PrintDoc } from '../api';

interface Props {
  user: AuthUser;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
  onPrint: (doc: PrintDoc) => void;
}

export default function WarrantyQcView({ user, onToast, onPrint }: Props) {
  const canCreateOrEditQc = user.role === 'ADMIN' || user.role === 'EDITOR';
  const canUpdateTicketOrLog = user.role === 'ADMIN' || user.role === 'EDITOR' || user.role === 'KTV';
  const [subTab, setSubTabState] = useState<'warranty' | 'qc' | 'support'>(() => {
    const s = localStorage.getItem('benom_war_subtab');
    return s === 'qc' || s === 'support' ? s : 'warranty';
  });
  const setSubTab = (v: 'warranty' | 'qc' | 'support') => {
    setSubTabState(v);
    localStorage.setItem('benom_war_subtab', v);
  };
  const [tickets, setTickets] = useState<any[]>([]);
  const [qcList, setQcList] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

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
    staff_name: 'Trần Anh Tuyến',
    category: 'QC Xưởng NCC',
    location: 'Xưởng Bình Dương / Store 3001',
    hours: 4,
    notes: '',
  });

  const loadAll = async () => {
    try {
      const [t, q, s] = await Promise.all([
        apiGet('/api/warranty'),
        apiGet('/api/qc-returns'),
        apiGet('/api/support-logs'),
      ]);
      setTickets(t);
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
      onToast(`Đã tạo Ticket bảo hành ${res.ticket_no} (tự động tính mốc SLA 2h/24h/48h)!`);
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

  const updateQcStatus = async (q: any, status: string) => {
    try {
      await apiSend(`/api/qc-returns/${q.id}`, 'PUT', { ...q, status });
      onToast(`Đã cập nhật QC ${q.product_name} → ${status}`);
      loadAll();
    } catch (err: any) {
      onToast(err.message, 'err');
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#3B281A]">Bảo Hành (BM-02), QC Trả Xưởng & Support Chéo</h1>
          <p className="text-xs text-[#6e5543]">Tra cứu hạn bảo hành theo SĐT/Hóa đơn, đếm ngược SLA (2h/24h/48h/10d), theo dõi 29 sp trả xưởng & ghi nhận giờ hỗ trợ chéo.</p>
        </div>
        <div className="flex bg-[#EFE7DC] p-1 rounded-lg self-start">
          {[
            ['warranty', `Bảo hành (${tickets.length})`],
            ['qc', `QC Trả xưởng (${totalDefective} sp)`],
            ['support', `Support chéo (${totalSupportHours}h)`],
          ].map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => setSubTab(id as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${subTab === id ? 'bg-[#3B281A] text-white' : 'text-[#3B281A]'}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: WARRANTY */}
      {subTab === 'warranty' && (
        <div className="space-y-4">
          {/* Instant Lookup */}
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
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
                  <button
                    onClick={() => onPrint({ type: 'WARRANTY', data: t })}
                    className="px-2.5 py-1 rounded border border-[#D6BCA5] text-[#3B281A] font-semibold hover:bg-[#F8F4EC] cursor-pointer flex items-center gap-1"
                  >
                    <Printer className="w-3 h-3" /> In BM-02
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: QC BACK TO FACTORY */}
      {subTab === 'qc' && (
        <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
          <div className="p-4 bg-[#F8F4EC] border-b border-[#E6DDD1] flex items-center justify-between">
            <div className="font-bold text-sm text-[#3B281A] flex items-center gap-2">
              <Factory className="w-4 h-4 text-[#9A2B26]" /> Theo Dõi Hàng Lỗi Trả Xưởng NCC ({totalDefective} sản phẩm đang mở)
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#E6DDD1] text-[#6e5543]">
                  <th className="py-2.5 px-3">NCC</th>
                  <th className="py-2.5 px-3">Sản phẩm & Lỗi QC</th>
                  <th className="py-2.5 px-2 text-center">SL Lỗi</th>
                  <th className="py-2.5 px-2 text-center">Tỷ lệ lỗi</th>
                  <th className="py-2.5 px-3">Est Out / In</th>
                  <th className="py-2.5 px-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E9DF]">
                {qcList.map(q => (
                  <tr key={q.id} className="hover:bg-[#FAF7F2]">
                    <td className="py-2.5 px-3 font-semibold text-[#3B281A]">{q.supplier_name}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-[#3B281A]">{q.product_name}</div>
                      <div className="text-[11px] text-[#9A2B26]">{q.issue}</div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-[#9A2B26]">{q.defective_qty}</td>
                    <td className="py-2.5 px-2 text-center">{q.defect_rate ? `${q.defect_rate}%` : '—'}</td>
                    <td className="py-2.5 px-3 text-[11px] text-[#6e5543]">Out: {q.est_out || 'TBU'}<br />In: {q.est_in || 'TBU'}</td>
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
      )}

      {/* TAB 3: CROSS-DEPT SUPPORT LOG */}
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
    </div>
  );
}
