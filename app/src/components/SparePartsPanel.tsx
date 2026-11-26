import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Plus, Wrench, X } from 'lucide-react';
import { apiGet, apiSend, AuthUser } from '../api';

interface Props {
  user: AuthUser;
  onToast: (msg: string, tone?: 'ok' | 'err') => void;
}

export default function SparePartsPanel({ user, onToast }: Props) {
  const canAddPart = user.role === 'ADMIN' || user.role === 'EDITOR';
  const canTx = user.role === 'ADMIN' || user.role === 'EDITOR' || user.role === 'KTV';

  const [parts, setParts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [txTarget, setTxTarget] = useState<{ part: any; tx_type: 'IN' | 'OUT' } | null>(null);
  const [txForm, setTxForm] = useState({ qty: 5, ref_doc: '', notes: '' });

  const [newPart, setNewPart] = useState({
    code: '',
    name: '',
    category: 'Ốc vít & Liên kết',
    unit: 'Cái',
    stock_qty: 20,
    min_stock: 10,
    location: 'Store 3001 / Túi đồ KTV',
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGet('/api/spare-parts');
      setParts(res.parts || []);
      setLogs(res.logs || []);
    } catch (e: any) {
      onToast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submitNewPart = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiSend('/api/spare-parts', 'POST', newPart);
      onToast(`Đã thêm vật tư ngũ kim ${newPart.code}!`);
      setShowNew(false);
      setNewPart({ code: '', name: '', category: 'Ốc vít & Liên kết', unit: 'Cái', stock_qty: 20, min_stock: 10, location: 'Store 3001 / Túi đồ KTV', notes: '' });
      load();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const submitTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txTarget) return;
    try {
      await apiSend(`/api/spare-parts/${txTarget.part.id}/tx`, 'POST', {
        tx_type: txTarget.tx_type,
        qty: Number(txForm.qty),
        staff_name: user.full_name,
        ref_doc: txForm.ref_doc,
        notes: txForm.notes,
      });
      onToast(`Đã ${txTarget.tx_type === 'IN' ? 'nhập thêm' : 'xuất cho KTV'} ${txForm.qty} ${txTarget.part.unit} ${txTarget.part.name}!`);
      setTxTarget(null);
      setTxForm({ qty: 5, ref_doc: '', notes: '' });
      load();
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  const lowParts = parts.filter(p => p.is_low_stock);

  if (loading) return <div className="p-8 text-center text-xs text-[#6e5543]">Đang tải kho ngũ kim KTV...</div>;

  return (
    <div className="space-y-4">
      {lowParts.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-400 text-amber-950 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Cảnh báo sắp hết vật tư ngũ kim ({lowParts.length} mã):</strong>{' '}
            {lowParts.map(p => `${p.name} (còn ${p.stock_qty} ${p.unit})`).join(', ')} — cần mua bổ sung để KTV đi bảo hành Cấp 1–2!
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Hardware Inventory Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E6DDD1] overflow-hidden">
          <div className="p-4 bg-[#F8F4EC] border-b border-[#E6DDD1] flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-bold text-sm text-[#3B281A] flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-[#3B281A]" /> Kho Mini Ngũ Kim & Phụ Kiện Lắp Ráp / Bảo Hành Cấp 1–2
              </div>
              <div className="text-[11px] text-[#6e5543]">Ốc liên kết, bản lề, bas treo gương, nút chân ghế, dầu dưỡng gỗ, bút dặm sơn PU.</div>
            </div>
            {canAddPart && (
              <button
                onClick={() => setShowNew(true)}
                className="px-3 py-1.5 rounded-lg bg-[#3B281A] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm mã ngũ kim
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#E6DDD1] text-[#6e5543]">
                  <th className="py-2.5 px-3">Mã / Tên vật tư</th>
                  <th className="py-2.5 px-2">Vị trí</th>
                  <th className="py-2.5 px-2 text-center">Tồn / Min</th>
                  {canTx && <th className="py-2.5 px-3 text-right">Xuất / Nhập</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E9DF]">
                {parts.map(p => (
                  <tr key={p.id} className={`hover:bg-[#FAF7F2] ${p.is_low_stock ? 'bg-amber-50/40' : ''}`}>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-[#3B281A]">{p.name}</div>
                      <div className="text-[10px] text-[#6e5543]">
                        <span className="font-mono font-bold">{p.code}</span> • {p.category} {p.notes ? `• ${p.notes}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-[11px] text-[#6e5543]">{p.location}</td>
                    <td className="py-2.5 px-2 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${p.is_low_stock ? 'bg-red-100 text-[#9A2B26]' : 'bg-emerald-50 text-[#234E36]'}`}>
                        {p.stock_qty} {p.unit}
                      </span>
                      <div className="text-[10px] text-[#6e5543]">Min: {p.min_stock}</div>
                    </td>
                    {canTx && (
                      <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                        <button
                          onClick={() => { setTxTarget({ part: p, tx_type: 'OUT' }); setTxForm({ qty: 2, ref_doc: '', notes: '' }); }}
                          className="px-2 py-1 rounded bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 text-[10px] font-bold cursor-pointer"
                          title="KTV lấy phụ kiện đi lắp/bảo hành"
                        >
                          <ArrowUpCircle className="w-3 h-3 inline mr-0.5" /> Xuất KTV
                        </button>
                        {canAddPart && (
                          <button
                            onClick={() => { setTxTarget({ part: p, tx_type: 'IN' }); setTxForm({ qty: 20, ref_doc: '', notes: 'Nhập bổ sung' }); }}
                            className="px-2 py-1 rounded bg-emerald-50 border border-[#234E36]/40 text-[#234E36] hover:bg-emerald-100 text-[10px] font-bold cursor-pointer"
                            title="Nhập thêm vật tư vào kho"
                          >
                            <ArrowDownCircle className="w-3 h-3 inline mr-0.5" /> Nhập
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Transaction Logs */}
        <div className="bg-white rounded-xl border border-[#E6DDD1] overflow-hidden h-fit">
          <div className="p-4 bg-[#F8F4EC] border-b border-[#E6DDD1] font-bold text-sm text-[#3B281A]">
            Lịch Sử Xuất / Nhập Ngũ Kim ({logs.length})
          </div>
          {logs.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#6e5543]">Chưa có giao dịch xuất/nhập nào.</div>
          ) : (
            <div className="divide-y divide-[#F0E9DF] text-xs max-h-[480px] overflow-y-auto">
              {logs.map(l => (
                <div key={l.id} className="p-3 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${l.tx_type === 'IN' ? 'bg-emerald-50 text-[#234E36]' : 'bg-amber-50 text-amber-900'}`}>
                      {l.tx_type === 'IN' ? `+ Nhập ${l.qty}` : `- Xuất ${l.qty}`}
                    </span>
                    <span className="font-mono text-[10px] text-[#6e5543]">{l.created_at}</span>
                  </div>
                  <div className="font-semibold text-[#3B281A]">{l.part_name}</div>
                  <div className="text-[11px] text-[#6e5543]">
                    {l.staff_name} {l.ref_doc ? `• ${l.ref_doc}` : ''} {l.notes ? `— ${l.notes}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tx Modal */}
      {txTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <form onSubmit={submitTx} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className={`px-5 py-3.5 text-white flex items-center justify-between ${txTarget.tx_type === 'IN' ? 'bg-[#234E36]' : 'bg-[#3B281A]'}`}>
              <div className="font-bold text-sm">
                {txTarget.tx_type === 'IN' ? 'Nhập Bổ Sung Ngũ Kim' : 'Xuất Ngũ Kim Cho KTV Đi Lắp / BH'}
              </div>
              <button type="button" onClick={() => setTxTarget(null)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="bg-[#FAF7F2] p-3 rounded-lg border border-[#E6DDD1]">
                <div className="font-bold text-[#3B281A]">{txTarget.part.name}</div>
                <div className="text-[11px] text-[#6e5543]">Tồn hiện tại: <strong>{txTarget.part.stock_qty} {txTarget.part.unit}</strong></div>
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Số lượng ({txTarget.part.unit}) *</label>
                <input type="number" min={1} required value={txForm.qty} onChange={e => setTxForm({ ...txForm, qty: Number(e.target.value) || 1 })} className="w-full mt-1 px-3 py-2 border border-[#D6BCA5] rounded-lg font-bold" />
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Mã ĐH / Ticket BM-02 liên quan (nếu có)</label>
                <input value={txForm.ref_doc} onChange={e => setTxForm({ ...txForm, ref_doc: e.target.value })} placeholder="VD: TK-1126-001 hoặc 3001..." className="w-full mt-1 px-3 py-2 border border-[#D6BCA5] rounded-lg font-mono" />
              </div>
              <div>
                <label className="font-semibold text-[#6e5543]">Ghi chú</label>
                <input value={txForm.notes} onChange={e => setTxForm({ ...txForm, notes: e.target.value })} placeholder="VD: Mang đi lắp bàn ăn Noma Q.7..." className="w-full mt-1 px-3 py-2 border border-[#D6BCA5] rounded-lg" />
              </div>
            </div>
            <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
              <button type="button" onClick={() => setTxTarget(null)} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Hủy</button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-[#3B281A] text-white text-xs font-semibold cursor-pointer">Xác nhận</button>
            </div>
          </form>
        </div>
      )}

      {/* New Spare Part Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <form onSubmit={submitNewPart} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 bg-[#3B281A] text-white flex items-center justify-between">
              <div className="font-bold text-sm">Thêm Vật Tư Ngũ Kim / Phụ Kiện Mới</div>
              <button type="button" onClick={() => setShowNew(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#6e5543]">Mã vật tư *</label>
                  <input required value={newPart.code} onChange={e => setNewPart({ ...newPart, code: e.target.value })} placeholder="VD: NK-RAY-40" className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg font-mono" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Đơn vị tính</label>
                  <input value={newPart.unit} onChange={e => setNewPart({ ...newPart, unit: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-[#6e5543]">Tên phụ kiện / ngũ kim *</label>
                  <input required value={newPart.name} onChange={e => setNewPart({ ...newPart, name: e.target.value })} placeholder="VD: Ray bi 3 tầng 40cm ngăn kéo" className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Tồn đầu</label>
                  <input type="number" min={0} value={newPart.stock_qty} onChange={e => setNewPart({ ...newPart, stock_qty: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div>
                  <label className="font-semibold text-[#6e5543]">Mức Min cảnh báo</label>
                  <input type="number" min={0} value={newPart.min_stock} onChange={e => setNewPart({ ...newPart, min_stock: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-[#6e5543]">Vị trí lưu trữ</label>
                  <input value={newPart.location} onChange={e => setNewPart({ ...newPart, location: e.target.value })} className="w-full mt-1 px-2.5 py-2 border border-[#D6BCA5] rounded-lg" />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 bg-[#F8F4EC] border-t border-[#E6DDD1] flex justify-end gap-2">
              <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 rounded-lg border border-[#D6BCA5] text-xs cursor-pointer">Hủy</button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-[#234E36] text-white text-xs font-semibold cursor-pointer">Lưu vật tư</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
