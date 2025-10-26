// src/MintPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers"; // v5.7.x

// ===== CONFIG (BSC + USDT + 8004) =====
const CHAIN_ID = 56; // BNB Smart Chain
const CONTRACT_ADDRESS = "<TU_NUEVO_CONTRATO>"; // reemplaza con la dirección real del contrato
const PAYMENT_TOKEN_ADDRESS = "0x55d398326f99059fF775485246999027B3197955"; // USDT (BSC, 18 dec)

const TOKEN_SYMBOL = "8004";
const TOKENS_PER_USDT = 8004; // 1 USDT → 8,004 8004

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
  const [payTokenDecimals, setPayTokenDecimals] = useState(null);

  const explorerBase = useMemo(() => "https://bscscan.com/tx/", []);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;
    setProvider(new ethers.providers.Web3Provider(eth));
  }, []);

  async function connect() {
    if (!provider) {
      setStatus("Please install MetaMask.");
      return;
    }
    try {
      await provider.send("eth_requestAccounts", []);
      const _signer = provider.getSigner();
      setSigner(_signer);
      const addr = await _signer.getAddress();
      setAccount(addr);
      const net = await provider.getNetwork();
      const ok = net.chainId === CHAIN_ID;
      setNetworkOk(ok);
      setStatus(ok ? "" : "Wrong network. Please switch to BNB Smart Chain.");
      if (ok) await refreshInfo(_signer);
    } catch (e) {
      setStatus(e?.message || "Wallet connection failed.");
    }
  }

  async function switchNetwork() {
    const eth = window.ethereum;
    if (!eth) return;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ethers.utils.hexValue(CHAIN_ID) }],
      });
      setNetworkOk(true);
      setStatus("");
      if (signer) await refreshInfo(signer);
    } catch (e) {
      setStatus(e?.message || "Network switch failed.");
    }
  }

  async function refreshInfo(_signer) {
    try {
      const user = await _signer.getAddress();
      const pay = new ethers.Contract(PAYMENT_TOKEN_ADDRESS, ERC20_ABI, _signer);
      const dec = await pay.decimals();
      setPayTokenDecimals(dec);
      const bal = await pay.balanceOf(user);

      const token = new ethers.Contract(CONTRACT_ADDRESS, MINTABLE_ABI, _signer);
      const minted = await token.publicMinted();
      const cap = await token.PUBLIC_MINT_CAP();
      const total = await token.totalSupply();
      const max = await token.MAX_SUPPLY();

      setBalances({ pay: ethers.utils.formatUnits(bal, dec) });
      setCapInfo({
        minted: ethers.utils.formatUnits(minted, 18),
        cap: ethers.utils.formatUnits(cap, 18),
        total: ethers.utils.formatUnits(total, 18),
        max: ethers.utils.formatUnits(max, 18),
      });
    } catch {
      /* silent */
    }
  }

  async function handleMint() {
    if (!signer) {
      setStatus("Connect your wallet first.");
      return;
    }
    setLoading(true);
    setStatus("");
    setTxApprove("");
    setTxMint("");

    try {
      const user = await signer.getAddress();
      const pay = new ethers.Contract(PAYMENT_TOKEN_ADDRESS, ERC20_ABI, signer);

      let dec = payTokenDecimals;
      if (dec == null) {
        dec = await pay.decimals();
        setPayTokenDecimals(dec);
      }
      const oneUnit = ethers.utils.parseUnits("1", dec);

      const allowance = await pay.allowance(user, CONTRACT_ADDRESS);
      if (allowance.lt(oneUnit)) {
        setStatus("Approving unlimited USDT (one-time approval)...");
        const tx = await pay.approve(CONTRACT_ADDRESS, ethers.constants.MaxUint256);
        setTxApprove(tx.hash);
        await tx.wait();
      }

      setStatus("Minting...");
      const token = new ethers.Contract(CONTRACT_ADDRESS, MINTABLE_ABI, signer);
      const tx = await token.mint();
      setTxMint(tx.hash);
      await tx.wait();

      setStatus("✅ Mint successful.");
      await refreshInfo(signer);
    } catch (e) {
      setStatus(e?.message || "Mint failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-white text-neutral-900 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl relative">
        <div className="relative p-[2px] rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 animate-gradient">
          <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10 space-y-8">
            <header className="flex items-center justify-between">
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Mint {TOKEN_SYMBOL}</h1>
              {account ? (
                <button
                  onClick={networkOk ? undefined : switchNetwork}
                  className={`px-4 py-2 rounded-xl text-sm border ${
                    networkOk ? "border-emerald-600 text-emerald-700" : "border-amber-600 text-amber-700"
                  }`}
                  title={account}
                >
                  {networkOk ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Switch network"}
                </button>
              ) : (
                <button
                  onClick={connect}
                  className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90 transition border border-black/10"
                >
                  Connect wallet
                </button>
              )}
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
                <div className="text-sm text-neutral-500">Price</div>
                <div className="text-2xl mt-1">
                  1 USDT → ${TOKENS_PER_USDT.toLocaleString()}
                </div>
              </div>
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
                <div className="text-sm text-neutral-500">Your USDT</div>
                <div className="text-2xl mt-1">
                  {balances ? Number(balances.pay).toLocaleString() : "-"}
                </div>
              </div>
            </div>

            {capInfo && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
                <div className="text-sm text-neutral-500">Public mint progress</div>
                <div className="mt-2 text-base">
                  Minted: {Number(capInfo.minted).toLocaleString()} /{" "}
                  {Number(capInfo.cap).toLocaleString()} {TOKEN_SYMBOL}
                </div>
                <div className="mt-1 text-base">
                  Total supply: {Number(capInfo.total).toLocaleString()} /{" "}
                  {Number(capInfo.max).toLocaleString()} {TOKEN_SYMBOL}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleMint}
                disabled={!account || !networkOk || loading}
                className="w-full py-4 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-lg"
              >
                {loading ? "Processing..." : `MINT ${TOKEN_SYMBOL}`}
              </button>

              {status && <p className="text-sm text-neutral-700">{status}</p>}

              <div className="text-xs text-neutral-500 space-y-1">
                {txApprove && (
                  <div>
                    Approve tx:{" "}
                    <a className="underline" href={`${explorerBase}${txApprove}`} target="_blank" rel="noreferrer">
                      {txApprove.slice(0, 10)}...
                    </a>
                  </div>
                )}
                {txMint && (
                  <div>
                    Mint tx:{" "}
                    <a className="underline" href={`${explorerBase}${txMint}`} target="_blank" rel="noreferrer">
                      {txMint.slice(0, 10)}...
                    </a>
                  </div>
                )}
              </div>
            </div>

            <footer className="text-xs text-neutral-500 text-center space-y-3 mt-4">
              <p>Make sure you hold 1 USDT on BNB Smart Chain. This site never holds your keys.</p>

              <div className="flex justify-center gap-6 mt-2">
                <a
                  href="https://x.com/8004BSC"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:opacity-80 transition"
                  title="Follow us on X"
                >
                  <img src="/x.png" alt="X" className="w-6 h-6 object-contain" />
                </a>

                <a
                  href={`https://bscscan.com/token/${CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:opacity-80 transition"
                  title="View on BscScan"
                >
                  <img src="/bscscan.png" alt="BscScan" className="w-6 h-6 object-contain" />
                </a>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
