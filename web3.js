const MORPH_MAINNET = {
  chainId: "0xB02",
  chainName: "Morph Mainnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.morphl2.io"],
  blockExplorerUrls: ["https://explorer.morphl2.io"],
};
const MORPH_HOLESKY = {
  chainId: "0xAFA",
  chainName: "Morph Holesky Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc-holesky.morphl2.io"],
  blockExplorerUrls: ["https://explorer-holesky.morphl2.io"],
};

const STABLECOINS = {
  "USDT.e": { address: "0xc7D67A9cBB121b3b0b9c053DD9f469523243379A", decimals: 6 },
  "USDC.e": { address: "0xe34c91815d7fc18A9e2148bcD4241d0a5848b693", decimals: 6 },
};

//Minimal ERC-20 ABI
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

//Wallet State
let wallet = {
  provider: null, signer: null,
  address:  null, chainId: null,
  balances: {},             // { "USDT.e": "100.00", "USDC.e": "50.00" }
};

function isConnected() { return !!wallet.address; }
function isOnMorph()   { return wallet.chainId === 2818 || wallet.chainId === 2810; }
function isOnMainnet() { return wallet.chainId === 2818; }

function morphExplorerBase() {
  return isOnMainnet()
    ? "https://explorer.morphl2.io"
    : "https://explorer-holesky.morphl2.io";
}

//Connect Wallet
async function connectWallet() {
  if (!window.ethereum) {
    showToast("MetaMask not found — install MetaMask to enable onchain transfers.");
    return;
  }
  try {
    wallet.provider = new ethers.BrowserProvider(window.ethereum);
    await wallet.provider.send("eth_requestAccounts", []);
    wallet.signer  = await wallet.provider.getSigner();
    wallet.address = await wallet.signer.getAddress();
    const net = await wallet.provider.getNetwork();
    wallet.chainId = Number(net.chainId);

    if (!isOnMorph()) {
      showToast("Switching to Morph Mainnet…");
      await switchToMorph(false);
    } else {
      await loadBalances();
      renderWalletUI();
      renderSendOnchainSection();
    }

    window.ethereum.on("accountsChanged", async (accs) => {
      if (!accs.length) { resetWallet(); return; }
      wallet.address = accs[0];
      wallet.signer  = await wallet.provider.getSigner();
      await loadBalances();
      renderWalletUI();
      renderSendOnchainSection();
    });
    window.ethereum.on("chainChanged", () => window.location.reload());

  } catch (err) {
    if (err.code !== 4001) {
      showToast("Connection error: " + (err.shortMessage || err.message || "Unknown error"));
    }
  }
}

async function switchToMorph(testnet) {
  const cfg = testnet ? MORPH_HOLESKY : MORPH_MAINNET;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: cfg.chainId }],
    });
  } catch (e) {
    if (e.code === 4902 || e.code === -32603) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [cfg],
      });
    }
  }
  const net       = await wallet.provider.getNetwork();
  wallet.chainId  = Number(net.chainId);
  wallet.signer   = await wallet.provider.getSigner();
  await loadBalances();
  renderWalletUI();
  renderSendOnchainSection();
}

function resetWallet() {
  wallet = { provider: null, signer: null, address: null, chainId: null, balances: {} };
  renderWalletUI();
  renderSendOnchainSection();
}

//Load Token Balances
async function loadBalances() {
  wallet.balances = {};
  if (!isOnMainnet()) return;
  for (const [sym, tok] of Object.entries(STABLECOINS)) {
    try {
      const c   = new ethers.Contract(tok.address, ERC20_ABI, wallet.provider);
      const raw = await c.balanceOf(wallet.address);
      wallet.balances[sym] = ethers.formatUnits(raw, tok.decimals);
    } catch { wallet.balances[sym] = "0.00"; }
  }
}

// phpAmount: PHP value the OFW wants to send
// tokenSym:  "USDT.e" or "USDC.e"
// toAddress: recipient 0x wallet on Morph
async function sendOnchain(toAddress, phpAmount, tokenSym) {
  if (!isConnected())             { showToast("Connect your wallet first"); return null; }
  if (!isOnMainnet())             { showToast("Switch to Morph Mainnet to send stablecoins"); return null; }
  if (!ethers.isAddress(toAddress)) { showToast("Invalid recipient wallet address"); return null; }

  const tok    = STABLECOINS[tokenSym];
  const usdAmt = phpAmount * RATES.USD;          // PHP → USD ≈ USDT
  const feeAmt = usdAmt * 0.02;                 // 2% OFW Padala fee
  const netAmt = usdAmt - feeAmt;
  const rawAmt = ethers.parseUnits(netAmt.toFixed(tok.decimals), tok.decimals);

  try {
    const contract = new ethers.Contract(tok.address, ERC20_ABI, wallet.signer);
    showToast("Please confirm the transaction in MetaMask…");
    const tx = await contract.transfer(toAddress, rawAmt);
    showToast("Transaction submitted — awaiting confirmation…");
    const receipt = await tx.wait(1);       // wait for 1 confirmation
    await loadBalances();
    renderWalletUI();
    return {
      txHash:    receipt.hash,
      netUsd:    netAmt.toFixed(2),
      grossUsd:  usdAmt.toFixed(2),
      feeUsd:    feeAmt.toFixed(2),
      symbol:    tokenSym,
    };
  } catch (err) {
    const msg = err?.info?.error?.message || err?.reason || err?.message || "Transaction rejected";
    showToast("Transfer failed: " + msg);
    return null;
  }
}

function renderWalletUI() {
  const btn  = document.getElementById("wallet-connect-btn");
  const area = document.getElementById("wallet-area");
  if (!btn || !area) return;

  if (!isConnected()) {
    btn.style.display  = "inline-block";
    area.style.display = "none";
    return;
  }

  btn.style.display  = "none";
  area.style.display = "flex";

  const netLabel = wallet.chainId === 2818 ? "Morph Mainnet"
                 : wallet.chainId === 2810 ? "Morph Holesky"
                 : "Unknown Network";
  const netColor = wallet.chainId === 2818 ? "#1a6e1a"
                 : wallet.chainId === 2810 ? "#8a6200"
                 : "#cc2222";
  const short = wallet.address.slice(0, 6) + "…" + wallet.address.slice(-4);

  let balHtml = "";
  for (const [sym, bal] of Object.entries(wallet.balances)) {
    const num = isNaN(Number(bal)) ? bal : parseFloat(bal).toFixed(2);
    balHtml += `<span class="wallet-bal">${num} ${sym}</span>`;
  }
  if (!Object.keys(wallet.balances).length) {
    balHtml = `<span class="wallet-bal" style="color:#aaa">No stablecoins on testnet</span>`;
  }

  area.innerHTML = `
    <span class="net-pill" style="color:${netColor};background:${netColor}18;border-color:${netColor}33">${netLabel}</span>
    <span class="wallet-addr">${short}</span>
    ${balHtml}
    <button class="btn-danger" style="padding:4px 10px;font-size:11px" onclick="resetWallet()">Disconnect</button>`;
}

function renderSendOnchainSection() {
  const section = document.getElementById("onchain-section");
  if (!section) return;
  section.classList.toggle("hidden", !isConnected());
  if (isConnected()) updateOnchainPreview();
}

function updateOnchainPreview() {
  const preview = document.getElementById("onchain-amount-preview");
  if (!preview) return;
  const sym    = document.getElementById("onchain-token")?.value || "USDT.e";
  const phpAmt = parseFloat(document.getElementById("send-amount")?.value || 0);
  if (!phpAmt || !isConnected()) { preview.innerHTML = ""; return; }

  const usdAmt  = phpAmt * RATES.USD;
  const feeUsd  = usdAmt * 0.02;
  const netUsd  = usdAmt - feeUsd;
  const bal     = parseFloat(wallet.balances[sym] || 0);
  const short   = netUsd.toFixed(2);
  const enough  = bal >= usdAmt;

  const bridgeLink = `<a href="https://bridge.morphl2.io" target="_blank" rel="noopener noreferrer" style="color:#1a6e1a;text-decoration:underline;font-weight:600">Bridge USDT to Morph ↗</a>`;
  preview.innerHTML = `
    <span>You send: <strong>${short} ${sym}</strong> onchain via Morph L2</span>
    ${!enough ? `<span style="color:#cc2222;margin-left:6px">(only ${bal.toFixed(2)} ${sym} available — ${bridgeLink})</span>` : ""}`;
}
