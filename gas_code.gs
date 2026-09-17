/**
 * 8月既存生販売（Daily Letters / Founders Table / Leaders Lounge）
 * ── 申込管理シート連携 + 自動返信メール
 *
 * 【セットアップ手順】
 * 1. Googleスプレッドシート「8月既存生販売_申込管理」を開く
 * 2. 拡張機能 → Apps Script を開き、このコードを全て貼り付け
 * 3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *      - 次のユーザーとして実行：自分
 *      - アクセスできるユーザー：全員
 * 4. 発行されたウェブアプリURLを index.html の GAS_URL に貼り付け
 *
 * 【注意】再デプロイのときは必ず「新バージョン」を選ぶこと。
 *         「アクセスできるユーザー：全員」でないとLPから叩けない。
 */

const CONFIG = {
  // ── 銀行振込先（自動返信メールに記載）──
  BANK_INFO:
    "【銀行振込（日本国内）】\n" +
    "※ 弊社所在地がドイツのため、日本国内のお振込みは\n" +
    "　レムケなつこ個人口座になります。\n\n" +
    "三菱UFJ銀行\n" +
    "・店名：池上支店（116）\n" +
    "・預金種目：普通\n" +
    "・口座番号：0190673\n" +
    "・口座名義：ﾚﾑｹﾅﾂｺ\n\n" +
    "ドイツ法人口座へのお振込みをご希望の場合は、\n" +
    "このメールに「ドイツ法人振込希望」とご返信ください。詳細をご案内します。\n\n" +
    "※ 振込手数料は国内外問わずご負担をお願いいたします。\n" +
    "※ 銀行振込は、プランを問わず一括のみとなります。",

  // ── Stripe決済リンク（プラン × 支払い回数で出し分け）──
  // 🚨Stripe側の商品名が「梅／竹／松」のままなら、決済画面で表示名が食い違う。
  //    公開前に Stripe ダッシュボードで商品名を新プラン名に直すこと。
  STRIPE: {
    "Daily Letters": {
      "一括": "https://buy.stripe.com/28E3cw4Mr0sc5hT1An1kA0I",
      "3回分割": ""   // Daily Letters は一括のみ
    },
    "Founders Table": {
      "一括": "https://buy.stripe.com/3cI7sMen10scdOpdj51kA0J",
      "3回分割": "https://buy.stripe.com/aFacN64Mrgra8u51An1kA0L"
    },
    "Leaders Lounge": {
      "一括": "https://buy.stripe.com/9B6cN6baPgra25H1An1kA0K",
      "3回分割": "https://buy.stripe.com/14A5kE7YDcaU5hT3Iv1kA0M"
    }
  },

  // ── PayPal決済リンク（未作成。用意でき次第ここに追記）──
  PAYPAL: {
    "Daily Letters": { "一括": "", "3回分割": "" },
    "Founders Table": { "一括": "", "3回分割": "" },
    "Leaders Lounge": { "一括": "", "3回分割": "" }
  },

  SENDER_NAME: "IOBオーガニックスクール事務局",
  SENDER_EMAIL: "school@iob.bio",   // Gmailの送信元アドレスに登録済みの場合のみ反映
  NOTIFY_TO: "school@iob.bio"       // 申込通知の受信先（カンマ区切りで複数可）
};

function checkAliases() {
  Logger.log(GmailApp.getAliases());
}

/** プラン名からキーを取り出す（"Daily Letters（€280）" → "Daily Letters"） */
function planKey(plan) {
  if (!plan) return "";
  if (plan.indexOf("Daily Letters") !== -1) return "Daily Letters";
  if (plan.indexOf("Founders Table") !== -1) return "Founders Table";
  if (plan.indexOf("Leaders Lounge") !== -1) return "Leaders Lounge";
  return "";
}

/** 開始時期の案内文をプランごとに出し分ける */
function startText(key) {
  if (key === "Daily Letters") {
    return "Daily Letters は9月中旬に始まります。開始日が決まり次第、改めてご案内します。";
  }
  if (key === "Founders Table" || key === "Leaders Lounge") {
    return "Daily Letters は9月中旬、共同学習会（およびリーダーズラウンジ）は10月に始まります。\n" +
           "共同学習会・リーダーズラウンジは、どちらも10月に立ち上がる新しいグループです。全員が同じ月からのスタートになります。\n" +
           "日程が決まり次第、改めてご案内します。";
  }
  return "開始時期については、改めてご案内します。";
}

/** 決済案内ブロックを組み立てる */
function payBlockFor(d) {
  const key = planKey(d.plan);
  const inst = (d.installment === "3回分割") ? "3回分割" : "一括";

  if (d.payment && d.payment.indexOf("銀行振込") !== -1) {
    return CONFIG.BANK_INFO;
  }

  if (d.payment === "Stripe（クレジットカード）") {
    const link = (CONFIG.STRIPE[key] || {})[inst] || "";
    if (link) {
      return "【Stripe（クレジットカード）でのお支払い・" + inst + "】\n" + link +
             "\n\nこちらのリンクよりお手続きください。";
    }
    if (key === "Daily Letters" && inst === "3回分割") {
      return "【Stripe（クレジットカード）でのお支払い】\n" +
             "Daily Letters は一括のみのお取り扱いとなります。一括のお支払いリンクを、改めてお送りします。";
    }
    return "【Stripe（クレジットカード）でのお支払い】\n" +
           "決済リンクを準備中です。整い次第、改めてメールでご案内します。今しばらくお待ちください。";
  }

  if (d.payment === "PayPal") {
    const plink = (CONFIG.PAYPAL[key] || {})[inst] || "";
    if (plink) {
      return "【PayPalでのお支払い・" + inst + "】\n" + plink +
             "\n\nこちらのリンクよりお手続きください。";
    }
    return "【PayPalでのお支払い】\n" +
           "決済リンクを準備中です。整い次第、改めてメールでご案内します。今しばらくお待ちください。";
  }

  return "決済方法を確認のうえ、改めてご案内します。";
}

/** POST・GETどちらで来ても同じ処理に流す（302リダイレクト対策） */
function doPost(e) { return handle(e); }
function doGet(e)  { return handle(e); }

function handle(e) {
  try {
    // POSTボディ・GETパラメータの両対応
    var raw = "";
    if (e && e.postData && e.postData.contents) {
      raw = e.postData.contents;
    } else if (e && e.parameter && e.parameter.payload) {
      raw = e.parameter.payload;
    }
    if (!raw) {
      return ContentService.createTextOutput(JSON.stringify({ result: "no-data" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const d = JSON.parse(raw);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["申込日時", "お名前", "メールアドレス", "プラン", "希望決済方法", "お支払い回数", "モニター表記希望", "ご質問・連絡事項", "通知結果", "返信結果"]);
    }

    const ts = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss");
    sheet.appendRow([ts, d.name, d.email, d.plan, d.payment, d.installment, d.monitorName, d.message]);
    const lastRow = sheet.getLastRow();

    var notifyStatus = "";
    var replyStatus = "";

    // ── 事務局への控え通知 ──
    if (CONFIG.NOTIFY_TO) {
      try {
        MailApp.sendEmail({
          to: CONFIG.NOTIFY_TO,
          subject: "【申込】" + d.name + " 様（" + d.plan + "）",
          body: "申込が入りました。\n\n" +
            "お名前：" + d.name + "\n" +
            "メール：" + d.email + "\n" +
            "プラン：" + d.plan + "\n" +
            "希望決済方法：" + d.payment + "\n" +
            "お支払い回数：" + d.installment + "\n" +
            "モニター表記希望：" + d.monitorName + "\n" +
            "ご質問・連絡事項：" + d.message + "\n" +
            "日時：" + ts
        });
        notifyStatus = "通知OK " + ts;
      } catch (e2) {
        notifyStatus = "通知ERR: " + e2;
      }
      sheet.getRange(lastRow, 9).setValue(notifyStatus);
    }

    // ── 申込者への自動返信 ──
    if (d.email) {
      try {
        const key = planKey(d.plan);

        const body =
          d.name + " 様\n\n" +
          "IOBオーガニックスクール事務局です。\n" +
          "このたびは「" + d.plan + "」のお申し込みをいただき、ありがとうございました。\n\n" +
          "■ お申し込み内容\n" +
          "プラン：" + d.plan + "\n" +
          "希望決済方法：" + d.payment + "\n" +
          "お支払い回数：" + d.installment + "\n\n\n" +
          "■ お支払いについて\n\n" +
          payBlockFor(d) + "\n\n\n" +
          "■ 開始時期について\n\n" +
          startText(key) + "\n\n\n" +
          "■ モニターについて\n\n" +
          "今回はモニター価格でのご案内です。アンケートと取材へのご協力をお願いしております。\n" +
          "お名前の出し方（イニシャル／フルネーム）・お顔出しの有無は、その際に改めて個別にお伺いします。\n" +
          "いま決めていただく必要はありません。\n\n\n" +
          "■ プランの変更と返金について\n\n" +
          "あとから上のプランに移ることができます。その場合は差額をお支払いいただく形です。\n" +
          "下のプランに移ることもできますが、差額の返金はありません。\n" +
          "また、返金は行っておりません。この点だけ、先にお伝えしておきます。\n\n\n" +
          "ご不明な点は、お気軽に school@iob.bio までご連絡ください。\n" +
          "9月に、一緒に始めましょう。\n\n" +
          "──────\n" +
          "Institut für Organic Business GmbH\n" +
          "オーガニックビジネス研究所 スクール事務局\n" +
          "「オーガニックが、あたりまえ。」な社会へ\n" +
          "営業時間：日本時間 平日10〜16時／お問い合わせは3営業日以内にお答えします\n" +
          "──────";

        const opts = { name: CONFIG.SENDER_NAME };
        try {
          if (GmailApp.getAliases().indexOf(CONFIG.SENDER_EMAIL) !== -1) {
            opts.from = CONFIG.SENDER_EMAIL;
          }
        } catch (e3) {}
        GmailApp.sendEmail(d.email, "【お申し込みありがとうございます】" + d.plan + " のご案内", body, opts);
        replyStatus = "返信OK " + ts;
      } catch (e4) {
        replyStatus = "返信ERR: " + e4;
      }
      sheet.getRange(lastRow, 10).setValue(replyStatus);
    }

    return ContentService.createTextOutput(JSON.stringify({ result: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ result: "error", message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
