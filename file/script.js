const RATES = {
  USD: 0.01748, AED: 0.06420, SAR: 0.06557, SGD: 0.02340,
  HKD: 0.13650, EUR: 0.01614, GBP: 0.01381, JPY: 2.6540, KRW: 24.320,
};
const CURRENCY_SYMBOLS = {
  USD: "$", AED: "د.إ", SAR: "﷼", SGD: "S$",
  HKD: "HK$", EUR: "€", GBP: "£", JPY: "¥", KRW: "₩",
};
const FEE_RATE      = 0.02;   
const BANK_FEE_RATE = 0.05;   

let state = { balance: 0, transactions: [], expenses: [], recipients: [] };

function loadState() {
  try {
    const s = localStorage.getItem("ofw-padala-v2");
    if (s) state = { ...state, ...JSON.parse(s) };
  } catch {  }
}
function saveState() {
  localStorage.setItem("ofw-padala-v2", JSON.stringify(state));
}

const PAGES = ["dashboard","recipients","send","transactions","expenses"];
const PAGE_META = {
  dashboard:    ["Dashboard",            "Your remittance overview at a glance"],
  recipients:   ["Recipients",           "Your family members in the Philippines"],
  send:         ["Send Padala",          "Fast transfer · 2% fee · No hidden charges"],
  transactions: ["Remittance History",   "Every padala you've sent home"],
  expenses:     ["How Padala Was Used",  "Track what your family spent the money on in PH"],
};

function showPage(name) {
  PAGES.forEach((p) => {
    document.getElementById("page-" + p).classList.toggle("hidden", p !== name);
    const btn = document.getElementById("nav-" + p);
    btn.classList.toggle("active", p === name);
  });
  const [title, subtitle] = PAGE_META[name];
  document.getElementById("page-title").textContent    = title;
  document.getElementById("page-subtitle").textContent = subtitle;

  if (name === "dashboard")    renderDashboard();
  if (name === "recipients")   renderRecipients();
  if (name === "send")         renderSendRecipientPills();
  if (name === "transactions") renderTransactions();
  if (name === "expenses")     renderExpenses();
}

function fmt(n)        { return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtF(n, cur)  { return (CURRENCY_SYMBOLS[cur] || cur + " ") + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(iso)  { return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }); }
function initials(name){ return name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase(); }
function escHtml(s)    { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function todayStr()    { return new Date().toISOString().split("T")[0]; }

function updateHeaderBalance() {
  document.getElementById("header-balance").textContent = fmt(state.balance);
}

function showTopUpModal() {
  document.getElementById("topup-modal").classList.add("open");
  document.getElementById("topup-amount").value = "";
  setTimeout(() => document.getElementById("topup-amount").focus(), 50);
}
function hideTopUpModal() { document.getElementById("topup-modal").classList.remove("open"); }
function setTopUp(v) { document.getElementById("topup-amount").value = v; }
function handleTopUp() {
  const val = parseFloat(document.getElementById("topup-amount").value);
  if (!val || val < 100) { showToast("Minimum top-up is ₱100"); return; }
  state.balance += val;
  saveState();
  updateHeaderBalance();
  hideTopUpModal();
  showToast("₱" + val.toLocaleString() + " added to your wallet!");
}

function showAddRecipientModal(id) {
  const modal = document.getElementById("recipient-modal");
  const editing = id ? state.recipients.find(r => r.id === id) : null;
  document.getElementById("recipient-modal-title").textContent = editing ? "Edit Recipient" : "Add Recipient";
  document.getElementById("rc-edit-id").value       = editing ? id : "";
  document.getElementById("rc-name").value          = editing ? editing.name : "";
  document.getElementById("rc-rel").value           = editing ? editing.relationship : "Spouse";
  document.getElementById("rc-location").value      = editing ? editing.location : "";
  document.getElementById("rc-account-type").value  = editing ? editing.accountType : "GCash";
  document.getElementById("rc-account-num").value   = editing ? editing.accountNumber : "";
  document.getElementById("rc-default-currency").value = editing ? editing.defaultCurrency : "AED";
  document.getElementById("rc-wallet-address").value = editing ? (editing.walletAddress || "") : "";
  modal.classList.add("open");
  setTimeout(() => document.getElementById("rc-name").focus(), 50);
}
function hideRecipientModal() { document.getElementById("recipient-modal").classList.remove("open"); }

function saveRecipient() {
  const name    = document.getElementById("rc-name").value.trim();
  const editId  = document.getElementById("rc-edit-id").value;
  if (!name) { showToast("Please enter the recipient's name"); return; }

  const data = {
    name,
    relationship:    document.getElementById("rc-rel").value,
    location:        document.getElementById("rc-location").value.trim(),
    accountType:     document.getElementById("rc-account-type").value,
    accountNumber:   document.getElementById("rc-account-num").value.trim(),
    defaultCurrency: document.getElementById("rc-default-currency").value,
    walletAddress:   document.getElementById("rc-wallet-address").value.trim(),
  };

  if (editId) {
    const idx = state.recipients.findIndex(r => r.id === editId);
    if (idx !== -1) state.recipients[idx] = { ...state.recipients[idx], ...data };
    showToast(name + " updated!");
  } else {
    state.recipients.push({ id: "RC" + Date.now(), ...data });
    showToast(name + " added as a recipient!");
  }

  saveState();
  hideRecipientModal();
  renderRecipients();
  updateRecipientBadge();
}

function deleteRecipient(id) {
  const r = state.recipients.find(r => r.id === id);
  if (!r) return;
  state.recipients = state.recipients.filter(r => r.id !== id);
  saveState();
  renderRecipients();
  updateRecipientBadge();
  showToast(r.name + " removed from recipients");
}

function updateRecipientBadge() {
  const el = document.getElementById("nav-recipients-count");
  if (el) el.textContent = state.recipients.length;
  const statEl = document.getElementById("stat-recipients");
  if (statEl) statEl.textContent = state.recipients.length;
}

function renderRecipients() {
  const grid = document.getElementById("recipients-grid");
  if (!grid) return;
  updateRecipientBadge();

  if (state.recipients.length === 0) {
    grid.innerHTML = `<div class="empty" style="padding:60px"><span class="empty-icon">👥</span>No recipients yet.<br>Add your family members to send padala quickly.</div>`;
    return;
  }

  grid.className = "recipients-grid";
  grid.style.padding = "20px";
  grid.innerHTML = state.recipients.map(r => `
    <div class="recipient-card">
      <div class="rc-top">
        <div class="rc-avatar">${escHtml(initials(r.name))}</div>
        <div>
          <div class="rc-name">${escHtml(r.name)}</div>
          <div class="rc-rel">${escHtml(r.relationship)}</div>
        </div>
      </div>
      <div class="rc-meta">
        ${r.location ? `<div class="rc-meta-row">${escHtml(r.location)}</div>` : ""}
        <div class="rc-meta-row">
          <span class="rc-badge">${escHtml(r.accountType)}</span>
          ${r.accountNumber ? `<span style="color:#aaa">${escHtml(r.accountNumber)}</span>` : ""}
        </div>
        ${r.walletAddress ? `<div class="rc-meta-row" style="font-size:11px;color:#888;font-family:monospace">${r.walletAddress.slice(0,10)}…${r.walletAddress.slice(-6)} <span class="rc-badge" style="background:#f0f7f0;color:#2d7a2d;margin-left:4px">Morph</span></div>` : ""}
        <div class="rc-meta-row" style="color:#bbb;font-size:11px">Default: ${r.defaultCurrency}</div>
      </div>
      <div class="rc-actions">
        <button class="btn-primary btn-sm" onclick="quickSend('${r.id}')">Send Now</button>
        <button class="btn-danger" onclick="showAddRecipientModal('${r.id}')">Edit</button>
        <button class="btn-danger" onclick="deleteRecipient('${r.id}')">Remove</button>
      </div>
    </div>`).join("");
}

function quickSend(id) {
  const r = state.recipients.find(r => r.id === id);
  if (!r) return;
  showPage("send");
  document.getElementById("recipient-name").value = r.name;
  document.getElementById("recipient-rel").value  = r.relationship;
  document.getElementById("dest-currency").value  = r.defaultCurrency;
  const addrEl = document.getElementById("onchain-recipient-addr");
  if (addrEl) addrEl.value = r.walletAddress || "";
  document.querySelectorAll(".rc-pill").forEach(p => p.classList.toggle("active", p.dataset.id === id));
  updateConversion();
  document.getElementById("send-amount").focus();
}

function renderSendRecipientPills() {
  const wrap      = document.getElementById("recipient-selector-wrap");
  const container = document.getElementById("recipient-selector");
  if (!wrap || !container) return;

  if (state.recipients.length === 0) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";

  container.innerHTML = state.recipients.map(r => `
    <button type="button" class="rc-pill" data-id="${r.id}" onclick="selectSendRecipient('${r.id}')">
      <div class="pill-avatar">${escHtml(initials(r.name))}</div>
      ${escHtml(r.name)}
    </button>`).join("") +
    `<button type="button" class="rc-pill" data-id="" onclick="clearSendRecipient()">＋ New</button>`;
}

function selectSendRecipient(id) {
  const r = state.recipients.find(r => r.id === id);
  if (!r) return;
  document.getElementById("recipient-name").value = r.name;
  document.getElementById("recipient-rel").value  = r.relationship;
  document.getElementById("dest-currency").value  = r.defaultCurrency;
  const addrEl = document.getElementById("onchain-recipient-addr");
  if (addrEl) addrEl.value = r.walletAddress || "";
  document.querySelectorAll(".rc-pill").forEach(p => p.classList.toggle("active", p.dataset.id === id));
  updateConversion();
}

function clearSendRecipient() {
  document.getElementById("recipient-name").value = "";
  document.getElementById("recipient-rel").value  = "Spouse";
  document.querySelectorAll(".rc-pill").forEach(p => p.classList.remove("active"));
  document.getElementById("send-amount").value = "";
  document.getElementById("conversion-box").classList.add("hidden");
}

function updateConversion() {
  const amount = parseFloat(document.getElementById("send-amount").value);
  const cur    = document.getElementById("dest-currency").value;
  const box    = document.getElementById("conversion-box");
  if (!amount || amount <= 0) { box.classList.add("hidden"); return; }

  const fee        = amount * FEE_RATE;
  const bankFee    = amount * BANK_FEE_RATE;
  const savings    = bankFee - fee;
  const received   = (amount - fee) * RATES[cur];

  document.getElementById("conv-send").textContent    = fmt(amount);
  document.getElementById("conv-fee").textContent     = "−" + fmt(fee);
  document.getElementById("conv-rate").textContent    = "1 PHP = " + RATES[cur].toFixed(5) + " " + cur;
  document.getElementById("conv-receive").textContent = fmtF(received, cur);
  document.getElementById("conv-savings").textContent = "You save " + fmt(savings) + " vs traditional banks";
  box.classList.remove("hidden");
  if (typeof updateOnchainPreview === "function") updateOnchainPreview();
}

async function handleSend(e) {
  e.preventDefault();
  const amount       = parseFloat(document.getElementById("send-amount").value);
  const cur          = document.getElementById("dest-currency").value;
  const recipient    = document.getElementById("recipient-name").value.trim();
  const relationship = document.getElementById("recipient-rel").value;
  const purpose      = document.getElementById("send-purpose").value;
  const note         = document.getElementById("send-note").value.trim();

  if (!recipient)              { showToast("Please enter a recipient name"); return; }
  if (!amount || amount < 100) { showToast("Minimum transfer is ₱100"); return; }

  const toAddr = document.getElementById("onchain-recipient-addr")?.value.trim();
  const tokSym = document.getElementById("onchain-token")?.value || "USDT.e";

  if (typeof isConnected === "function" && isConnected() && toAddr) {
    const result = await sendOnchain(toAddr, amount, tokSym);
    if (!result) return;

    const fee = amount * FEE_RATE;
    state.transactions.unshift({
      id: "TX" + Date.now(), date: new Date().toISOString(),
      recipient, relationship, currency: tokSym,
      amount, fee,
      received: parseFloat(result.netUsd),
      receivedSymbol: result.symbol,
      purpose, note, status: "Confirmed",
      onchain: true, txHash: result.txHash, toAddress: toAddr,
    });
    saveState();

    const banner = document.getElementById("tx-link-banner");
    if (banner) {
      const base = (typeof morphExplorerBase === "function") ? morphExplorerBase() : "https://explorer.morphl2.io";
      banner.innerHTML = `Transfer confirmed on Morph L2 — <a href="${base}/tx/${result.txHash}" target="_blank" style="color:#1a6e1a;font-weight:700;text-decoration:underline">${result.txHash.slice(0,20)}…</a>`;
      banner.style.display = "block";
      setTimeout(() => { banner.style.display = "none"; }, 15000);
    }

    showToast(result.netUsd + " " + result.symbol + " confirmed onchain for " + recipient);
    document.getElementById("send-form").reset();
    document.getElementById("conversion-box").classList.add("hidden");
    document.querySelectorAll(".rc-pill").forEach(p => p.classList.remove("active"));
    showPage("transactions");
    return;
  }

  if (amount > state.balance) { showToast("Insufficient balance — top up first"); return; }

  const fee      = amount * FEE_RATE;
  const received = (amount - fee) * RATES[cur];

  state.transactions.unshift({
    id: "TX" + Date.now(), date: new Date().toISOString(),
    recipient, relationship, currency: cur,
    amount, fee, received, purpose, note, status: "Completed",
  });
  state.balance -= amount;
  saveState();
  updateHeaderBalance();

  document.getElementById("send-form").reset();
  document.getElementById("conversion-box").classList.add("hidden");
  document.querySelectorAll(".rc-pill").forEach(p => p.classList.remove("active"));

  showToast("Padala sent! " + recipient + " will receive " + fmtF(received, cur));
  showPage("transactions");
}

function renderDashboard() {
  updateRecipientBadge();
  const now  = new Date();
  const txs  = state.transactions;
  const mTxs = txs.filter(t => { const d = new Date(t.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });

  const totalSent  = txs.reduce((s, t)  => s + t.amount, 0);
  const monthSent  = mTxs.reduce((s, t) => s + t.amount, 0);
  const feesSaved  = txs.reduce((s, t)  => s + (t.amount * (BANK_FEE_RATE - FEE_RATE)), 0);
  const expTotal   = state.expenses.reduce((s, e) => s + e.amount, 0);

  document.getElementById("stat-total-sent").textContent  = fmt(totalSent);
  document.getElementById("stat-sent-count").textContent  = txs.length + " transfer" + (txs.length !== 1 ? "s" : "");
  document.getElementById("stat-month-sent").textContent  = fmt(monthSent);
  document.getElementById("stat-month-count").textContent = mTxs.length + " transfer" + (mTxs.length !== 1 ? "s" : "");
  document.getElementById("stat-fees-saved").textContent  = fmt(feesSaved);
  document.getElementById("stat-recipients").textContent  = state.recipients.length;

  const recentEl = document.getElementById("recent-transactions");
  recentEl.innerHTML = txs.length === 0
    ? `<div class="empty">No transfers yet. Send your first padala!</div>`
    : txs.slice(0, 5).map(txRowMini).join("");

  renderExpenseChart("expense-chart");
}

function txRowMini(t) {
  const receivedStr = t.onchain
    ? `${parseFloat(t.received).toFixed(2)} ${t.receivedSymbol || t.currency}`
    : fmtF(t.received, t.currency);
  const chainBadge = t.onchain
    ? `<span style="font-size:10px;font-weight:700;color:#1a6e1a;background:#f0faf0;padding:1px 6px;border-radius:4px;margin-left:4px">Morph</span>`
    : "";
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f4f4f4">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:34px;height:34px;border-radius:50%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#555">${escHtml(initials(t.recipient))}</div>
      <div>
        <div style="font-size:13px;font-weight:600;color:#111">${escHtml(t.recipient)}${chainBadge}</div>
        <div style="font-size:11px;color:#bbb">${fmtDate(t.date)} · ${escHtml(t.purpose)}</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:700;color:#111">${fmt(t.amount)}</div>
      <div style="font-size:11px;color:#888">${receivedStr}</div>
    </div>
  </div>`;
}

function renderTransactions() {
  const filter = document.getElementById("filter-status").value;
  const txs    = filter ? state.transactions.filter(t => t.status === filter) : state.transactions;
  const el     = document.getElementById("transactions-table");

  if (txs.length === 0) {
    el.innerHTML = `<div class="empty">No remittances found.</div>`;
    return;
  }

  el.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>Date</th><th>Recipient</th><th>Purpose</th>
      <th class="right">Sent</th><th class="right">Family Received</th>
      <th class="right">Fee</th><th class="right">Saved vs Bank</th><th class="center">Status</th>
    </tr></thead>
    <tbody>${txs.map(t => {
      const saved = t.amount * (BANK_FEE_RATE - FEE_RATE);
      const receivedStr = t.onchain
        ? `${parseFloat(t.received).toFixed(2)} ${t.receivedSymbol || t.currency}`
        : fmtF(t.received, t.currency);
      const explorerBase = t.chainId === 2810
        ? "https://explorer-holesky.morphl2.io"
        : "https://explorer.morphl2.io";
      const txHashCell = t.onchain && t.txHash
        ? `<div class="td-sub"><a href="${explorerBase}/tx/${escHtml(t.txHash)}" target="_blank" style="color:#1a6e1a;text-decoration:underline">${t.txHash.slice(0,12)}…</a></div>`
        : "";
      return `<tr>
        <td style="color:#aaa">${fmtDate(t.date)}</td>
        <td>
          <div class="td-bold">${escHtml(t.recipient)}</div>
          <div class="td-sub">${escHtml(t.relationship)}</div>
          ${txHashCell}
        </td>
        <td>${escHtml(t.purpose)}</td>
        <td class="right td-bold">${fmt(t.amount)}</td>
        <td class="right" style="font-weight:700;color:#2d7a2d">${receivedStr}</td>
        <td class="right" style="color:#bbb">${fmt(t.fee)}</td>
        <td class="right" style="color:#2d7a2d;font-weight:600">${fmt(saved)}</td>
        <td class="center">
          <span class="badge" style="${t.onchain ? "background:#f0faf0;color:#1a6e1a" : ""}">${t.status}</span>
          ${t.onchain ? `<div style="font-size:10px;color:#1a6e1a;margin-top:2px">Morph L2</div>` : ""}
        </td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function handleExpense(e) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById("exp-amount").value);
  const date   = document.getElementById("exp-date").value;
  if (!amount || amount < 1) { showToast("Please enter a valid amount"); return; }
  if (!date)                 { showToast("Please select a date"); return; }

  state.expenses.unshift({
    id: "EX" + Date.now(),
    category: document.getElementById("exp-category").value,
    amount, date,
    desc: document.getElementById("exp-desc").value.trim(),
  });
  saveState();
  document.getElementById("expense-form").reset();
  document.getElementById("exp-date").value = todayStr();
  showToast("Usage logged!");
  renderExpenses();
}

function renderExpenses() {
  renderExpenseSummary();
  renderExpenseList();
  renderExpenseChart("expense-chart");
}

function renderExpenseSummary() {
  const now     = new Date();
  const monthEx = state.expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const el      = document.getElementById("expense-summary");
  if (monthEx.length === 0) { el.innerHTML = `<div style="color:#6677aa;font-size:13px;padding:20px 0">Nothing logged this month</div>`; return; }

  const byCat = {};
  monthEx.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const total  = monthEx.reduce((s, e) => s + e.amount, 0);
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const barColors = ["#e8734a","#5b8dee","#44c9a2","#f0c040","#b06fe3","#66aadd"];

  el.innerHTML = `<div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#8899bb;margin-bottom:4px">Total This Month</div>
      <div style="font-size:30px;font-weight:800;color:#fff;letter-spacing:-.5px">${fmt(total)}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${sorted.map(([cat, amt], i) => {
        const pct = Math.round((amt / total) * 100);
        const color = barColors[i % barColors.length];
        return `<div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">
            <span style="color:#c8d8f0;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(cat)}</span>
            <span style="font-weight:700;color:#fff">${pct}%</span>
          </div>
          <div style="background:#2d3d60;border-radius:99px;height:6px">
            <div style="background:${color};height:6px;border-radius:99px;width:${pct}%"></div>
          </div>
        </div>`;
      }).join("")}
    </div>`;
}

function renderExpenseList() {
  const el = document.getElementById("expense-list");
  if (state.expenses.length === 0) {
    el.innerHTML = `<div class="empty">No usage logged yet.</div>`; return;
  }
  el.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>Date</th><th>Spent On</th><th>Description</th>
      <th class="right">Amount (PHP)</th><th class="center">Action</th>
    </tr></thead>
    <tbody>${state.expenses.map(e => `<tr>
      <td style="color:#aaa">${fmtDate(e.date + "T00:00:00")}</td>
      <td>${escHtml(e.category)}</td>
      <td style="color:#aaa">${escHtml(e.desc || "—")}</td>
      <td class="right td-bold">${fmt(e.amount)}</td>
      <td class="center" style="display:flex;gap:6px;justify-content:center">
        <button class="btn-edit" onclick="openEditExpense('${e.id}')">Edit</button>
        <button class="btn-danger" onclick="deleteExpense('${e.id}')">Delete</button>
      </td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function deleteExpense(id) {
  state.expenses = state.expenses.filter(e => e.id !== id);
  saveState(); renderExpenses(); showToast("Entry deleted");
}

function openEditExpense(id) {
  const e = state.expenses.find(ex => ex.id === id);
  if (!e) return;
  document.getElementById("edit-expense-id").value       = id;
  document.getElementById("edit-exp-date").value         = e.date;
  document.getElementById("edit-exp-category").value     = e.category;
  document.getElementById("edit-exp-amount").value       = e.amount;
  document.getElementById("edit-exp-desc").value         = e.desc || "";
  document.getElementById("edit-expense-modal").classList.add("open");
}

function closeEditExpense() {
  document.getElementById("edit-expense-modal").classList.remove("open");
}

function saveEditExpense() {
  const id     = document.getElementById("edit-expense-id").value;
  const amount = parseFloat(document.getElementById("edit-exp-amount").value);
  const date   = document.getElementById("edit-exp-date").value;
  if (!amount || amount < 1) { showToast("Please enter a valid amount"); return; }
  if (!date)                 { showToast("Please select a date"); return; }
  const idx = state.expenses.findIndex(e => e.id === id);
  if (idx === -1) return;
  state.expenses[idx] = {
    ...state.expenses[idx],
    date,
    category: document.getElementById("edit-exp-category").value,
    amount,
    desc: document.getElementById("edit-exp-desc").value.trim(),
  };
  saveState(); renderExpenses(); closeEditExpense(); showToast("Entry updated!");
}

function renderExpenseChart(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const byCat = {};
  state.expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (entries.length === 0) { el.innerHTML = `<div class="empty" style="padding:20px">No usage logged yet</div>`; return; }

  const max    = entries[0][1];
  const shades = ["#111","#333","#555","#777","#999","#bbb"];
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:9px">${entries.map(([cat, amt], i) => `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span style="color:#555;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(cat)}</span>
        <span style="font-weight:700;color:#111;margin-left:8px">${fmt(amt)}</span>
      </div>
      <div style="background:#efefef;border-radius:99px;height:5px">
        <div style="background:${shades[i % shades.length]};height:5px;border-radius:99px;width:${Math.round((amt/max)*100)}%"></div>
      </div>
    </div>`).join("")}</div>`;
}

let _toast;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toast);
  _toast = setTimeout(() => el.classList.remove("show"), 3500);
}

function initBackdrops() {
  ["topup-modal","recipient-modal"].forEach(id => {
    document.getElementById(id).addEventListener("click", e => {
      if (e.target.id === id) document.getElementById(id).classList.remove("open");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  updateHeaderBalance();
  updateRecipientBadge();
  document.getElementById("exp-date").value = todayStr();
  initBackdrops();
  showPage("dashboard");
});
