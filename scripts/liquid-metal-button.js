const SHADER_URL = 'https://esm.sh/@paper-design/shaders?bundle';

let shaderModulePromise;

function loadShaderModule() {
    if (!shaderModulePromise) {
        shaderModulePromise = import(SHADER_URL);
    }
    return shaderModulePromise;
}

function ensureCanvasStyles() {
    if (document.getElementById('liquid-metal-button-canvas-style')) return;
    var style = document.createElement('style');
    style.id = 'liquid-metal-button-canvas-style';
    style.textContent = [
        '.liquid-metal-button__shader canvas {',
        'width: 100% !important;',
        'height: 100% !important;',
        'display: block !important;',
        'position: absolute !important;',
        'inset: 0 !important;',
        'border-radius: 100px !important;',
        '}',
        '@keyframes liquid-metal-button-ripple {',
        '0% { transform: translate(-50%, -50%) scale(0); opacity: 0.58; }',
        '100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }',
        '}',
    ].join('');
    document.head.appendChild(style);
}

function addRipple(button, event) {
    var rect = button.getBoundingClientRect();
    var ripple = document.createElement('span');
    ripple.className = 'liquid-metal-button__ripple';
    ripple.style.left = (event.clientX - rect.left) + 'px';
    ripple.style.top = (event.clientY - rect.top) + 'px';
    button.appendChild(ripple);
    window.setTimeout(function () {
        ripple.remove();
    }, 620);
}

function initLiquidMetalButton(button) {
    if (!button || button.dataset.liquidMetalReady === 'true') return;
    button.dataset.liquidMetalReady = 'true';

    ensureCanvasStyles();

    var shader = document.createElement('span');
    shader.className = 'liquid-metal-button__shader';
    shader.setAttribute('aria-hidden', 'true');
    button.insertBefore(shader, button.firstChild);

    var isHovered = false;
    var mount = null;

    function setSpeed(speed) {
        if (mount && typeof mount.setSpeed === 'function') {
            mount.setSpeed(speed);
        }
    }

    loadShaderModule()
        .then(function (mod) {
            var ShaderMount = mod.ShaderMount;
            var liquidMetalFragmentShader = mod.liquidMetalFragmentShader;
            if (!ShaderMount || !liquidMetalFragmentShader || !shader.isConnected) return;
            mount = new ShaderMount(
                shader,
                liquidMetalFragmentShader,
                {
                    u_repetition: 4,
                    u_softness: 0.5,
                    u_shiftRed: 0.3,
                    u_shiftBlue: 0.3,
                    u_distortion: 0,
                    u_contour: 0,
                    u_angle: 45,
                    u_scale: 8,
                    u_shape: 1,
                    u_offsetX: 0.1,
                    u_offsetY: -0.1,
                },
                undefined,
                0.6
            );
            button.classList.add('liquid-metal-button--shader-ready');
        })
        .catch(function (error) {
            console.warn('Liquid metal shader failed to load; using CSS fallback.', error);
            button.classList.add('liquid-metal-button--fallback');
        });

    button.addEventListener('mouseenter', function () {
        isHovered = true;
        button.classList.add('liquid-metal-button--hovered');
        setSpeed(1);
    });

    button.addEventListener('mouseleave', function () {
        isHovered = false;
        button.classList.remove('liquid-metal-button--hovered', 'liquid-metal-button--pressed');
        setSpeed(0.6);
    });

    button.addEventListener('mousedown', function () {
        button.classList.add('liquid-metal-button--pressed');
    });

    button.addEventListener('mouseup', function () {
        button.classList.remove('liquid-metal-button--pressed');
    });

    button.addEventListener('click', function (event) {
        addRipple(button, event);
        setSpeed(2.4);
        window.setTimeout(function () {
            setSpeed(isHovered ? 1 : 0.6);
        }, 300);
    });
}

function initLiquidMetalButtons() {
    document.querySelectorAll('.liquid-metal-button').forEach(initLiquidMetalButton);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLiquidMetalButtons);
} else {
    initLiquidMetalButtons();
}
