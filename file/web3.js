// 1. The Addresses you just deployed
const padalaAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const tokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// 2. The ABIs (Application Binary Interfaces) matching your exact contracts
const padalaABI = [
    "function sendPadala(bytes32 _txId, address _recipient, uint256 _amount, address _token) external",
    "function claimPadala(bytes32 _txId) external",
    "function remittances(bytes32) external view returns (address sender, address recipient, uint256 amount, address token, bool isCompleted)"
];

const tokenABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)"
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

async function switchToMorph() {
  // 1. Define your local Hardhat network blueprint
  const HARDHAT_LOCAL = {
    chainId: "0x7a69", // 31337 in hexadecimal
    chainName: "Hardhat Local Override",
    rpcUrls: ["http://127.0.0.1:8545"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }
  };

  try {
    // 2. Ask MetaMask to switch to the Hardhat network
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HARDHAT_LOCAL.chainId }],
    });
  } catch (e) {
    // 3. If MetaMask doesn't have the network, add it automatically
    if (e.code === 4902 || e.code === -32603) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [HARDHAT_LOCAL],
      });
    }
  }

  // 4. Finish setting up the wallet state for your UI
  const net = await wallet.provider.getNetwork();
  wallet.chainId = Number(net.chainId);
  wallet.signer = await wallet.provider.getSigner();
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
  try {
    // Connect to the MockToken using the variables we defined at the top of the file
    const contract = new ethers.Contract(tokenAddress, tokenABI, wallet.provider);
    const raw = await contract.balanceOf(wallet.address);
    
    // Our MockToken uses 6 decimals, so we format it accordingly
    wallet.balances["USDT"] = ethers.formatUnits(raw, 6);
  } catch (err) {
    console.error("Error fetching balance:", err);
    wallet.balances["USDT.e"] = "0.00";
  }
}

// phpAmount: PHP value the OFW wants to send
// tokenSym:  "USDT.e" or "USDC.e"
// toAddress: recipient 0x wallet on Morph
async function sendOnchain(toAddress, phpAmount, tokenSym) {
  if (!isConnected())             { showToast("Connect your wallet first"); return null; }
  if (!ethers.isAddress(toAddress)) { showToast("Invalid recipient wallet address"); return null; }

  const usdAmt = phpAmount * RATES.USD;          // PHP → USD ≈ USDT
  const feeAmt = usdAmt * 0.02;                 // 2% OFW Padala fee
  const netAmt = usdAmt - feeAmt;
  
  // Our local Fake USDT uses exactly 6 decimals
  const rawAmt = ethers.parseUnits(netAmt.toFixed(6), 6);

  try {
    // 1. Connect to both of our local contracts
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet.signer);
    const padalaContract = new ethers.Contract(padalaAddress, padalaABI, wallet.signer);

    // 2. STEP ONE: Approve the OFWPadala contract to handle your USDT
    showToast("Step 1: Please approve the token allowance in MetaMask...");
    const approveTx = await tokenContract.approve(padalaAddress, rawAmt);
    await approveTx.wait(1);

    // 3. STEP TWO: Execute the actual Padala smart contract
    showToast("Step 2: Please confirm the Padala transaction in MetaMask...");
    
    // Generate a unique ID for this remittance record
    const txId = ethers.id(Date.now().toString()); 
    
    // Execute the function we wrote in your OFWPadala.sol file!
    const tx = await padalaContract.sendPadala(txId, toAddress, rawAmt, tokenAddress);
    
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

  // Added Hardhat Local (31337) to the UI labels!
  const netLabel = wallet.chainId === 2818 ? "Morph Mainnet"
                 : wallet.chainId === 2810 ? "Morph Holesky"
                 : wallet.chainId === 31337 ? "Hardhat Local"
                 : "Unknown Network";
                 
  const netColor = wallet.chainId === 2818 ? "#1a6e1a"
                 : wallet.chainId === 2810 ? "#8a6200"
                 : wallet.chainId === 31337 ? "#0066cc" // Blue for local dev
                 : "#cc2222";
                 
  const short = wallet.address.slice(0, 6) + "…" + wallet.address.slice(-4);

  let balHtml = "";
  for (const [sym, bal] of Object.entries(wallet.balances)) {
    const num = isNaN(Number(bal)) ? bal : parseFloat(bal).toFixed(2);
    balHtml += `<span class="wallet-bal">${num} ${sym}</span>`;
  }
  
  if (!Object.keys(wallet.balances).length) {
    balHtml = `<span class="wallet-bal" style="color:#aaa">No stablecoins</span>`;
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
