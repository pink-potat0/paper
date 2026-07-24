(function (global) {
    var SESSION_KEY = 'paper.wallet.session';
    var RECENT_KEY = 'paper.wallet.recent';
    var PNL_HANDLE_KEY = 'paper.pnlHandle';
    var PNL_HANDLE_MAX = 10;
    var standardWallets = [];
    var registryReady = false;
    var web3Promise = null;

    var WALLET_DEFS = [
        { id: 'jupiter', name: 'Jupiter', installUrl: 'https://chromewebstore.google.com/detail/jupiter-wallet/iledlaeogohbilgbfhmbgkgmpplbfboh', match: /jupiter/i },
        { id: 'phantom', name: 'Phantom', installUrl: 'https://phantom.app/download', match: /phantom/i },
        { id: 'trust', name: 'Trust', installUrl: 'https://trustwallet.com/download', match: /trust/i },
        { id: 'metamask', name: 'MetaMask', installUrl: 'https://metamask.io/download/', match: /metamask/i },
        { id: 'solflare', name: 'Solflare', installUrl: 'https://solflare.com/download', match: /solflare/i }
    ];

    function initWalletStandardRegistry() {
        if (registryReady || typeof window === 'undefined') return;
        registryReady = true;

        function registerWallet(wallet) {
            if (!wallet || standardWallets.indexOf(wallet) !== -1) return;
            standardWallets.push(wallet);
            global.dispatchEvent(new CustomEvent('paper:wallets-updated'));
        }

        try {
            window.addEventListener('wallet-standard:register-wallet', function (event) {
                if (typeof event.detail === 'function') {
                    event.detail({ register: registerWallet });
                }
            });
        } catch (_) {}

        try {
            window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', {
                detail: { register: registerWallet }
            }));
        } catch (_) {}

        // Some extensions register late
        setTimeout(function () { global.dispatchEvent(new CustomEvent('paper:wallets-updated')); }, 400);
        setTimeout(function () { global.dispatchEvent(new CustomEvent('paper:wallets-updated')); }, 1200);
    }

    initWalletStandardRegistry();

    var standardLibPromise = null;
    function loadStandardWalletsFromLib() {
        if (standardLibPromise) return standardLibPromise;
        standardLibPromise = import('https://esm.sh/@wallet-standard/app@1.1.0')
            .then(function (mod) {
                var api = mod.getWallets();
                var found = api.get();
                found.forEach(function (w) {
                    if (w && standardWallets.indexOf(w) === -1) {
                        standardWallets.push(w);
                    }
                });
                api.on('register', function () {
                    api.get().forEach(function (w) {
                        if (w && standardWallets.indexOf(w) === -1) {
                            standardWallets.push(w);
                            global.dispatchEvent(new CustomEvent('paper:wallets-updated'));
                        }
                    });
                });
                global.dispatchEvent(new CustomEvent('paper:wallets-updated'));
                return found;
            })
            .catch(function () { return []; });
        return standardLibPromise;
    }

    function getLegacyProviders() {
        var list = [];
        var sol = global.solana;

        if (global.phantom?.solana) {
            list.push({ id: 'phantom', name: 'Phantom', provider: global.phantom.solana, kind: 'legacy' });
        }
        if (global.solflare?.isSolflare) {
            list.push({ id: 'solflare', name: 'Solflare', provider: global.solflare, kind: 'legacy' });
        }
        if (global.trustwallet?.solana) {
            list.push({ id: 'trust', name: 'Trust', provider: global.trustwallet.solana, kind: 'legacy' });
        }
        if (sol?.isMetaMask) {
            list.push({ id: 'metamask', name: 'MetaMask', provider: sol, kind: 'legacy' });
        }
        if (sol?.isJupiter || sol?.isJupiterWallet || global.jupiter?.solana || global.Jupiter?.solana) {
            list.push({
                id: 'jupiter',
                name: 'Jupiter',
                provider: global.jupiter?.solana || global.Jupiter?.solana || sol,
                kind: 'legacy'
            });
        }
        if (sol && !sol.isPhantom && !sol.isSolflare && !sol.isMetaMask && !sol.isJupiter && !sol.isJupiterWallet) {
            var label = String(sol.walletName || sol.name || '').toLowerCase();
            if (label.indexOf('jupiter') !== -1) {
                list.push({ id: 'jupiter', name: 'Jupiter', provider: sol, kind: 'legacy' });
            }
        }

        return list;
    }

    function pokeWalletRegistry() {
        try {
            window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', {
                detail: {
                    register: function (wallet) {
                        if (!wallet || standardWallets.indexOf(wallet) !== -1) return;
                        standardWallets.push(wallet);
                        global.dispatchEvent(new CustomEvent('paper:wallets-updated'));
                    }
                }
            }));
        } catch (_) {}
    }

    function getStandardProviders() {
        return standardWallets.map(function (wallet) {
            var name = String(wallet.name || '');
            var def = WALLET_DEFS.find(function (d) { return d.match.test(name); });
            if (!def) return null;
            var connect = wallet.features && wallet.features['standard:connect'];
            if (!connect) return null;
            return { id: def.id, name: def.name, provider: wallet, kind: 'standard' };
        }).filter(Boolean);
    }

    function getAvailableProviders() {
        var map = {};
        getLegacyProviders().forEach(function (p) { map[p.id] = p; });
        getStandardProviders().forEach(function (p) { map[p.id] = p; });
        return map;
    }

    function truncateAddress(addr) {
        if (!addr || addr.length < 10) return addr || 'user';
        return addr.slice(0, 4) + '…' + addr.slice(-4);
    }

    function readSession() {
        try {
            var raw = localStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function writeSession(session) {
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            var name = session.username || session.displayName || truncateAddress(session.pubkey);
            localStorage.setItem('paper.username', name);
            if (session.username) syncPnlHandleFromUsername(session.username);
        } catch (_) {}
    }

    function validateUsername(name) {
        name = String(name || '').trim();
        if (name.length < 2 || name.length > 24) return false;
        return /^[a-zA-Z0-9_]+$/.test(name);
    }

    function normalizePnlHandleInput(value) {
        return String(value || '')
            .trim()
            .replace(/^@+/g, '')
            .slice(0, PNL_HANDLE_MAX);
    }

    function syncPnlHandleFromUsername(username) {
        try {
            var existing = normalizePnlHandleInput(localStorage.getItem(PNL_HANDLE_KEY));
            if (existing) return;
            if (!validateUsername(username)) return;
            var handle = normalizePnlHandleInput(username);
            if (handle) localStorage.setItem(PNL_HANDLE_KEY, handle);
        } catch (_) {}
    }

    function hasUsername() {
        var session = readSession();
        if (!session) return false;
        return validateUsername(session.username);
    }

    function loadWeb3() {
        if (!web3Promise) web3Promise = import('https://esm.sh/@solana/web3.js@1.98.4');
        return web3Promise;
    }

    function bytesToBase64(bytes) {
        var binary = '';
        var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        for (var i = 0; i < data.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    }

    async function fetchRegisteredProfile(pubkey) {
        try {
            var response = await fetch('/api/wallet/profile?walletAddress=' + encodeURIComponent(pubkey), {
                credentials: 'same-origin',
                cache: 'no-store'
            });
            if (!response.ok) return null;
            var profile = await response.json();
            return profile.registered ? profile : null;
        } catch (_) {
            return null;
        }
    }

    async function signOwnershipTransaction(unsignedTransaction) {
        var session = readSession();
        var entry = await resolveSigningEntry();
        if (!session || !entry) throw new Error('Connect a wallet first');
        var serialized = unsignedTransaction.serialize({ requireAllSignatures: false, verifySignatures: false });

        if (entry.kind === 'standard') {
            var accounts = entry.provider.accounts || await refreshStandardAccounts(entry.provider, session.pubkey);
            var account = findWalletAccount(accounts, session.pubkey);
            var feature = entry.provider.features && entry.provider.features['solana:signTransaction'];
            if (!account || !feature || typeof feature.signTransaction !== 'function') {
                throw new Error('Your wallet does not support transaction signing');
            }
            var output = await feature.signTransaction({
                account: account,
                transaction: serialized,
                chain: 'solana:mainnet'
            });
            if (Array.isArray(output)) output = output[0];
            var signedBytes = output && (output.signedTransaction || output.transaction);
            if (!signedBytes) throw new Error('Wallet did not return the signed transaction');
            return bytesToBase64(signedBytes);
        }

        if (entry.provider && typeof entry.provider.signTransaction === 'function') {
            var signed = await entry.provider.signTransaction(unsignedTransaction);
            return bytesToBase64(signed.serialize({ requireAllSignatures: true, verifySignatures: true }));
        }
        throw new Error('Your wallet does not support transaction signing. Try Phantom or Solflare.');
    }

    async function setUsername(username) {
        var session = readSession();
        if (!session) throw new Error('Connect a wallet first');
        username = String(username || '').trim();
        if (!validateUsername(username)) {
            throw new Error('Use 2–24 letters, numbers, or underscores');
        }
        var challengeResponse = await fetch('/api/wallet/challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ walletAddress: session.pubkey, username: username })
        });
        var challenge = await challengeResponse.json().catch(function () { return {}; });
        if (challengeResponse.status === 404) {
            throw new Error('Wallet registration API is unavailable. Restart the Paper server.');
        }
        if (!challengeResponse.ok) throw new Error(challenge.error || 'Could not create ownership proof');

        var web3 = await loadWeb3();
        var transaction = new web3.Transaction({
            feePayer: new web3.PublicKey(session.pubkey),
            recentBlockhash: challenge.recentBlockhash
        });
        transaction.add(new web3.TransactionInstruction({
            keys: [],
            programId: new web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
            data: new TextEncoder().encode(challenge.memo)
        }));
        var signedTransaction = await signOwnershipTransaction(transaction);
        var registrationResponse = await fetch('/api/wallet/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                nonce: challenge.nonce,
                signedTransaction: signedTransaction,
                walletName: session.walletName || 'Wallet'
            })
        });
        var registration = await registrationResponse.json().catch(function () { return {}; });
        if (!registrationResponse.ok) throw new Error(registration.error || 'Wallet registration failed');

        session.username = registration.username;
        session.displayName = registration.username;
        session.verified = true;
        writeSession(session);
        syncPnlHandleFromUsername(registration.username);
        syncUserProfile(registration.username);
        global.dispatchEvent(new CustomEvent('paper:wallet-connected', { detail: session }));
        return session;
    }

    function readRecent() {
        try {
            var raw = localStorage.getItem(RECENT_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function writeRecent(walletId) {
        try {
            localStorage.setItem(RECENT_KEY, JSON.stringify({ walletId: walletId, at: Date.now() }));
        } catch (_) {}
    }

    async function connectLegacy(provider) {
        var resp = await provider.connect();
        var pk = resp?.publicKey || provider.publicKey;
        if (!pk) throw new Error('Could not read wallet address');
        return typeof pk.toString === 'function' ? pk.toString() : String(pk);
    }

    async function connectStandard(wallet) {
        var feature = wallet.features['standard:connect'];
        var result;
        try {
            result = await feature.connect({ silent: false });
        } catch (_) {
            result = await feature.connect();
        }
        var accounts = (result && result.accounts) || wallet.accounts || [];
        if (!accounts.length && wallet.accounts) accounts = wallet.accounts;
        if (!accounts.length) throw new Error('No account returned');
        var addr = accounts[0].address || accounts[0].publicKey;
        if (!addr) throw new Error('Could not read wallet address');
        if (typeof addr === 'object' && typeof addr.toString === 'function') {
            return addr.toString();
        }
        return String(addr);
    }

    async function connectProvider(entry, walletId, walletName) {
        var pubkey;
        if (entry.kind === 'standard') {
            pubkey = await connectStandard(entry.provider);
        } else {
            pubkey = await connectLegacy(entry.provider);
        }

        var profile = await fetchRegisteredProfile(pubkey);
        var session = {
            pubkey: pubkey,
            walletId: walletId,
            walletName: walletName,
            username: profile ? profile.username : null,
            displayName: profile ? profile.username : truncateAddress(pubkey),
            verified: !!profile,
            connectedAt: Date.now()
        };

        writeSession(session);
        writeRecent(walletId);
        global.dispatchEvent(new CustomEvent('paper:wallet-connected', { detail: session }));
        return session;
    }

    async function connect(walletId) {
        var def = WALLET_DEFS.find(function (w) { return w.id === walletId; });
        if (!def) throw new Error('Unknown wallet');

        var available = getAvailableProviders();
        var entry = available[walletId];

        if (!entry) {
            window.open(def.installUrl, '_blank', 'noopener,noreferrer');
            throw new Error(def.name + ' not detected. Install the extension, refresh, and try again.');
        }

        var session = readSession();
        if (session) {
            await disconnect();
        }

        return connectProvider(entry, def.id, def.name);
    }

    async function disconnectProvider(entry) {
        if (!entry) return;
        try {
            if (entry.kind === 'standard') {
                var disc = entry.provider.features && entry.provider.features['standard:disconnect'];
                if (disc && typeof disc.disconnect === 'function') {
                    await disc.disconnect();
                }
            } else if (entry.provider && typeof entry.provider.disconnect === 'function') {
                await entry.provider.disconnect();
            }
        } catch (_) {}
    }

    async function disconnect() {
        var session = readSession();
        if (session && session.walletId) {
            var entry = getAvailableProviders()[session.walletId];
            await disconnectProvider(entry);
        }
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem('paper.username');
        } catch (_) {}
        global.dispatchEvent(new CustomEvent('paper:wallet-disconnected'));
    }

    function getLegacyProviderById(walletId) {
        return getLegacyProviders().find(function (p) { return p.id === walletId; }) || null;
    }

    function accountAddress(account) {
        if (!account) return '';
        var addr = account.address || account.publicKey;
        if (!addr) return '';
        if (typeof addr === 'string') return addr;
        if (typeof addr.toString === 'function') return addr.toString();
        return String(addr);
    }

    function findWalletAccount(accounts, sessionPubkey) {
        if (!Array.isArray(accounts) || !accounts.length) return null;
        if (sessionPubkey) {
            var match = accounts.find(function (acc) {
                return accountAddress(acc) === sessionPubkey;
            });
            if (match) return match;
        }
        return accounts[0];
    }

    async function refreshStandardAccounts(wallet, sessionPubkey) {
        if (!wallet) return [];
        var accounts = wallet.accounts || [];
        if (accounts.length) return accounts;

        var connectFeat = wallet.features && wallet.features['standard:connect'];
        if (!connectFeat || typeof connectFeat.connect !== 'function') return accounts;

        try {
            var result = await connectFeat.connect({ silent: true });
            accounts = (result && result.accounts) || wallet.accounts || [];
        } catch (_) {
            try {
                var interactive = await connectFeat.connect();
                accounts = (interactive && interactive.accounts) || wallet.accounts || [];
            } catch (_) {}
        }
        return accounts;
    }

    function legacyProviderReady(legacyEntry, sessionPubkey) {
        if (!legacyEntry || !legacyEntry.provider) return false;
        var provider = legacyEntry.provider;
        if (typeof provider.signAndSendTransaction !== 'function' &&
            typeof provider.signTransaction !== 'function') {
            return false;
        }
        var pk = provider.publicKey;
        if (pk) {
            var addr = typeof pk.toString === 'function' ? pk.toString() : String(pk);
            return !sessionPubkey || addr === sessionPubkey;
        }
        return provider.isConnected === true;
    }

    async function ensureLegacyConnected(legacyEntry) {
        if (!legacyEntry || !legacyEntry.provider) return false;
        var provider = legacyEntry.provider;
        if (provider.publicKey) return true;
        if (typeof provider.connect !== 'function') return false;
        try {
            await provider.connect();
            return !!provider.publicKey;
        } catch (_) {
            return false;
        }
    }

    async function resolveSigningEntry() {
        var session = readSession();
        if (!session || !session.walletId) return null;

        var legacy = getLegacyProviderById(session.walletId);
        if (legacyProviderReady(legacy, session.pubkey)) {
            return legacy;
        }

        var entry = getAvailableProviders()[session.walletId];
        if (entry && entry.kind === 'standard') {
            await refreshStandardAccounts(entry.provider, session.pubkey);
            var accounts = entry.provider.accounts || [];
            if (findWalletAccount(accounts, session.pubkey)) {
                return entry;
            }
        }

        if (legacy) {
            var connected = await ensureLegacyConnected(legacy);
            if (connected && legacyProviderReady(legacy, session.pubkey)) {
                return legacy;
            }
        }

        return entry || legacy || null;
    }

    function getActiveProviderEntry() {
        var session = readSession();
        if (!session || !session.walletId) return null;
        return getAvailableProviders()[session.walletId] || null;
    }

    async function signAndSendTransaction(versionedTx) {
        var session = readSession();
        if (!session || !session.pubkey) throw new Error('Connect a wallet first');

        var entry = await resolveSigningEntry();
        if (!entry) throw new Error('Connect a wallet first');

        var serialized = versionedTx.serialize();

        if (entry.kind === 'standard') {
            var accounts = entry.provider.accounts || [];
            if (!accounts.length) {
                accounts = await refreshStandardAccounts(entry.provider, session.pubkey);
            }
            var account = findWalletAccount(accounts, session.pubkey);
            if (!account) {
                throw new Error('Wallet session expired — disconnect and reconnect your wallet, then try again.');
            }

            var signSend = entry.provider.features && entry.provider.features['solana:signAndSendTransaction'];
            if (signSend && typeof signSend.signAndSendTransaction === 'function') {
                var out = await signSend.signAndSendTransaction({
                    account: account,
                    transaction: serialized,
                    chain: 'solana:mainnet',
                });
                if (out && out.signature) {
                    return typeof out.signature === 'string'
                        ? out.signature
                        : (out.signature.toString ? out.signature.toString() : String(out.signature));
                }
            }
            var signOnly = entry.provider.features && entry.provider.features['solana:signTransaction'];
            if (signOnly && typeof signOnly.signTransaction === 'function') {
                var signedOut = await signOnly.signTransaction({
                    account: account,
                    transaction: serialized,
                    chain: 'solana:mainnet',
                });
                var signedBytes = signedOut.signedTransaction || signedOut.transaction || serialized;
                return await broadcastSignedTransaction(signedBytes);
            }
        }

        var legacy = entry.provider;
        if (legacy && typeof legacy.signAndSendTransaction === 'function') {
            var sig = await legacy.signAndSendTransaction(versionedTx);
            if (typeof sig === 'string') return sig;
            if (sig && sig.signature) return String(sig.signature);
            return String(sig);
        }
        if (legacy && typeof legacy.signTransaction === 'function') {
            var signedTx = await legacy.signTransaction(versionedTx);
            return await broadcastSignedTransaction(signedTx.serialize());
        }

        throw new Error('Your wallet does not support transaction signing. Try Phantom or Solflare.');
    }

    async function broadcastSignedTransaction(serialized) {
        var endpoints = [
            'https://api.mainnet-beta.solana.com',
            'https://rpc.ankr.com/solana',
        ];
        function uint8ToBase64(bytes) {
            var binary = '';
            var chunk = 0x8000;
            for (var i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            return btoa(binary);
        }
        var b64 = uint8ToBase64(serialized instanceof Uint8Array ? serialized : new Uint8Array(serialized));
        var lastErr = null;
        for (var i = 0; i < endpoints.length; i++) {
            try {
                var res = await fetch(endpoints[i], {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 'paper-wallet-tx',
                        method: 'sendTransaction',
                        params: [b64, { skipPreflight: false, preflightCommitment: 'confirmed' }],
                    }),
                });
                var json = await res.json();
                if (json.error) {
                    lastErr = new Error(json.error.message || 'Send failed');
                    continue;
                }
                return json.result;
            } catch (err) {
                lastErr = err;
            }
        }
        throw lastErr || new Error('Failed to broadcast transaction');
    }

    function isConnected() {
        return !!readSession()?.pubkey;
    }

    function getSession() { return readSession(); }
    function getUserId() { return readSession()?.pubkey || null; }

    function getDisplayName() {
        var session = readSession();
        if (!session) return 'user';
        if (session.username) return session.username;
        try {
            return localStorage.getItem('paper.username') || session.displayName || truncateAddress(session.pubkey);
        } catch (_) {
            return session.displayName || truncateAddress(session.pubkey);
        }
    }

    function requireAuth() {
        if (isConnected()) return true;
        if (global.WalletModal && typeof global.WalletModal.open === 'function') {
            global.WalletModal.open();
        }
        return false;
    }

    async function syncUserProfile(username) {
        if (typeof getUserProfile !== 'function' || typeof saveUserProfile !== 'function') return;
        var session = readSession();
        if (!session) return;
        try {
            if (typeof window.__paperDataReadyPromise !== 'undefined') {
                await window.__paperDataReadyPromise;
            }
            var existing = await getUserProfile(session.pubkey);
            var data = {
                email: '',
                username: username,
                walletAddress: session.pubkey,
                walletName: session.walletName || 'Wallet'
            };
            if (existing) {
                await saveUserProfile(session.pubkey, Object.assign({}, existing, data));
            } else {
                await saveUserProfile(session.pubkey, data);
            }
        } catch (err) {
            console.warn('[wallet-auth] profile sync skipped', err);
        }
    }

    async function ensureWalletUserProfile(pubkey, walletName) {
        if (typeof getUserProfile !== 'function' || typeof saveUserProfile !== 'function') return;
        try {
            if (typeof window.__paperDataReadyPromise !== 'undefined') {
                await window.__paperDataReadyPromise;
            }
            var existing = await getUserProfile(pubkey);
            if (!existing) {
                await saveUserProfile(pubkey, {
                    email: '',
                    username: truncateAddress(pubkey),
                    walletAddress: pubkey,
                    walletName: walletName || 'Wallet'
                });
            }
        } catch (err) {
            console.warn('[wallet-auth] profile sync skipped', err);
        }
    }

    global.WalletAuth = {
        WALLET_DEFS: WALLET_DEFS,
        WALLETS: WALLET_DEFS,
        connect: connect,
        disconnect: disconnect,
        isConnected: isConnected,
        getSession: getSession,
        getUserId: getUserId,
        getDisplayName: getDisplayName,
        hasUsername: hasUsername,
        setUsername: setUsername,
        validateUsername: validateUsername,
        requireAuth: requireAuth,
        ensureWalletUserProfile: ensureWalletUserProfile,
        truncateAddress: truncateAddress,
        readRecent: readRecent,
        getWallet: function (id) { return WALLET_DEFS.find(function (w) { return w.id === id; }); },
        isInstalled: function (id) { return !!getAvailableProviders()[id]; },
        refreshRegistry: pokeWalletRegistry,
        pokeWalletRegistry: pokeWalletRegistry,
        loadStandardWalletsFromLib: loadStandardWalletsFromLib,
        getAvailableProviders: getAvailableProviders,
        getActiveProviderEntry: getActiveProviderEntry,
        signAndSendTransaction: signAndSendTransaction
    };
})(window);
