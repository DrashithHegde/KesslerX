// ─────────────────────────────────────────────────────────────────────────────
// CRTEarthShader — Natural-looking Earth with subtle atmosphere edge glow
// Realistic texture display with toned-down stylization and alpha support
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
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    // ── Sample texture directly — no pixelation for realism ──
    vec2 sampleUV = vUv;

    // ── Minimal chromatic aberration ──
    float caOffset = uChromaticAberration * 0.0005;
    float r = texture2D(uTexture, sampleUV + vec2(caOffset, 0.0)).r;
    float g = texture2D(uTexture, sampleUV).g;
    float b = texture2D(uTexture, sampleUV - vec2(caOffset, 0.0)).b;
    vec3 color = vec3(r, g, b);

    // ── Natural saturation — keep colors true ──
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, 0.95);

    // ── Gentle gamma for natural look ──
    color = pow(color, vec3(0.95));

    // ── Very faint scanlines (barely there) ──
    float scanline = sin(vUv.y * 800.0 * 3.14159) * 0.5 + 0.5;
    scanline = pow(scanline, 4.0);
    color *= 1.0 - (scanline * uScanlineIntensity);

    // ── Near-invisible grain ──
    float grainVal = hash(vUv * 800.0 + uTime * 2.0) * 2.0 - 1.0;
    color += grainVal * uGrainIntensity;

    // ── Atmospheric edge glow removed for clean rim ──
    float fresnel = 1.0 - max(dot(normalize(-vPosition), vNormal), 0.0);

    // ── Vignette on sphere edges ──
    float vignette = 1.0 - pow(fresnel, 4.0) * uVignetteStrength;
    color *= vignette;

    // ── Brightness ──
    color *= uBrightness;

    color = clamp(color, 0.0, 1.0);
    gl_FragColor = vec4(color, uOpacity);
  }
`;
