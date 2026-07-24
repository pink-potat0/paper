(function (global) {
    var LOGOS = {
        jupiter: 'jupiter.svg',
        phantom: 'phantom.svg',
        trust: 'trust.svg',
        metamask: 'metamask.svg',
        solflare: 'solflare.svg'
    };

    function assetsBase() {
        var path = global.location.pathname || '';
        return /\/pages(\/|$)/.test(path) ? '../assets/icons/wallets/' : 'assets/icons/wallets/';
    }

    function getLogoUrl(walletId) {
        var file = LOGOS[walletId];
        return file ? assetsBase() + file : '';
    }

    function logoImg(walletId, alt) {
        var src = getLogoUrl(walletId);
        if (!src) return '';
        return '<img src="' + src + '" alt="' + (alt || walletId) + '" width="32" height="32" loading="lazy" decoding="async">';
    }

    global.WalletLogos = {
        getLogoUrl: getLogoUrl,
        logoImg: logoImg
    };
})(window);
