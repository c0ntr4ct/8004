// src/MintPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers"; // v5.7.x

// ===== CONFIGURE THESE =====
const CHAIN_ID = 1; // 1 = Ethereum mainnet, 11155111 = Sepolia, etc.
const CONTRACT_ADDRESS = "0xYOUR_MINTABLE_TOKEN_ADDRESS"; // <-- your MintableToken address
const PAYMENT_TOKEN_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT (mainnet)
// If you deploy on another network, change PAYMENT_TOKEN_ADDRESS accordingly.

const USDT_DECIMALS = 6;
const TOKEN_SYMBOL = "PONG";
const TOKENS_PER_USDT = 5000; // 1 USDT -> 5,000 PONG (must match on-chain MINT_RATIO)

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

const MINTABLE_ABI = [
  "function mint() external",
  "function treasury() view returns (address)",
  "function publicMinted() view returns (uint256)",
  "function PUBLIC_MINT_CAP() view returns (uint256)",
  "function MAX_SUPPLY() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

export default function MintPage() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [networkOk, setNetworkOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [txApprove, setTxApprove] = useState("");
  const [txMint, setTxMint] = useState("");
  const [capInfo, setCapInfo] = useState(null);
  const [balances, setBalances] = useState(null);

  const explorerBase = useMemo(() => {
    if (CHAIN_ID === 1) return "https://etherscan.io/tx/";
    if (CHAIN_ID === 11155111) return "https://sepolia.etherscan.io/tx/";
    return "https://etherscan.io/tx/";
  }, []);

  const usdtAmount = useMemo(() => ethers.utils.parseUnits("1", USDT_DECIMALS), []);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;
    setProvider(new ethers.providers.Web3Provider(eth));
  }, []);

  async function connect() {
    if (!provider) { setStatus("Please install MetaMask."); return; }
    try {
      await provider.send("eth_requestAccounts", []);
      const _signer = provider.getSigner();
      setSigner(_signer);
      const addr = await _signer.getAddress();
      setAccount(addr);
      const net = await provider.getNetwork();
      setNetworkOk(net.chainId === CHAIN_ID);
      setStatus(net.chainId === CHAIN_ID ? "" : `Wrong network. Please switch to chainId ${CHAIN_ID}.`);
      if (net.chainId === CHAIN_ID) await refreshInfo(_signer);
    } catch (e) { setStatus(e?.message || "Wallet connection failed."); }
  }

  async function switchNetwork() {
    const eth = window.ethereum;
    if (!eth) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ethers.utils.hexValue(CHAIN_ID) }] });
      setNetworkOk(true);
      setStatus("");
      if (signer) await refreshInfo(signer);
    } catch (e) { setStatus(e?.message || "Network switch failed."); }
  }

  async function refreshInfo(_signer) {
    try {
      const user = await _signer.getAddress();
      const usdt = new ethers.Contract(PAYMENT_TOKEN_ADDRESS, ERC20_ABI, _signer);
      const dec = await usdt.decimals();
      const bal = await usdt.balanceOf(user);

      const token = new ethers.Contract(CONTRACT_ADDRESS, MINTABLE_ABI, _signer);
      const minted = await token.publicMinted();
      const cap = await token.PUBLIC_MINT_CAP();
      const total = await token.totalSupply();
      const max = await token.MAX_SUPPLY();

      setBalances({ usdt: ethers.utils.formatUnits(bal, dec) });
      setCapInfo({
        minted: ethers.utils.formatUnits(minted, 18),
        cap: ethers.utils.formatUnits(cap, 18),
        total: ethers.utils.formatUnits(total, 18),
        max: ethers.utils.formatUnits(max, 18),
      });
    } catch {}
  }

  async function handleMint() {
    if (!signer) { setStatus("Connect your wallet first."); return; }
    setLoading(true);
    setStatus("");
    setTxApprove("");
    setTxMint("");

    try {
      const user = await signer.getAddress();
      const usdt = new ethers.Contract(PAYMENT_TOKEN_ADDRESS, ERC20_ABI, signer);
      const allowance = await usdt.allowance(user, CONTRACT_ADDRESS);

      if (allowance.lt(usdtAmount)) {
        setStatus("Approving 1 USDT...");
        const tx = await usdt.approve(CONTRACT_ADDRESS, usdtAmount);
        setTxApprove(tx.hash);
        await tx.wait();
      }

      setStatus("Minting...");
      const token = new ethers.Contract(CONTRACT_ADDRESS, MINTABLE_ABI, signer);
      const tx = await token.mint();
      setTxMint(tx.hash);
      await tx.wait();

      setStatus("Mint successful.");
      await refreshInfo(signer);
    } catch (e) {
      setStatus(e?.message || "Mint failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl shadow-xl p-6 space-y-6">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Mint PONG</h1>
            {account ? (
              <button
                onClick={networkOk ? undefined : switchNetwork}
                className={`px-4 py-2 rounded-xl text-sm border ${networkOk ? "border-emerald-600" : "border-amber-600"}`}
                title={account}
              >
                {networkOk ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Switch network"}
              </button>
            ) : (
              <button onClick={connect} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition border border-white/20">
                Connect wallet
              </button>
            )}
          </header>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="bg-black/20 border border-neutral-800 rounded-xl p-4">
              <div className="text-sm text-neutral-400">Price</div>
              <div className="text-xl mt-1">1 USDT → {TOKENS_PER_USDT.toLocaleString()} {TOKEN_SYMBOL}</div>
            </div>
            <div className="bg-black/20 border border-neutral-800 rounded-xl p-4">
              <div className="text-sm text-neutral-400">Your USDT</div>
              <div className="text-xl mt-1">{balances ? Number(balances.usdt).toLocaleString() : "-"}</div>
            </div>
          </div>

          {capInfo && (
            <div className="bg-black/20 border border-neutral-800 rounded-xl p-4">
              <div className="text-sm text-neutral-400">Public mint progress</div>
              <div className="mt-1 text-sm">
                Minted: {Number(capInfo.minted).toLocaleString()} / {Number(capInfo.cap).toLocaleString()} {TOKEN_SYMBOL}
              </div>
              <div className="mt-1 text-sm">
                Total supply: {Number(capInfo.total).toLocaleString()} / {Number(capInfo.max).toLocaleString()} {TOKEN_SYMBOL}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={handleMint}
              disabled={!account || !networkOk || loading}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Processing..." : `Mint ${TOKENS_PER_USDT.toLocaleString()} ${TOKEN_SYMBOL} for 1 USDT`}
            </button>

            {status && <p className="text-sm text-neutral-300">{status}</p>}

            <div className="text-xs text-neutral-400 space-y-1">
              {txApprove && (
                <div>
                  Approve tx: <a className="underline" href={`${explorerBase}${txApprove}`} target="_blank" rel="noreferrer">{txApprove.slice(0, 10)}...</a>
                </div>
              )}
              {txMint && (
                <div>
                  Mint tx: <a className="underline" href={`${explorerBase}${txMint}`} target="_blank" rel="noreferrer">{txMint.slice(0, 10)}...</a>
                </div>
              )}
            </div>
          </div>

          <footer className="text-xs text-neutral-500">
            Make sure you hold 1 USDT on the selected network. This site never holds your keys.
          </footer>
        </div>
      </div>
    </div>
  );
}
