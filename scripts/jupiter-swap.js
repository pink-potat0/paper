(function (global) {
  var SOL_MINT = 'So11111111111111111111111111111111111111112';
  var JUPITER_QUOTE_URL = 'https://lite-api.jup.ag/swap/v1/quote';
  var JUPITER_SWAP_URL = 'https://lite-api.jup.ag/swap/v1/swap';
  var web3Promise = null;
  var SOLANA_RPC_ENDPOINTS = [
    'https://api.mainnet-beta.solana.com',
    'https://rpc.ankr.com/solana',
    'https://solana.public-rpc.com',
  ];

  var KNOWN_DECIMALS = {
    So11111111111111111111111111111111111111112: 9,
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 6,
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 6,
    DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 5,
    EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: 6,
    JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 6,
  };

  function getWeb3() {
    if (!web3Promise) {
      web3Promise = import('https://esm.sh/@solana/web3.js@1.95.4');
    }
    return web3Promise;
  }

  function solToLamports(sol) {
    var n = Number(sol);
    if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a valid SOL amount');
    return Math.floor(n * 1e9);
  }

  function lamportsToSol(lamports) {
    return (Number(lamports) || 0) / 1e9;
  }

  function formatJupiterError(data) {
    if (!data || typeof data !== 'object') return 'Could not fetch swap quote';
    if (data.errorCode === 'TOKEN_NOT_TRADABLE') {
      return 'This token is not tradable on Jupiter yet — it may still be on the pump.fun bonding curve or have no liquidity.';
    }
    if (typeof data.error === 'string') return data.error;
    if (typeof data.message === 'string') return data.message;
    return 'Could not fetch swap quote';
  }

  function normalizeQuote(data, inputMint, outputMint, slippageBps) {
    if (!data || data.error || !data.outAmount) {
      throw new Error(formatJupiterError(data));
    }
    var outDec = KNOWN_DECIMALS[data.outputMint] || 9;
    return {
      success: true,
      inputMint: inputMint,
      outputMint: outputMint,
      inputAmount: data.inAmount,
      outputAmount: data.outAmount,
      outputAmountFormatted: (parseInt(data.outAmount, 10) / Math.pow(10, outDec)).toFixed(6),
      priceImpact: data.priceImpactPct != null
        ? parseFloat(data.priceImpactPct).toFixed(2) + '%'
        : 'N/A',
      route: data.routePlan || [],
      slippage: (Number(slippageBps || 100) / 100) + '%',
      fees: '~0.000005 SOL (network fee)',
      quoteResponse: data,
    };
  }

  async function fetchQuoteFromJupiter(inputMint, outputMint, amountLamports, slippageBps) {
    var params = new URLSearchParams({
      inputMint: inputMint,
      outputMint: outputMint,
      amount: String(amountLamports),
      slippageBps: String(slippageBps || 100),
      swapMode: 'ExactIn',
    });
    var res = await fetch(JUPITER_QUOTE_URL + '?' + params.toString());
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.error || !data.outAmount) {
      throw new Error(formatJupiterError(data));
    }
    return normalizeQuote(data, inputMint, outputMint, slippageBps);
  }

  async function fetchQuoteViaServer(inputMint, outputMint, amountLamports, slippageBps) {
    var res = await fetch('/api/jupiter/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputMint: inputMint,
        outputMint: outputMint,
        amount: String(amountLamports),
        slippageBps: slippageBps || 100,
      }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Could not fetch swap quote');
    }
    return data;
  }

  async function fetchQuote(inputMint, outputMint, amountLamports, slippageBps) {
    try {
      return await fetchQuoteFromJupiter(inputMint, outputMint, amountLamports, slippageBps);
    } catch (directErr) {
      try {
        return await fetchQuoteViaServer(inputMint, outputMint, amountLamports, slippageBps);
      } catch (_) {
        throw directErr;
      }
    }
  }

  async function buildSwapFromJupiter(quoteResponse, userPublicKey) {
    var res = await fetch(JUPITER_SWAP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quoteResponse,
        userPublicKey: userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.error || !data.swapTransaction) {
      throw new Error(formatJupiterError(data) || 'Could not build swap transaction');
    }
    return {
      success: true,
      swapTransaction: data.swapTransaction,
      lastValidBlockHeight: data.lastValidBlockHeight,
    };
  }

  async function buildSwapViaServer(quoteResponse, userPublicKey) {
    var res = await fetch('/api/jupiter/swap-tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quoteResponse,
        userPublicKey: userPublicKey,
      }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Could not build swap transaction');
    }
    return data;
  }

  async function buildSwapTransaction(quoteResponse, userPublicKey) {
    try {
      return await buildSwapFromJupiter(quoteResponse, userPublicKey);
    } catch (directErr) {
      try {
        return await buildSwapViaServer(quoteResponse, userPublicKey);
      } catch (_) {
        throw directErr;
      }
    }
  }

  function base64ToUint8Array(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function solanaRpcCall(method, params) {
    var lastErr = null;
    for (var i = 0; i < SOLANA_RPC_ENDPOINTS.length; i++) {
      try {
        var res = await fetch(SOLANA_RPC_ENDPOINTS[i], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'paper-swap-recover',
            method: method,
            params: params,
          }),
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || data.error) {
          lastErr = new Error((data.error && data.error.message) || 'RPC failed');
          continue;
        }
        return data.result;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('RPC failed');
  }

  async function getRawWalletBalance(wallet, mint) {
    if (!wallet || !mint) return '0';
    if (mint === SOL_MINT) {
      var bal = await solanaRpcCall('getBalance', [wallet, { commitment: 'confirmed' }]);
      return String(Number((bal && bal.value) || bal || 0));
    }

    var accounts = await solanaRpcCall('getTokenAccountsByOwner', [
      wallet,
      { mint: mint },
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]);
    var values = Array.isArray(accounts && accounts.value) ? accounts.value : [];
    var total = 0n;
    values.forEach(function (account) {
      var amount = account &&
        account.account &&
        account.account.data &&
        account.account.data.parsed &&
        account.account.data.parsed.info &&
        account.account.data.parsed.info.tokenAmount &&
        account.account.data.parsed.info.tokenAmount.amount;
      if (amount) total += BigInt(String(amount));
    });
    return total.toString();
  }

  async function getLatestWalletSignature(wallet) {
    try {
      var signatures = await solanaRpcCall('getSignaturesForAddress', [
        wallet,
        { limit: 1, commitment: 'confirmed' },
      ]);
      if (Array.isArray(signatures) && signatures[0] && signatures[0].signature) {
        return signatures[0].signature;
      }
    } catch (_) {}
    return '';
  }

  async function captureSwapBalances(wallet, quotePayload) {
    try {
      return {
        input: await getRawWalletBalance(wallet, quotePayload.inputMint),
        output: await getRawWalletBalance(wallet, quotePayload.outputMint),
      };
    } catch (_) {
      return null;
    }
  }

  async function recoverSubmittedSwap(wallet, quotePayload, before) {
    if (!before) return null;
    for (var i = 0; i < 8; i++) {
      await sleep(i === 0 ? 900 : 1200);
      var after = await captureSwapBalances(wallet, quotePayload);
      if (!after) continue;
      if (after.input !== before.input || after.output !== before.output) {
        var signature = await getLatestWalletSignature(wallet);
        if (signature) {
          return {
            signature: signature,
            explorerUrl: 'https://solscan.io/tx/' + signature,
            recovered: true,
          };
        }
        return {
          signature: '',
          explorerUrl: 'https://solscan.io/account/' + wallet,
          recovered: true,
        };
      }
    }
    return null;
  }

  async function executeSwap(quotePayload) {
    if (!global.WalletAuth || !global.WalletAuth.isConnected()) {
      throw new Error('Connect your wallet first');
    }
    var session = global.WalletAuth.getSession();
    if (!session || !session.pubkey) throw new Error('Wallet session missing');

    var quoteResponse = quotePayload.quoteResponse;
    if (!quoteResponse) throw new Error('Missing quote data');

    var swapData = await buildSwapTransaction(quoteResponse, session.pubkey);
    var txBytes = base64ToUint8Array(swapData.swapTransaction);
    var web3 = await getWeb3();
    var tx = web3.VersionedTransaction.deserialize(txBytes);

    var beforeBalances = await captureSwapBalances(session.pubkey, quotePayload);
    try {
      var signature = await global.WalletAuth.signAndSendTransaction(tx);
      return {
        signature: signature,
        explorerUrl: 'https://solscan.io/tx/' + signature,
      };
    } catch (err) {
      var recovered = await recoverSubmittedSwap(session.pubkey, quotePayload, beforeBalances);
      if (recovered) return recovered;
      throw err;
    }
  }

  async function resolveMintFromTicker(ticker) {
    var sym = String(ticker || '').trim().toUpperCase().replace(/^\$/, '');
    if (!sym) return '';
    var known = {
      SOL: SOL_MINT,
      USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
      JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    };
    if (known[sym]) return known[sym];

    try {
      var res = await fetch('https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(sym));
      if (!res.ok) return '';
      var data = await res.json();
      var pairs = Array.isArray(data.pairs) ? data.pairs : [];
      var exactPairs = pairs.filter(function (p) {
        return p.chainId === 'solana' &&
          (String(p.baseToken && p.baseToken.symbol || '').toUpperCase() === sym ||
           String(p.quoteToken && p.quoteToken.symbol || '').toUpperCase() === sym);
      });
      exactPairs.sort(function (a, b) {
        return Number((b.liquidity && b.liquidity.usd) || 0) - Number((a.liquidity && a.liquidity.usd) || 0);
      });
      var solPair = exactPairs[0];
      if (!solPair) return '';
      var base = solPair.baseToken || {};
      var quote = solPair.quoteToken || {};
      if (String(base.symbol || '').toUpperCase() === sym) return base.address || '';
      if (String(quote.symbol || '').toUpperCase() === sym) return quote.address || '';
    } catch (_) {}
    return '';
  }

  global.JupiterSwap = {
    SOL_MINT: SOL_MINT,
    solToLamports: solToLamports,
    lamportsToSol: lamportsToSol,
    fetchQuote: fetchQuote,
    buildSwapTransaction: buildSwapTransaction,
    executeSwap: executeSwap,
    resolveMintFromTicker: resolveMintFromTicker,
  };
})(window);
