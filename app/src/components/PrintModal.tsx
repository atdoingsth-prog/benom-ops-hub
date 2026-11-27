import React from 'react';
import { Printer, X } from 'lucide-react';
import { PrintDoc, fmtVnd } from '../api';

interface Props {
  doc: PrintDoc | null;
  onClose: () => void;
}

const BENOM_FOOTER = 'CÔNG TY TNHH KOHNAN VIỆT NAM — Thương hiệu benom | Tầng 3, 35–45 Lê Thánh Tôn, P. Sài Gòn, TP.HCM | Hotline/Zalo: (+84) 964 052 051 | Email: service.benom@kohnanvn.com';

export default function PrintModal({ doc, onClose }: Props) {
  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4 print:p-0 print:bg-white print:static">
      <div className="w-full max-w-[210mm] bg-white rounded-xl shadow-2xl overflow-hidden print:shadow-none print:rounded-none">
        {/* Toolbar (hidden on print) */}
        <div className="no-print flex items-center justify-between px-5 py-3 bg-[#3B281A] text-[#F8F4EC]">
          <div className="font-semibold text-sm">
            Xem trước bản in A4 — {doc.type === 'HANDOVER' || doc.type === 'BM03' || doc.type === 'BM04' ? doc.data.doc_no : doc.type === 'SLIP' ? doc.data.slip_no : doc.data.ticket_no}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#D6BCA5] text-[#3B281A] font-semibold text-xs hover:bg-[#e4d0bc] cursor-pointer"
            >
              <Printer className="w-4 h-4" /> In / Xuất PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable A4 Body */}
        <div id="print-root" className="p-8 text-[13px] text-[#1f1610] leading-relaxed">
          {/* Brand Header */}
          <div className="flex items-start justify-between border-b-2 border-[#3B281A] pb-4 mb-5">
            <div>
              <div className="text-3xl font-bold tracking-tight text-[#3B281A]">benom</div>
              <div className="text-[11px] tracking-wider text-[#6e5543] mt-0.5">
                beautifully normal • <span className="uppercase">Công ty TNHH Kohnan Việt Nam</span>
              </div>
            </div>
            <div className="text-right text-xs">
              {doc.type === 'HANDOVER' && (
                <>
                  <div className="font-bold text-[#3B281A] text-sm">
                    {doc.data.doc_type === 'BM-05' ? 'PHIẾU GIAO HÀNG (BM-05)' : 'BIÊN BẢN GIAO NHẬN & LẮP ĐẶT (BM-01)'}
                  </div>
                  <div>Số phiếu: <strong>{doc.data.doc_no}</strong></div>
                  <div>Ngày: <strong>{doc.data.handover_date || '____/____/2026'}</strong></div>
                </>
              )}
              {doc.type === 'SLIP' && (
                <>
                  <div className="font-bold text-[#3B281A] text-sm">
                    {doc.data.slip_type === 'NK' ? 'PHIẾU YÊU CẦU NHẬP KHO (NK)' : 'PHIẾU YÊU CẦU XUẤT KHO (XK)'}
                  </div>
                  <div>Số phiếu: <strong>{doc.data.slip_no}</strong></div>
                  <div>Kho: <strong>{doc.data.warehouse_code} (Toàn Nhất BD02)</strong></div>
                </>
              )}
              {doc.type === 'WARRANTY' && (
                <>
                  <div className="font-bold text-[#3B281A] text-sm">PHIẾU TIẾP NHẬN BẢO HÀNH (BM-02)</div>
                  <div>Mã Ticket: <strong>{doc.data.ticket_no}</strong></div>
                  <div>Mức độ: <strong>{doc.data.service_level}</strong></div>
                </>
              )}
              {doc.type === 'BM03' && (
                <>
                  <div className="font-bold text-[#3B281A] text-sm">BIÊN BẢN KIỂM ĐỊNH & THU HỒI (BM-03)</div>
                  <div>Số biên bản: <strong>{doc.data.doc_no}</strong></div>
                  <div>Ngày lập: <strong>{doc.data.doc_date || '—'}</strong></div>
                </>
              )}
              {doc.type === 'BM04' && (
                <>
                  <div className="font-bold text-[#9A2B26] text-sm">BIÊN BẢN SỰ CỐ GIAO NHẬN (BM-04)</div>
                  <div>Số biên bản: <strong>{doc.data.doc_no}</strong></div>
                  <div>Ngày lập: <strong>{doc.data.doc_date || '—'}</strong></div>
                </>
              )}
            </div>
          </div>

          {/* HANDOVER (BM-01 / BM-05) */}
          {doc.type === 'HANDOVER' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-[#F8F4EC] p-3.5 rounded-lg border border-[#E6DDD1]">
                <div><strong>Khách hàng:</strong> {doc.data.customer_name}</div>
                <div><strong>Số điện thoại:</strong> {doc.data.customer_phone}</div>
                <div className="col-span-2"><strong>Địa chỉ giao hàng:</strong> {doc.data.address}</div>
                <div>
                  <strong>Mã hóa đơn (POS):</strong> {doc.data.invoice_no}
                  {doc.data.merged_invoices ? <span className="text-[11px] text-[#6e5543]"> (+ {doc.data.merged_invoices})</span> : null}
                </div>
                <div><strong>Hình thức:</strong> {doc.data.install_mode}</div>
                <div>
                  <strong>KTV / Tài xế:</strong>{' '}
                  {doc.data.install_mode === 'Khách hàng tự lắp đặt' || doc.data.install_mode === 'Sản phẩm không cần lắp đặt'
                    ? (doc.data.driver_name || 'Không yêu cầu KTV')
                    : Array.isArray(doc.data.ktvs) && doc.data.ktvs.length > 0
                      ? doc.data.ktvs.map((k: any) => (k.code ? `[${k.code}] ${k.name}` : k.name)).join(', ')
                      : ([doc.data.ktv1_name, doc.data.ktv2_name, doc.data.driver_name].filter(Boolean).join(', ') || '—')}
                </div>
                <div><strong>Đơn vị vận chuyển:</strong> {doc.data.carrier || 'benom'}</div>
              </div>

              <table className="w-full border-collapse border border-[#cbb7a2] text-xs">
                <thead>
                  <tr className="bg-[#3B281A] text-[#F8F4EC]">
                    <th className="border border-[#cbb7a2] p-2 text-center w-10">STT</th>
                    <th className="border border-[#cbb7a2] p-2 text-left w-32">Barcode</th>
                    <th className="border border-[#cbb7a2] p-2 text-left">Tên sản phẩm</th>
                    <th className="border border-[#cbb7a2] p-2 text-center w-16">Điểm lấy</th>
                    <th className="border border-[#cbb7a2] p-2 text-center w-14">ĐVT</th>
                    <th className="border border-[#cbb7a2] p-2 text-center w-14">SL</th>
                    <th className="border border-[#cbb7a2] p-2 text-left w-28">Bảo hành</th>
                  </tr>
                </thead>
                <tbody>
                  {(doc.data.items || []).map((it: any, i: number) => (
                    <tr key={i}>
                      <td className="border border-[#cbb7a2] p-2 text-center">{i + 1}</td>
                      <td className="border border-[#cbb7a2] p-2 font-mono">{it.barcode}</td>
                      <td className="border border-[#cbb7a2] p-2">
                        {it.product_name}
                        {it.orig_invoice && it.orig_invoice !== doc.data.invoice_no ? (
                          <span className="text-[10px] text-gray-500 ml-1">[Bill {it.orig_invoice}]</span>
                        ) : null}
                        {it.moving_no ? <span className="text-[10px] text-gray-500 ml-1">(Moving: {it.moving_no})</span> : null}
                      </td>
                      <td className="border border-[#cbb7a2] p-2 text-center font-mono font-semibold">{it.source_warehouse || doc.data.warehouse_code || '9005'}</td>
                      <td className="border border-[#cbb7a2] p-2 text-center">{it.unit || 'Cái'}</td>
                      <td className="border border-[#cbb7a2] p-2 text-center font-semibold">{it.qty}</td>
                      <td className="border border-[#cbb7a2] p-2">{it.warranty_policy || 'Theo quy định'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border border-[#E6DDD1] rounded-lg p-3.5 space-y-1.5">
                <div className="font-bold text-[#3B281A] mb-1">Kiểm tra nghiệm thu 4 điểm:</div>
                <div>[{doc.data.check_1 ? '✓' : ' '}] 1. Đúng mẫu mã, kích thước, màu sắc và đủ số lượng theo đơn hàng.</div>
                <div>[{doc.data.check_2 ? '✓' : ' '}] 2. Ngoại quan nguyên vẹn, không trầy xước, móp méo hay nứt vỡ.</div>
                <div>[{doc.data.check_3 ? '✓' : ' '}] 3. Lắp đặt chắc chắn, cân bằng, vận hành trơn tru (cửa/ngăn kéo/khớp nối).</div>
                <div>[{doc.data.check_4 ? '✓' : ' '}] 4. Đã vệ sinh khu vực lắp đặt và hướng dẫn sử dụng / bảo quản (HDBQ).</div>
                {doc.data.issue_note && (
                  <div className="mt-2 text-[#9A2B26]"><strong>Ghi chú tồn đọng:</strong> {doc.data.issue_note}</div>
                )}
              </div>

              {doc.data.csat_rating > 0 && (
                <div className="bg-[#F8F4EC] border border-[#D6BCA5] rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <strong>Đánh giá hài lòng khách hàng (CSAT):</strong> {'★'.repeat(doc.data.csat_rating)}{'☆'.repeat(5 - doc.data.csat_rating)} ({doc.data.csat_rating}/5)
                  </div>
                  {doc.data.csat_comment && <div className="italic text-xs">"{doc.data.csat_comment}"</div>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-8 pt-4 text-center">
                <div>
                  <div className="font-bold text-[#3B281A]">ĐẠI DIỆN BENOM (GIAO / LẮP)</div>
                  <div className="text-[11px] text-gray-500 mb-14">(Ký và ghi rõ họ tên)</div>
                  <div className="font-semibold">
                    {Array.isArray(doc.data.ktvs) && doc.data.ktvs.length > 0
                      ? doc.data.ktvs.map((k: any) => (k.code ? `${k.name} (${k.code})` : k.name)).join(' & ')
                      : ([doc.data.ktv1_name, doc.data.ktv2_name].filter(Boolean).join(' & ') || doc.data.driver_name || '___________________')}
                  </div>
                </div>
                <div>
                  <div className="font-bold text-[#3B281A]">KHÁCH HÀNG XÁC NHẬN NGHIỆM THU</div>
                  <div className="text-[11px] text-gray-500 mb-2">(Ký và ghi rõ họ tên)</div>
                  {doc.data.signature_data ? (
                    <img src={doc.data.signature_data} alt="Chữ ký khách hàng" className="h-20 mx-auto object-contain mb-1" />
                  ) : (
                    <div className="h-14" />
                  )}
                  <div className="font-semibold">{doc.data.customer_name}</div>
                </div>
              </div>
            </div>
          )}

          {/* WAREHOUSE SLIP (NK / XK) */}
          {doc.type === 'SLIP' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-[#F8F4EC] p-3.5 rounded-lg border border-[#E6DDD1]">
                <div><strong>Ngày lập phiếu:</strong> {doc.data.slip_date}</div>
                <div><strong>Ngày/Giờ hẹn kho:</strong> {doc.data.expected_date || '—'} {doc.data.expected_time || ''}</div>
                <div><strong>Đối tác / Kho:</strong> {doc.data.partner_name}</div>
                <div><strong>Đơn vị vận chuyển:</strong> {doc.data.carrier || '—'}</div>
                <div><strong>Mục đích:</strong> {doc.data.purpose}</div>
                <div><strong>Chứng từ tham chiếu:</strong> {doc.data.ref_invoice || doc.data.ref_po || '—'}</div>
                <div className="col-span-2"><strong>Ghi chú:</strong> {doc.data.notes || '—'}</div>
              </div>

              {doc.data.cutoff_warning && (
                <div className="p-3 rounded-lg border border-[#9A2B26] bg-red-50 text-[#9A2B26] text-xs">
                  <strong>Cảnh báo Hợp đồng 019-2026 (Toàn Nhất):</strong> {doc.data.cutoff_warning}
                </div>
              )}

              <table className="w-full border-collapse border border-[#cbb7a2] text-xs">
                <thead>
                  <tr className="bg-[#3B281A] text-[#F8F4EC]">
                    <th className="border border-[#cbb7a2] p-2 text-center w-10">STT</th>
                    <th className="border border-[#cbb7a2] p-2 text-left w-36">Mã hàng (ERP)</th>
                    <th className="border border-[#cbb7a2] p-2 text-left">Tên sản phẩm</th>
                    <th className="border border-[#cbb7a2] p-2 text-center w-16">ĐVT</th>
                    <th className="border border-[#cbb7a2] p-2 text-center w-16">SL Yêu cầu</th>
                    <th className="border border-[#cbb7a2] p-2 text-center w-16">SL Thực tế</th>
                  </tr>
                </thead>
                <tbody>
                  {(doc.data.items || []).map((it: any, i: number) => (
                    <tr key={i}>
                      <td className="border border-[#cbb7a2] p-2 text-center">{i + 1}</td>
                      <td className="border border-[#cbb7a2] p-2 font-mono">{it.barcode}</td>
                      <td className="border border-[#cbb7a2] p-2">{it.product_name}</td>
                      <td className="border border-[#cbb7a2] p-2 text-center">{it.unit || 'Thùng'}</td>
                      <td className="border border-[#cbb7a2] p-2 text-center font-semibold">{it.qty}</td>
                      <td className="border border-[#cbb7a2] p-2 text-center">{it.actual_qty ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-3 gap-6 pt-6 text-center text-xs">
                <div>
                  <div className="font-bold">NGƯỜI LẬP PHIẾU (BENOM)</div>
                  <div className="text-gray-500 mb-16">(Ký, ghi rõ họ tên)</div>
                  <div className="font-semibold">{doc.data.created_by || 'Trần Anh Tuyến'}</div>
                </div>
                <div>
                  <div className="font-bold">THỦ KHO TOÀN NHẤT (BD02)</div>
                  <div className="text-gray-500 mb-16">(Ký, ghi rõ họ tên)</div>
                  <div>___________________</div>
                </div>
                <div>
                  <div className="font-bold">TÀI XẾ / NGƯỜI NHẬN</div>
                  <div className="text-gray-500 mb-16">(Ký, biển số xe)</div>
                  <div>___________________</div>
                </div>
              </div>
            </div>
          )}

          {/* WARRANTY (BM-02) */}
          {doc.type === 'WARRANTY' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-[#F8F4EC] p-3.5 rounded-lg border border-[#E6DDD1]">
                <div><strong>Khách hàng:</strong> {doc.data.customer_name}</div>
                <div><strong>Số điện thoại:</strong> {doc.data.customer_phone}</div>
                <div className="col-span-2"><strong>Địa chỉ:</strong> {doc.data.address}</div>
                <div><strong>Mã hóa đơn:</strong> {doc.data.invoice_no || '—'}</div>
                <div><strong>Kênh tiếp nhận:</strong> {doc.data.channel}</div>
                <div><strong>Sản phẩm:</strong> {doc.data.product_name}</div>
                <div><strong>Barcode:</strong> {doc.data.barcode || '—'}</div>
                <div><strong>Chế độ:</strong> {doc.data.is_in_warranty ? 'Trong bảo hành (Miễn phí)' : 'Ngoài bảo hành (Có phí)'}</div>
                <div><strong>KTV phụ trách:</strong> {doc.data.ktv_assigned}</div>
              </div>

              <div className="border border-[#E6DDD1] rounded-lg p-3.5">
                <div className="font-bold text-[#3B281A] mb-1">Mô tả sự cố / Yêu cầu khách hàng:</div>
                <div>{doc.data.issue_desc}</div>
              </div>

              {!doc.data.is_in_warranty && (
                <div className="border border-[#D6BCA5] rounded-lg p-3.5 bg-[#F8F4EC] text-xs">
                  <div className="font-bold text-[#3B281A] mb-1">Dự toán chi phí ngoài bảo hành:</div>
                  <div>Phí kiểm tra/dịch vụ: {fmtVnd(doc.data.fee_service)} | Linh kiện: {fmtVnd(doc.data.fee_parts)} | Vận chuyển: {fmtVnd(doc.data.fee_ship)}</div>
                </div>
              )}

              <div className="text-xs text-gray-600">
                <strong>Cam kết SLA benom:</strong> Phản hồi trong 2 giờ ({doc.data.sla_respond_at}) • Chẩn đoán trong 24 giờ ({doc.data.sla_assess_at}) • Xử lý hoàn tất ({doc.data.sla_resolve_at}).
              </div>

              <div className="grid grid-cols-2 gap-8 pt-6 text-center text-xs">
                <div>
                  <div className="font-bold">ĐẠI DIỆN CSKH / KỸ THUẬT BENOM</div>
                  <div className="text-gray-500 mb-14">(Ký, ghi rõ họ tên)</div>
                  <div className="font-semibold">{doc.data.ktv_assigned}</div>
                </div>
                <div>
                  <div className="font-bold">KHÁCH HÀNG XÁC NHẬN</div>
                  <div className="text-gray-500 mb-14">(Ký, ghi rõ họ tên)</div>
                  <div className="font-semibold">{doc.data.customer_name}</div>
                </div>
              </div>
            </div>
          )}

          {/* BM-03 (KIỂM ĐỊNH KỸ THUẬT & THU HỒI CẤP 3) */}
          {doc.type === 'BM03' && (() => {
            const damages: string[] = (() => { try { return JSON.parse(doc.data.damage_types_json || '[]'); } catch { return []; } })();
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 bg-[#F8F4EC] p-3.5 rounded-lg border border-[#E6DDD1]">
                  <div><strong>Căn cứ Ticket BM-02:</strong> {doc.data.ticket_no || '—'}</div>
                  <div><strong>Mã đơn hàng gốc:</strong> {doc.data.invoice_no || '—'}</div>
                  <div><strong>Địa điểm kiểm định:</strong> {doc.data.location}</div>
                  <div><strong>Kỹ thuật kiểm định:</strong> {doc.data.tech_name || '—'}</div>
                  <div><strong>Khách hàng / ĐVVC:</strong> {doc.data.customer_name} ({doc.data.customer_phone || '—'})</div>
                  <div><strong>Đóng gói thu hồi:</strong> {doc.data.packaging_state}</div>
                </div>

                <div className="border border-[#cbb7a2] rounded-lg p-3.5 space-y-1.5 text-xs">
                  <div className="font-bold text-[#3B281A]">II. THÔNG TIN SẢN PHẨM THU HỒI</div>
                  <div><strong>Sản phẩm:</strong> {doc.data.product_name} | <strong>Barcode:</strong> <span className="font-mono">{doc.data.barcode || '—'}</span> | <strong>SL:</strong> {doc.data.qty}</div>
                </div>

                <div className="border border-[#cbb7a2] rounded-lg p-3.5 space-y-1.5 text-xs">
                  <div className="font-bold text-[#3B281A]">III. KẾT QUẢ KIỂM ĐỊNH KỸ THUẬT</div>
                  <div><strong>Hiện trạng hư hỏng:</strong> {damages.join('; ') || '—'}{doc.data.damage_other ? ` (${doc.data.damage_other})` : ''}</div>
                  <div><strong>Xác định nguyên nhân:</strong> <strong>{doc.data.root_cause}</strong></div>
                </div>

                <div className="border border-[#cbb7a2] rounded-lg p-3.5 space-y-1.5 text-xs bg-[#FAF7F2]">
                  <div className="font-bold text-[#3B281A]">IV. PHƯƠNG ÁN QUYẾT ĐỊNH XỬ LÝ</div>
                  <div><strong>Với Khách hàng:</strong> {doc.data.customer_resolution} {doc.data.replacement_code ? `(Mã/Hẹn: ${doc.data.replacement_code})` : ''} {doc.data.refund_amount > 0 ? `(Hoàn: ${fmtVnd(doc.data.refund_amount)})` : ''}</div>
                  <div><strong>Quản trị kho DC 9005:</strong> {doc.data.warehouse_disposition} | <strong>Mã Inventory Adjustment (ERP):</strong> <span className="font-mono">{doc.data.inv_adj_code || '____________'}</span></div>
                </div>

                <div className="grid grid-cols-4 gap-4 pt-6 text-center text-[11px]">
                  <div>
                    <div className="font-bold">KỸ THUẬT KIỂM ĐỊNH</div>
                    <div className="text-gray-500 mb-14">(Ký, ghi rõ họ tên)</div>
                    <div className="font-semibold">{doc.data.tech_name || '___________'}</div>
                  </div>
                  <div>
                    <div className="font-bold">KHO 9005 / STORE</div>
                    <div className="text-gray-500 mb-14">(Ký, ghi rõ họ tên)</div>
                    <div>{doc.data.wh_rep || '___________'}</div>
                  </div>
                  <div>
                    <div className="font-bold">PHÊ DUYỆT SCM</div>
                    <div className="text-gray-500 mb-14">(Ký, ghi rõ họ tên)</div>
                    <div>___________</div>
                  </div>
                  <div>
                    <div className="font-bold">KHÁCH HÀNG</div>
                    <div className="text-gray-500 mb-2">(Ký xác nhận)</div>
                    {doc.data.signature_data ? <img src={doc.data.signature_data} alt="Chữ ký KH" className="h-14 mx-auto object-contain mb-1" /> : <div className="h-12" />}
                    <div className="font-semibold">{doc.data.customer_name}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* BM-04 (BIÊN BẢN SỰ CỐ GIAO NHẬN & CLAIM 3PL) */}
          {doc.type === 'BM04' && (() => {
            const pkg: string[] = (() => { try { return JSON.parse(doc.data.packaging_checks_json || '[]'); } catch { return []; } })();
            const evd: string[] = (() => { try { return JSON.parse(doc.data.evidence_checks_json || '[]'); } catch { return []; } })();
            const items: any[] = (() => { try { return JSON.parse(doc.data.items_json || '[]'); } catch { return []; } })();
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2.5 bg-[#F8F4EC] p-3.5 rounded-lg border border-[#E6DDD1] text-xs">
                  <div><strong>Đơn vị vận chuyển:</strong> {doc.data.carrier}</div>
                  <div><strong>Mã AWB / Chuyến:</strong> <span className="font-mono">{doc.data.awb_no || '—'}</span></div>
                  <div><strong>Mã đơn Benom:</strong> <span className="font-mono">{doc.data.invoice_no || '—'}</span></div>
                  <div><strong>Địa điểm lập:</strong> {doc.data.location}</div>
                  <div><strong>Tài xế:</strong> {doc.data.driver_name || '—'} (SĐT: {doc.data.driver_phone || '—'})</div>
                  <div><strong>Biển số xe / CCCD:</strong> {doc.data.vehicle_plate || '—'} / {doc.data.driver_cccd || '—'}</div>
                </div>

                <div className="text-xs space-y-1">
                  <div><strong>Bao bì ngoại quan:</strong> {pkg.join('; ') || '—'}</div>
                  <div><strong>Bằng chứng thu thập:</strong> {evd.join('; ') || '—'}</div>
                  <div><strong>Đánh giá nguyên nhân:</strong> {doc.data.cause_assessment}</div>
                </div>

                <table className="w-full border-collapse border border-[#cbb7a2] text-xs">
                  <thead>
                    <tr className="bg-[#9A2B26] text-white">
                      <th className="border border-[#cbb7a2] p-2 text-center w-10">STT</th>
                      <th className="border border-[#cbb7a2] p-2 text-left">Tên sản phẩm</th>
                      <th className="border border-[#cbb7a2] p-2 text-center w-16">SL hỏng</th>
                      <th className="border border-[#cbb7a2] p-2 text-left">Mô tả tổn thất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i}>
                        <td className="border border-[#cbb7a2] p-2 text-center">{i + 1}</td>
                        <td className="border border-[#cbb7a2] p-2 font-medium">{it.product_name}</td>
                        <td className="border border-[#cbb7a2] p-2 text-center font-bold text-[#9A2B26]">{it.qty_damaged}</td>
                        <td className="border border-[#cbb7a2] p-2">{it.damage_desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="p-3 rounded-lg border border-[#9A2B26]/50 bg-red-50 text-xs space-y-1">
                  <div><strong>Tình trạng hàng:</strong> {doc.data.goods_disposition} | <strong>Giá trị yêu cầu đền bù:</strong> <strong className="text-[#9A2B26]">{fmtVnd(doc.data.claim_amount)}</strong></div>
                  <div><strong>Cam kết SLA bồi thường (SOP-BENOM-SCM-03):</strong> Đơn vị vận chuyển phản hồi đền bù trong vòng 48 giờ ({doc.data.claim_deadline_at || '—'}) theo giá trị xuất kho/hóa đơn Công ty TNHH Kohnan Việt Nam.</div>
                </div>

                <div className="grid grid-cols-3 gap-6 pt-5 text-center text-xs">
                  <div>
                    <div className="font-bold">TÀI XẾ / ĐẠI DIỆN 3PL</div>
                    <div className="text-gray-500 mb-2">(Ký, ghi rõ họ tên)</div>
                    {doc.data.driver_signature_data ? <img src={doc.data.driver_signature_data} alt="Chữ ký tài xế" className="h-16 mx-auto object-contain mb-1" /> : <div className="h-14" />}
                    <div className="font-semibold">{doc.data.driver_name || '___________________'}</div>
                  </div>
                  <div>
                    <div className="font-bold">KHO 9005 / STORE 3001</div>
                    <div className="text-gray-500 mb-16">(Ký, ghi rõ họ tên)</div>
                    <div>___________________</div>
                  </div>
                  <div>
                    <div className="font-bold">PHÊ DUYỆT SCM</div>
                    <div className="text-gray-500 mb-16">(Ký, ghi rõ họ tên)</div>
                    <div>___________________</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Official Footer */}
          <div className="mt-10 pt-3 border-t border-[#D6BCA5] text-[10px] text-center text-[#6e5543]">
            {BENOM_FOOTER}
          </div>
        </div>
      </div>
    </div>
  );
}
