// ─────────────────────────────────────────────────────────────────────────────
// CRTEarthShader — Custom GLSL for CRT-look Earth
// Matches WorldView CRT screenshots: vibrant earth, very subtle pixelation,
// barely-visible scanlines, minimal grain — looks real but with CRT character
// ─────────────────────────────────────────────────────────────────────────────

export const CRTEarthVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const CRTEarthFragmentShader = `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uPixelation;
  uniform float uScanlineIntensity;
  uniform float uGrainIntensity;
  uniform float uChromaticAberration;
  uniform float uVignetteStrength;
  uniform float uBrightness;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    // ── Very fine pixelation — barely perceptible ──
    vec2 pixelSize = vec2(1.0 / uPixelation);
    vec2 pixelatedUV = floor(vUv / pixelSize) * pixelSize + pixelSize * 0.5;

    // ── Tiny chromatic aberration ──
    float caOffset = uChromaticAberration * 0.001;
    float r = texture2D(uTexture, pixelatedUV + vec2(caOffset, 0.0)).r;
    float g = texture2D(uTexture, pixelatedUV).g;
    float b = texture2D(uTexture, pixelatedUV - vec2(caOffset, 0.0)).b;
    vec3 color = vec3(r, g, b);

    // ── Keep earth vibrant — almost no desaturation ──
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, 0.92);

    // ── Boost vibrancy ──
    color = pow(color, vec3(0.9));
    color *= 1.15;

    // ── Very faint scanlines ──
    float scanline = sin(vUv.y * uPixelation * 3.14159) * 0.5 + 0.5;
    scanline = pow(scanline, 3.0);
    color *= 1.0 - (scanline * uScanlineIntensity);

    // ── Barely visible grain ──
    float grainVal = hash(vUv * 600.0 + uTime * 3.0) * 2.0 - 1.0;
    color += grainVal * uGrainIntensity;

    // ── Vignette on sphere edges ──
    float fresnel = 1.0 - max(dot(normalize(-vPosition), vNormal), 0.0);
    float vignette = 1.0 - pow(fresnel, 2.5) * uVignetteStrength;
    color *= vignette;

    // ── Brightness ──
    color *= uBrightness;

    color = clamp(color, 0.0, 1.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;
