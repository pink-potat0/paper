/**
 * Vanilla ports of React Bits (https://reactbits.dev/) effects for paper.
 * SplitText, BlurText, GradientText, ClickSpark, SpotlightCard, Aurora
 */
(function (global) {
    var reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function cssVar(name, fallback) {
        var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    }

    function hexToRgb(hex) {
        hex = String(hex).replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
        return [
            parseInt(hex.slice(0, 2), 16) / 255,
            parseInt(hex.slice(2, 4), 16) / 255,
            parseInt(hex.slice(4, 6), 16) / 255
        ];
    }

    /* ── SplitText ── */
    function initSplitText(el) {
        if (el.dataset.rbSplitDone) return;
        var text = el.textContent.trim();
        var type = el.dataset.rbSplitType || 'chars';
        var delay = parseInt(el.dataset.rbSplitDelay, 10) || 40;
        var parts = type === 'words' ? text.split(/\s+/) : text.split('');

        el.setAttribute('aria-label', text);
        el.textContent = '';
        el.classList.add('rb-split');

        parts.forEach(function (part, i) {
            if (type === 'words' && !part) return;
            var span = document.createElement('span');
            span.className = 'rb-split__unit';
            span.textContent = part;
            if (!reduced) {
                span.style.animationDelay = (i * delay) + 'ms';
            }
            el.appendChild(span);
            if (type === 'words' && i < parts.length - 1) {
                el.appendChild(document.createTextNode(' '));
            }
        });

        el.dataset.rbSplitDone = '1';
        requestAnimationFrame(function () {
            el.classList.add('rb-split--play');
        });
    }

    /* ── BlurText ── */
    function initBlurText(el) {
        if (el.dataset.rbBlurDone) return;
        var text = el.textContent.trim();
        var delay = parseInt(el.dataset.rbBlurDelay, 10) || 120;
        var words = text.split(/\s+/);

        el.setAttribute('aria-label', text);
        el.textContent = '';
        el.classList.add('rb-blur');

        words.forEach(function (word, i) {
            var span = document.createElement('span');
            span.className = 'rb-blur__word';
            span.textContent = word;
            if (!reduced) {
                span.style.animationDelay = (i * delay) + 'ms';
            }
            el.appendChild(span);
            if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
        });

        el.dataset.rbBlurDone = '1';
        requestAnimationFrame(function () {
            el.classList.add('rb-blur--play');
        });
    }

    /* ── GradientText ── */
    function initGradientText(el) {
        el.classList.add('rb-gradient-text');
        if (reduced) return;
        el.classList.add('rb-gradient-text--live');
    }

    /* ── ClickSpark ── */
    function initClickSpark(container) {
        var canvas = document.createElement('canvas');
        canvas.className = 'rb-click-spark';
        canvas.setAttribute('aria-hidden', 'true');
        container.appendChild(canvas);

        var ctx = canvas.getContext('2d');
        var sparks = [];
        var raf = null;
        var color = cssVar('--accent-light', '#93c5fd');
        var duration = 400;
        var sparkCount = 8;
        var sparkRadius = 18;
        var sparkSize = 10;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        function ease(t) {
            return t * (2 - t);
        }

        function draw(ts) {
            raf = null;
            if (!ctx) return;
            try {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (sparks.length) {
                    sparks = sparks.filter(function (s) {
                        var elapsed = ts - s.start;
                        if (elapsed >= duration) return false;
                        var p = ease(elapsed / duration);
                        var dist = p * sparkRadius;
                        var len = sparkSize * (1 - p);
                        var x1 = s.x + dist * Math.cos(s.angle);
                        var y1 = s.y + dist * Math.sin(s.angle);
                        var x2 = s.x + (dist + len) * Math.cos(s.angle);
                        var y2 = s.y + (dist + len) * Math.sin(s.angle);
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.stroke();
                        return true;
                    });
                }
            } catch (_) {
                sparks = [];
                return;
            }
            if (sparks.length) {
                raf = requestAnimationFrame(draw);
            }
        }

        function scheduleDraw() {
            if (!raf && sparks.length) {
                raf = requestAnimationFrame(draw);
            }
        }

        function burst(x, y) {
            if (reduced) return;
            var now = performance.now();
            for (var i = 0; i < sparkCount; i++) {
                sparks.push({
                    x: x,
                    y: y,
                    angle: (2 * Math.PI * i) / sparkCount,
                    start: now
                });
            }
            scheduleDraw();
        }

        resize();
        window.addEventListener('resize', resize);
        document.addEventListener('mousedown', function (e) {
            burst(e.clientX, e.clientY);
        });
        global.addEventListener('paper:theme-changed', function () {
            color = cssVar('--accent-light', '#5eecc8');
        });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden && raf) {
                cancelAnimationFrame(raf);
                raf = null;
            }
        });

        return function destroy() {
            window.removeEventListener('resize', resize);
            if (raf) cancelAnimationFrame(raf);
            canvas.remove();
        };
    }

    /* ── SpotlightCard ── */
    function initSpotlightCard(el) {
        el.classList.add('rb-spotlight');

        el.addEventListener('mousemove', function (e) {
            var rect = el.getBoundingClientRect();
            var x = ((e.clientX - rect.left) / rect.width) * 100;
            var y = ((e.clientY - rect.top) / rect.height) * 100;
            el.style.setProperty('--spot-x', x + '%');
            el.style.setProperty('--spot-y', y + '%');
        });

        el.addEventListener('mouseleave', function () {
            el.style.removeProperty('--spot-x');
            el.style.removeProperty('--spot-y');
        });
    }

    /* ── Aurora (WebGL via ogl) ── */
    function initAurora(container) {
        if (reduced) return;

        var VERT = '#version 300 es\nin vec2 position;\nvoid main(){gl_Position=vec4(position,0.,1.);}';
        var FRAG = '#version 300 es\nprecision highp float;\nuniform float uTime;\nuniform float uAmplitude;\nuniform vec3 uColorStops[3];\nuniform vec2 uResolution;\nuniform float uBlend;\nout vec4 fragColor;\nvec3 permute(vec3 x){return mod(((x*34.)+1.)*x,289.);}\nfloat snoise(vec2 v){\n const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);\n vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);\n vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod(i,289.);\n vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));\n vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m=m*m;m=m*m;\n vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;\n m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);\n vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.*dot(m,g);}\nvoid main(){\n vec2 uv=gl_FragCoord.xy/uResolution;\n vec3 c0=uColorStops[0];vec3 c1=uColorStops[1];vec3 c2=uColorStops[2];\n vec3 ramp=mix(mix(c0,c1,uv.x),c2,uv.x*0.5+uv.y*0.5);\n float height=snoise(vec2(uv.x*2.+uTime*0.1,uTime*0.25))*0.5*uAmplitude;height=exp(height);height=(uv.y*2.-height+0.2);\n float intensity=0.55*height;float auroraAlpha=smoothstep(0.2-uBlend*0.5,0.2+uBlend*0.5,intensity);\n vec3 auroraColor=intensity*ramp;fragColor=vec4(auroraColor*auroraAlpha,auroraAlpha*0.55);}';

        function getColors() {
            var a = cssVar('--accent-light', '#93c5fd');
            var b = cssVar('--accent', '#60a5fa');
            var c = cssVar('--accent-dark', '#3b82f6');
            return [hexToRgb(a), hexToRgb(b), hexToRgb(c)];
        }

        import('https://esm.sh/ogl@1.0.11').then(function (mod) {
            var Renderer = mod.Renderer;
            var Program = mod.Program;
            var Mesh = mod.Mesh;
            var Triangle = mod.Triangle;

            var renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true });
            var gl = renderer.gl;
            gl.clearColor(0, 0, 0, 0);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.canvas.className = 'rb-aurora__canvas';
            container.appendChild(gl.canvas);

            var geometry = new Triangle(gl);
            if (geometry.attributes.uv) delete geometry.attributes.uv;

            var program = new Program(gl, {
                vertex: VERT,
                fragment: FRAG,
                uniforms: {
                    uTime: { value: 0 },
                    uAmplitude: { value: 1.35 },
                    uColorStops: { value: getColors() },
                    uResolution: { value: [container.offsetWidth, container.offsetHeight] },
                    uBlend: { value: 0.62 }
                }
            });

            var mesh = new Mesh(gl, { geometry: geometry, program: program });

            function resize() {
                var w = container.offsetWidth || window.innerWidth;
                var h = container.offsetHeight || window.innerHeight;
                renderer.setSize(w, h);
                program.uniforms.uResolution.value = [w, h];
            }

            var animId = null;
            var auroraRunning = false;

            function update(t) {
                animId = null;
                if (!auroraRunning || document.hidden) return;
                try {
                    program.uniforms.uTime.value = t * 0.00008;
                    program.uniforms.uColorStops.value = getColors();
                    renderer.render({ scene: mesh });
                } catch (_) {
                    auroraRunning = false;
                    container.classList.add('rb-aurora--fallback');
                    return;
                }
                animId = requestAnimationFrame(update);
            }

            function startAurora() {
                if (auroraRunning) return;
                auroraRunning = true;
                if (!animId) animId = requestAnimationFrame(update);
            }

            function stopAurora() {
                auroraRunning = false;
                if (animId) {
                    cancelAnimationFrame(animId);
                    animId = null;
                }
            }

            resize();
            window.addEventListener('resize', resize);
            global.addEventListener('paper:theme-changed', function () {
                program.uniforms.uColorStops.value = getColors();
            });
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) stopAurora();
                else startAurora();
            });
            startAurora();

            container._rbAuroraDestroy = function () {
                stopAurora();
                window.removeEventListener('resize', resize);
                if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas);
                gl.getExtension('WEBGL_lose_context') && gl.getExtension('WEBGL_lose_context').loseContext();
            };
        }).catch(function () {
            container.classList.add('rb-aurora--fallback');
        });
    }

    function initLanding() {
        document.querySelectorAll('[data-rb-split-text]').forEach(initSplitText);
        document.querySelectorAll('[data-rb-blur-text]').forEach(initBlurText);
        document.querySelectorAll('[data-rb-gradient-text]').forEach(initGradientText);
        document.querySelectorAll('.ly-app__shell, .lp-preview__frame.rb-spotlight').forEach(initSpotlightCard);

        var aurora = document.getElementById('lp-aurora') || document.getElementById('rb-aurora');
        if (aurora) initAurora(aurora);

        if (document.body.classList.contains('page-home--immersive') ||
            document.body.classList.contains('page-home--premium')) {
            initClickSpark(document.body);
        }
    }

    global.ReactBits = {
        initLanding: initLanding,
        initSplitText: initSplitText,
        initBlurText: initBlurText,
        initGradientText: initGradientText,
        initClickSpark: initClickSpark,
        initSpotlightCard: initSpotlightCard,
        initAurora: initAurora
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLanding, { once: true });
    } else {
        initLanding();
    }
})(window);
