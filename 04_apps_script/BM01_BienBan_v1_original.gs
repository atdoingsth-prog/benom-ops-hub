// ============================================================
// KOHNAN VIETNAM · BENOM — BIÊN BẢN BÀN GIAO & LẮP ĐẶT (BM-01)
// Tab nhập liệu : NHAP_BIEN_BAN
// Tab lịch sử   : BIEN_BAN_DATA
// (Bản gốc do người dùng cung cấp ngày 23/11/2026 — giữ nguyên làm baseline)
// ============================================================

var CONFIG_BB = {
  TAB_NHAP : "NHAP_BIEN_BAN",
  TAB_DATA : "BIEN_BAN_DATA",

  EMAIL_TO : "service.benom@kohnanvn.com",
  EMAIL_CC : "nhi.tran@kohnanvn.com, xuan.bui@kohnanvn.com, uyennhi.tran@kohnanvn.com, tuyen.tran@kohnanvn.com",

  TIEU_DE  : "[Kohnan Benom] Biên bản bàn giao & lắp đặt {SO_BB} - ĐH {MA_DH}",
  LOI_CHAO : "Dear anh/chị,<br><br>Benom xin gửi <strong>Phiếu xuất kho kiêm Biên bản bàn giao & Nghiệm thu lắp đặt ({SO_BB})</strong> cho đơn hàng <strong>{MA_DH}</strong>. Vui lòng kiểm tra thông tin chi tiết bên dưới và in file PDF đính kèm để đồng kiểm với khách hàng.<br><br>Trân trọng,",

  CELL_SO_BB       : "B5",
  CELL_MA_DH       : "E5",
  CELL_NGAY_GIAO   : "B6",
  CELL_KHO_XUAT    : "E6",
  CELL_TEN_KH      : "B8",
  CELL_SDT_KH      : "E8",
  CELL_DIA_CHI     : "B9",
  CELL_DV_VC       : "B10",
  CELL_KTV_1       : "E10",
  CELL_MA_NV_1     : "H10",
  CELL_DV_LAP      : "B11",
  CELL_KTV_2       : "E11",
  CELL_MA_NV_2     : "H11",
  ROW_SP_START     : 15,
  ROW_SP_END       : 36
};

function onOpen() {
  capNhatSoBienBan_();
  SpreadsheetApp.getUi()
    .createMenu("Biên bản bàn giao (BM-01)")
    .addItem("Tạo biên bản PDF & Gửi mail", "taoBienBanVaGuiMail")
    .addSeparator()
    .addItem("Xóa form nhập biên bản mới", "xoaFormBienBan_")
    .addItem("Xem lịch sử biên bản", "xemLichSuBienBan_")
    .addToUi();
}

function layPrefixBienBan_() {
  var now   = new Date();
  var month = String(now.getMonth() + 1).padStart(2, "0");
  var year  = String(now.getFullYear()).slice(-2);
  return "BB-" + month + year + "-";
}

function layMaxSoBienBan_() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var wsD     = ss.getSheetByName(CONFIG_BB.TAB_DATA);
  if (!wsD) return 0;
  var prefix  = layPrefixBienBan_();
  var maxNum  = 0;
  var lastRow = wsD.getLastRow();
  if (lastRow >= 3) {
    var vals = wsD.getRange(3, 1, lastRow - 2, 1).getValues();
    vals.forEach(function(row) {
      var val = String(row[0]).trim();
      if (val.indexOf(prefix) === 0) {
        var num = parseInt(val.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
  }
  return maxNum;
}

function taoSoBienBan_() {
  return layPrefixBienBan_() + String(layMaxSoBienBan_() + 1).padStart(3, "0");
}

function capNhatSoBienBan_() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var wsN = ss.getSheetByName(CONFIG_BB.TAB_NHAP);
  if (!wsN) return;
  wsN.getRange(CONFIG_BB.CELL_SO_BB).setValue(taoSoBienBan_());
}

// ... (phần còn lại: taoBienBanVaGuiMail, xoaFormBienBan_, xemLichSuBienBan_,
//      taoPDF_BB_, guiEmail_BB_, formatDate_BB_ — xem nguyên văn trong tin nhắn
//      của người dùng ngày 23/11/2026; sẽ được thay bằng bản v2 đã refactor.)
