(function (global) {
    var root = null;
    var msgEl = null;
    var recentSection = null;
    var recentList = null;
    var walletGrid = null;
    var connectedPanel = null;
    var connectedAddr = null;
    var connectedName = null;
    var connectedLogo = null;
    var modalTitle = null;
    var modalSub = null;
    var usernamePanel = null;
    var usernameInput = null;
    var walletSections = null;
    var onSuccess = null;
    var injected = false;
    var usernameSubmitting = false;
    var usernameStepActive = false;

    function truncateAddr(addr) {
        if (!addr || addr.length < 12) return addr || '';
        return addr.slice(0, 4) + '…' + addr.slice(-4);
    }

    function setMessage(text, type) {
        if (!msgEl) return;
        msgEl.textContent = text || '';
        msgEl.className = 'wallet-modal-msg' + (type ? ' is-' + type : '');
        msgEl.hidden = !text;
    }

    function injectModal() {
        if (injected) return;
        injected = true;

        root = document.createElement('div');
        root.id = 'wallet-modal-root';
        root.className = 'wallet-modal-root';
        root.hidden = true;
        root.innerHTML =
            '<button type="button" class="wallet-modal-backdrop" aria-label="Close"></button>' +
            '<div class="wallet-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title">' +
                '<div class="wallet-modal-accent" aria-hidden="true"></div>' +
                '<header class="wallet-modal-header">' +
                    '<div class="wallet-modal-header-text">' +
                        '<h2 id="wallet-modal-title">Connect wallet</h2>' +
                        '<p class="wallet-modal-sub" id="wallet-modal-sub">Sign in to paper with your Solana wallet</p>' +
                    '</div>' +
                    '<button type="button" class="wallet-modal-close" aria-label="Close">' +
                        '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
                    '</button>' +
                '</header>' +
                '<div class="wallet-modal-body">' +
                    '<section class="wallet-connected-panel" id="wallet-connected-panel" hidden>' +
                        '<div class="wallet-connected-card">' +
                            '<div class="wallet-connected-logo" id="wallet-connected-logo"></div>' +
                            '<div class="wallet-connected-info">' +
                                '<span class="wallet-connected-name" id="wallet-connected-name"></span>' +
                                '<span class="wallet-connected-addr" id="wallet-connected-addr" title=""></span>' +
                            '</div>' +
                            '<button type="button" class="wallet-disconnect-btn" id="wallet-disconnect-btn">Disconnect</button>' +
                        '</div>' +
                        '<div class="wallet-username-reminder" id="wallet-username-reminder" hidden>' +
                            '<div class="wallet-username-reminder__text">' +
                                '<strong>Add a username</strong>' +
                                '<span>Complete your profile whenever you&apos;re ready.</span>' +
                            '</div>' +
                            '<button type="button" class="wallet-add-username-btn" id="wallet-add-username-btn">Add username</button>' +
                        '</div>' +
                    '</section>' +
                    '<section class="wallet-username-panel" id="wallet-username-panel" hidden>' +
                        '<h3 class="wallet-section-title">Choose a username</h3>' +
                        '<p class="wallet-username-hint">This is how you&apos;ll appear across paper. Your wallet will ask you to sign a free ownership proof.</p>' +
                        '<label class="wallet-username-field">' +
                            '<span class="wallet-username-prefix">@</span>' +
                            '<input type="text" id="wallet-username-input" maxlength="24" autocomplete="username" placeholder="your_name" spellcheck="false">' +
                        '</label>' +
                        '<p class="wallet-username-rules">2–24 characters · letters, numbers, underscores</p>' +
                        '<button type="button" class="btn btn-primary wallet-username-submit" id="wallet-username-submit">Sign &amp; continue</button>' +
                    '</section>' +
                    '<div class="wallet-picker-sections" id="wallet-picker-sections">' +
                    '<section class="wallet-section" id="wallet-recent-section" hidden>' +
                        '<h3 class="wallet-section-title">Recent</h3>' +
                        '<div class="wallet-list" id="wallet-recent-list"></div>' +
                    '</section>' +
                    '<section class="wallet-section wallet-section--list">' +
                        '<h3 class="wallet-section-title" id="wallet-list-title">Choose wallet</h3>' +
                        '<div class="wallet-grid" id="wallet-grid"></div>' +
                    '</section>' +
                    '</div>' +
                    '<p id="wallet-modal-msg" class="wallet-modal-msg" hidden></p>' +
                '</div>' +
            '</div>';

        document.body.appendChild(root);

        msgEl = root.querySelector('#wallet-modal-msg');
        recentSection = root.querySelector('#wallet-recent-section');
        recentList = root.querySelector('#wallet-recent-list');
        walletGrid = root.querySelector('#wallet-grid');
        connectedPanel = root.querySelector('#wallet-connected-panel');
        connectedAddr = root.querySelector('#wallet-connected-addr');
        connectedName = root.querySelector('#wallet-connected-name');
        connectedLogo = root.querySelector('#wallet-connected-logo');
        modalTitle = root.querySelector('#wallet-modal-title');
        modalSub = root.querySelector('#wallet-modal-sub');
        usernamePanel = root.querySelector('#wallet-username-panel');
        usernameInput = root.querySelector('#wallet-username-input');
        walletSections = root.querySelector('#wallet-picker-sections');

        root.querySelector('.wallet-modal-backdrop').addEventListener('click', close);
        root.querySelector('.wallet-modal-close').addEventListener('click', close);
        root.querySelector('#wallet-disconnect-btn').addEventListener('click', handleDisconnect);
        root.querySelector('#wallet-add-username-btn').addEventListener('click', showUsernameStep);
        root.querySelector('#wallet-username-submit').addEventListener('click', handleUsernameSubmit);
        if (usernameInput) {
            usernameInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') handleUsernameSubmit();
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && root && !root.hidden) close();
        });

        global.addEventListener('paper:wallets-updated', renderLists);
        global.addEventListener('paper:wallet-connected', renderConnectedState);
        global.addEventListener('paper:wallet-disconnected', renderConnectedState);
    }

    function showUsernameStep() {
        usernameStepActive = true;
        if (usernamePanel) usernamePanel.hidden = false;
        if (walletSections) walletSections.hidden = true;
        if (connectedPanel) connectedPanel.hidden = true;
        if (modalTitle) modalTitle.textContent = 'Pick a username';
        if (modalSub) modalSub.textContent = 'Wallet connected — choose how you want to be known';
        if (usernameInput) {
            usernameInput.value = '';
            setTimeout(function () { usernameInput.focus(); }, 80);
        }
    }

    function hideUsernameStep() {
        usernameStepActive = false;
        if (usernamePanel) usernamePanel.hidden = true;
        if (walletSections) walletSections.hidden = false;
    }

    function finishAfterConnect(session) {
        if (!WalletAuth.hasUsername()) {
            showUsernameStep();
            return;
        }
        if (typeof onSuccess === 'function') {
            onSuccess(session);
            close();
        } else {
            setTimeout(function () {
                close();
                if (window.location.pathname === '/' || window.location.pathname.endsWith('index.html')) {
                    return;
                }
                window.location.href = '/pages/dashboard';
            }, 300);
        }
    }

    async function handleUsernameSubmit() {
        if (!usernameInput || usernameSubmitting) return;
        var value = usernameInput.value.trim();
        var submitButton = root && root.querySelector('#wallet-username-submit');
        usernameSubmitting = true;
        if (submitButton) submitButton.disabled = true;
        setMessage('Preparing ownership proof…', 'loading');
        try {
            var session = await WalletAuth.setUsername(value);
            setMessage('');
            hideUsernameStep();
            finishAfterConnect(session);
        } catch (err) {
            setMessage(err.message || 'Could not save username', 'error');
        } finally {
            usernameSubmitting = false;
            if (submitButton) submitButton.disabled = false;
        }
    }

    function renderConnectedState() {
        if (!connectedPanel) return;
        var session = WalletAuth.getSession();
        var connected = WalletAuth.isConnected();
        var needsUsername = connected && !WalletAuth.hasUsername();

        if (needsUsername && usernameStepActive) {
            showUsernameStep();
            return;
        }

        hideUsernameStep();
        connectedPanel.hidden = !connected;
        var usernameReminder = root && root.querySelector('#wallet-username-reminder');
        if (usernameReminder) usernameReminder.hidden = !needsUsername;

        if (modalTitle) {
            modalTitle.textContent = connected ? 'Your wallet' : 'Connect wallet';
        }
        if (modalSub) {
            modalSub.textContent = connected
                ? 'Switch account or disconnect below'
                : 'Sign in to paper with your Solana wallet';
        }
        var listTitle = root && root.querySelector('#wallet-list-title');
        if (listTitle) {
            listTitle.textContent = connected ? 'Switch wallet' : 'Choose wallet';
        }

        if (connected && session) {
            if (connectedName) {
                connectedName.textContent = session.username || session.walletName || 'Wallet';
            }
            if (connectedAddr) {
                connectedAddr.textContent = truncateAddr(session.pubkey);
                connectedAddr.title = session.pubkey || '';
            }
            if (connectedLogo && global.WalletLogos) {
                connectedLogo.innerHTML = WalletLogos.logoImg(session.walletId, session.walletName);
            }
        }
    }

    async function handleDisconnect() {
        setMessage('Disconnecting…', 'loading');
        try {
            await WalletAuth.disconnect();
            setMessage('');
            renderConnectedState();
            renderLists();
        } catch (err) {
            setMessage(err.message || 'Could not disconnect', 'error');
        }
    }

    function renderWalletButton(wallet) {
        var installed = WalletAuth.isInstalled(wallet.id);
        var session = WalletAuth.getSession();
        var isCurrent = session && session.walletId === wallet.id;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wallet-option' +
            (installed ? '' : ' is-uninstalled') +
            (isCurrent ? ' is-current' : '');
        btn.dataset.walletId = wallet.id;

        var logoHtml = global.WalletLogos
            ? WalletLogos.logoImg(wallet.id, wallet.name)
            : '';

        btn.innerHTML =
            '<span class="wallet-option-icon">' + logoHtml + '</span>' +
            '<span class="wallet-option-text">' +
                '<span class="wallet-option-name">' + wallet.name + '</span>' +
                '<span class="wallet-option-desc">' +
                    (isCurrent ? 'Currently connected' : installed ? 'Browser extension' : 'Install to continue') +
                '</span>' +
            '</span>' +
            '<span class="wallet-option-chevron" aria-hidden="true">' +
                (installed ? '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') +
            '</span>';

        btn.addEventListener('click', function () { handleConnect(wallet.id); });
        return btn;
    }

    async function handleConnect(walletId) {
        setMessage('Waiting for wallet approval…', 'loading');
        try {
            var session = await WalletAuth.connect(walletId);
            setMessage('');
            renderConnectedState();
            renderLists();
            finishAfterConnect(session);
        } catch (err) {
            var msg = err.message || 'Connection failed';
            if (/rejected|cancel/i.test(msg)) {
                msg = 'Connection cancelled in wallet';
            }
            setMessage(msg, 'error');
        }
    }

    function renderLists() {
        if (!walletGrid) return;
        renderConnectedState();

        var recent = WalletAuth.readRecent();
        if (recent && recent.walletId && recentSection && recentList) {
            var rw = WalletAuth.getWallet(recent.walletId);
            if (rw) {
                recentSection.hidden = false;
                recentList.innerHTML = '';
                recentList.appendChild(renderWalletButton(rw));
            } else {
                recentSection.hidden = true;
            }
        } else if (recentSection) {
            recentSection.hidden = true;
        }

        walletGrid.innerHTML = '';
        WalletAuth.WALLET_DEFS.forEach(function (wallet) {
            if (recent && wallet.id === recent.walletId) return;
            walletGrid.appendChild(renderWalletButton(wallet));
        });
    }

    function open(options) {
        injectModal();
        onSuccess = options && options.onSuccess ? options.onSuccess : null;
        hideUsernameStep();
        setMessage('');
        if (global.WalletAuth.pokeWalletRegistry) WalletAuth.pokeWalletRegistry();
        if (global.WalletAuth.loadStandardWalletsFromLib) {
            WalletAuth.loadStandardWalletsFromLib().finally(renderLists);
        }
        renderLists();
        root.hidden = false;
        document.body.classList.add('wallet-modal-open');
    }

    function close() {
        if (!root) return;
        hideUsernameStep();
        root.hidden = true;
        document.body.classList.remove('wallet-modal-open');
        setMessage('');
        onSuccess = null;
    }

    global.WalletModal = { open: open, close: close, renderLists: renderLists };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectModal);
    } else {
        injectModal();
    }

    if (global.location.search.indexOf('connect=1') !== -1 || global.location.hash === '#connect') {
        document.addEventListener('DOMContentLoaded', function () {
            WalletModal.open();
        });
    }
})(window);
