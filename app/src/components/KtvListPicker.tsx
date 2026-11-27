import React, { useState } from 'react';
import { Lock, UserPlus, Users, X } from 'lucide-react';
import { apiSend } from '../api';

export interface KtvEntry {
  code: string;
  name: string;
}

export interface StaffItem {
  emp_code: string;
  full_name: string;
  role?: string;
  department?: string;
}

interface Props {
  staff: StaffItem[];
  value: KtvEntry[];
  onChange: (next: KtvEntry[]) => void;
  onStaffAdded?: (newStaff: StaffItem) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export default function KtvListPicker({
  staff,
  value,
  onChange,
  onStaffAdded,
  label = 'Danh sách Kỹ thuật viên tham gia (ID — Họ tên)',
  hint = 'Chọn xong KTV 1 sẽ tự động mở dòng KTV 2, KTV 3, KTV 4... (hỗ trợ không giới hạn số lượng KTV).',
  disabled = false,
  disabledReason = 'Khách hàng tự lắp đặt — Không cần gán Kỹ thuật viên và không được chọn danh sách KTV tham gia.',
}: Props) {
  const [addingAtIndex, setAddingAtIndex] = useState<number | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  // Always show existing filled rows + 1 empty dropdown row below so selecting KTV N automatically opens KTV N+1
  const rows: (KtvEntry | null)[] = [...value, null];

  const handleSelect = (idx: number, selectedValue: string) => {
    if (selectedValue === '__ADD_NEW__') {
      setAddingAtIndex(idx);
      setNewCode('');
      setNewName('');
      return;
    }
    if (!selectedValue) {
      // Clear this slot
      const next = value.filter((_, i) => i !== idx);
      onChange(next);
      return;
    }
    const found = staff.find(s => `${s.emp_code}||${s.full_name}` === selectedValue);
    const entry: KtvEntry = found
      ? { code: found.emp_code, name: found.full_name }
      : (() => {
          const [code, name] = selectedValue.split('||');
          return { code: code || '', name: name || selectedValue };
        })();

    const next = [...value];
    if (idx < next.length) {
      next[idx] = entry;
    } else {
      next.push(entry);
    }
    onChange(next);
  };

  const removeRow = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const saveNewStaff = async () => {
    if (!newCode.trim() || !newName.trim()) {
      alert('Vui lòng nhập đầy đủ Mã NV (ID) và Họ tên KTV!');
      return;
    }
    setSavingNew(true);
    try {
      const res = await apiSend<{ ok: boolean; staff: StaffItem }>('/api/master/staff', 'POST', {
        emp_code: newCode.trim(),
        full_name: newName.trim(),
        role: 'KTV / Hỗ trợ lắp đặt',
        department: 'Operations',
      });
      if (res.staff && onStaffAdded) onStaffAdded(res.staff);
      const entry: KtvEntry = { code: newCode.trim(), name: newName.trim() };
      const next = [...value];
      if (addingAtIndex !== null && addingAtIndex < next.length) {
        next[addingAtIndex] = entry;
      } else {
        next.push(entry);
      }
      onChange(next);
      setAddingAtIndex(null);
      setNewCode('');
      setNewName('');
    } catch (e: any) {
      alert(e.message || 'Không thể lưu KTV mới');
    } finally {
      setSavingNew(false);
    }
  };

  // Match an existing entry to a staff option key (even if legacy entry only had name without code)
  const resolveOptionKey = (entry: KtvEntry | null) => {
    if (!entry) return '';
    const byCode = entry.code ? staff.find(s => s.emp_code === entry.code) : undefined;
    if (byCode) return `${byCode.emp_code}||${byCode.full_name}`;
    const byName = entry.name ? staff.find(s => s.full_name.toLowerCase() === entry.name.toLowerCase()) : undefined;
    if (byName) return `${byName.emp_code}||${byName.full_name}`;
    return `${entry.code}||${entry.name}`;
  };

  const selectedKeys = new Set(value.map(v => resolveOptionKey(v)));

  if (disabled) {
    return (
      <div className="space-y-1.5 bg-[#F8F4EC]/80 p-3.5 rounded-xl border border-dashed border-[#D6BCA5] select-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-[#6e5543] text-xs flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[#6e5543]" />
            <span>{label}</span>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EFE7DC] text-[#6e5543] text-[10px] font-bold">
            <Lock className="w-3 h-3" /> Không cần gán KTV
          </span>
        </div>
        <div className="text-xs text-[#6e5543] italic">{disabledReason}</div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6DDD1]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-[#3B281A] text-xs flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[#3B281A]" />
          <span>{label}</span>
          {value.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[#3B281A] text-[#F8F4EC] text-[10px] font-bold">
              {value.length} KTV
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((entry, idx) => {
          const currentKey = resolveOptionKey(entry);
          const isCustomNotInList =
            entry &&
            !staff.some(s => `${s.emp_code}||${s.full_name}` === currentKey);

          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`shrink-0 w-16 text-center py-1.5 rounded-lg text-[11px] font-bold ${
                  entry ? 'bg-[#3B281A] text-[#F8F4EC]' : 'bg-[#EFE7DC] text-[#6e5543] border border-dashed border-[#D6BCA5]'
                }`}>
                  KTV {String(idx + 1).padStart(2, '0')}
                </span>

                <select
                  value={currentKey}
                  onChange={e => handleSelect(idx, e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[#D6BCA5] bg-white text-xs sm:text-sm text-[#2A1E15] font-medium"
                >
                  <option value="">
                    {idx === 0 ? '— Chọn ID & Tên KTV 01 —' : `+ Chọn thêm KTV ${String(idx + 1).padStart(2, '0')} (nếu cần hỗ trợ thêm)...`}
                  </option>
                  {isCustomNotInList && entry && (
                    <option value={currentKey}>
                      {entry.code ? `[${entry.code}] ${entry.name}` : `${entry.name} (chưa có ID)`}
                    </option>
                  )}
                  {staff.map(s => {
                    const optKey = `${s.emp_code}||${s.full_name}`;
                    const alreadyPickedElsewhere = selectedKeys.has(optKey) && optKey !== currentKey;
                    return (
                      <option key={s.emp_code} value={optKey} disabled={alreadyPickedElsewhere}>
                        [{s.emp_code}] {s.full_name}{s.department ? ` — ${s.department}` : ''}{alreadyPickedElsewhere ? ' (đã chọn)' : ''}
                      </option>
                    );
                  })}
                  <option value="__ADD_NEW__">＋ Thêm nhân sự / KTV mới (nhập ID & Tên)...</option>
                </select>

                {entry && (
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    title="Bỏ KTV này"
                    className="p-2 rounded-lg text-[#9A2B26] hover:bg-red-50 cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Inline Add New Staff Form */}
              {addingAtIndex === idx && (
                <div className="ml-0 sm:ml-[72px] p-3 rounded-lg bg-white border border-[#3B281A] space-y-2 text-xs">
                  <div className="font-bold text-[#3B281A] flex items-center gap-1">
                    <UserPlus className="w-3.5 h-3.5 text-[#234E36]" /> Thêm nhanh nhân sự mới vào danh mục KTV
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      value={newCode}
                      onChange={e => setNewCode(e.target.value)}
                      placeholder="Mã NV / ID (VD: 260205)"
                      className="px-2.5 py-1.5 rounded-lg border border-[#D6BCA5] font-mono"
                    />
                    <input
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Họ tên đầy đủ (VD: Nguyễn Hữu Hoàng Nam)"
                      className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-[#D6BCA5]"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setAddingAtIndex(null)} className="px-2.5 py-1 rounded border border-[#D6BCA5] cursor-pointer">
                      Hủy
                    </button>
                    <button
                      type="button"
                      disabled={savingNew}
                      onClick={saveNewStaff}
                      className="px-3 py-1 rounded bg-[#234E36] text-white font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {savingNew ? 'Đang lưu...' : 'Lưu & Chọn ngay'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-[11px] text-[#6e5543]">{hint}</div>
    </div>
  );
}
