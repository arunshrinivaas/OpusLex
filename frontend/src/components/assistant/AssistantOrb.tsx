import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';

export type AssistantOrbState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'action-pending'
  | 'pending-action'
  | 'success'
  | 'error';

export interface AssistantOrbProps {
  state: AssistantOrbState;
  isOpen?: boolean;
  onClick?: () => void;
  shortcut?: string;
  hasPendingAction?: boolean;
  isCentered?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  audioLevel?: number; // 0.0 to 1.0 from real microphone metering
  showLabel?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// WebGL Shader Source: 3D Translucent Glass Membrane + Luminous Fluid Nucleus
// ─────────────────────────────────────────────────────────────────────────────

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 v_uv;

uniform float u_time;
uniform float u_state;      // 0: idle, 1: listening, 2: thinking, 3: speaking, 4: error, 5: action-pending, 6: success
uniform float u_audio;      // 0.0 - 1.0 smoothed amplitude
uniform vec2 u_resolution;
uniform float u_motion;     // 1.0 normal, 0.1 reduced motion

// ── 3D Simplex Noise by Ian McEwan, Ashima Arts ──
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0, 0.0, 0.0, 0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// ── Multi-Octave 3D Fractal Brownian Motion ──
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.55;
  vec3 shift = vec3(100.0, 100.0, 100.0);
  for (int i = 0; i < 3; ++i) {
    v += a * snoise(p);
    p = p * 1.95 + shift;
    a *= 0.5;
  }
  return v;
}

// ── Organic Glass Shell Surface Displacement ──
float shellDisplacement(vec3 p, float t, float state, float audio) {
  float speed = t * 0.45;
  if (state == 2.0) speed = t * 1.1; // Thinking: active fluid motion
  else if (state == 3.0) speed = t * 0.8; // Speaking: lively pulses
  
  float disp = snoise(p * 1.8 + vec3(0.0, speed * 0.4, speed * 0.25)) * 0.048;
  disp += snoise(p * 3.6 - vec3(speed * 0.2, 0.0, speed * 0.3)) * 0.024;
  
  if (state == 1.0) { // Listening: reacts to real microphone amplitude
    disp += snoise(p * 5.5 + speed) * (0.01 + audio * 0.05);
  } else if (state == 2.0) { // Thinking: circulating vortex distortion
    float angle = atan(p.y, p.x);
    disp += sin(angle * 3.0 + speed * 2.5) * 0.028;
  }
  return disp;
}

// ── OpusLex Color Palette Map ──
vec3 getOpusLexColor(float t, float state) {
  // Brand Swatches:
  vec3 c_ivory   = vec3(1.0, 0.985, 0.92);   // #FFFBEB / Warm ivory
  vec3 c_pyellow = vec3(0.99, 0.94, 0.54);   // #FEF08A / Pale yellow
  vec3 c_gold    = vec3(0.984, 0.776, 0.282); // #FBC648 / Primary golden yellow
  vec3 c_amber   = vec3(0.96, 0.62, 0.04);   // #F59E0B / Amber
  vec3 c_orange  = vec3(0.92, 0.35, 0.05);   // #EA580C / Orange
  vec3 c_crimson = vec3(0.60, 0.11, 0.11);   // #991B1B / Burnt crimson
  vec3 c_deep    = vec3(0.25, 0.03, 0.03);   // #450A0A / Deep core shadow

  if (state == 4.0) { // Error / Warning State: Crimson-focused palette
    return mix(c_deep, mix(c_crimson, vec3(0.95, 0.2, 0.2), clamp(t * 1.2, 0.0, 1.0)), t);
  }

  // Smooth multi-stop interpolation for fluid nucleus
  if (t < 0.25) {
    return mix(c_deep, c_crimson, t / 0.25);
  } else if (t < 0.5) {
    return mix(c_crimson, c_orange, (t - 0.25) / 0.25);
  } else if (t < 0.75) {
    return mix(c_orange, c_gold, (t - 0.5) / 0.25);
  } else if (t < 0.92) {
    return mix(c_gold, c_pyellow, (t - 0.75) / 0.17);
  } else {
    return mix(c_pyellow, c_ivory, (t - 0.92) / 0.08);
  }
}

void main() {
  // Normalized coordinates centered at (0, 0)
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * 2.0;
  
  float t = u_time * u_motion;
  float state = u_state;
  float audio = u_audio;

  float r2 = dot(p, p);
  float dist = sqrt(r2);

  // Background transparency
  vec4 finalColor = vec4(0.0, 0.0, 0.0, 0.0);

  // ── Outer Celestial Aura (Soft volumetric ambient glow) ──
  float auraIntensity = (state == 1.0 ? 0.35 + audio * 0.3 : (state == 2.0 ? 0.45 : 0.28));
  float aura = exp(-dist * 2.8) * auraIntensity;
  vec3 auraColor = mix(vec3(0.92, 0.35, 0.05), vec3(0.984, 0.776, 0.282), clamp(1.2 - dist, 0.0, 1.0));
  if (state == 4.0) auraColor = vec3(0.85, 0.15, 0.15);
  finalColor.rgb += auraColor * aura;
  finalColor.a += aura * 0.8;

  // ── Swirling Ambient Micro-Particles ──
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float angle = t * (0.2 + fi * 0.06) + fi * 1.047;
    float pRad = 0.92 + 0.14 * sin(t * 0.4 + fi * 1.6);
    vec2 pPos = vec2(cos(angle), sin(angle * 0.85)) * pRad;
    float pDist = length(p - pPos);
    float pGlow = exp(-pDist * 26.0) * (0.5 + 0.35 * sin(t * 2.2 + fi));
    finalColor.rgb += vec3(1.0, 0.92, 0.65) * pGlow;
    finalColor.a += pGlow * 0.6;
  }

  // ── Understated Tilted Orbital Accent ──
  float ringAngle = 0.38;
  vec2 rotP = vec2(p.x * cos(ringAngle) - p.y * sin(ringAngle), (p.x * sin(ringAngle) + p.y * cos(ringAngle)) * 2.6);
  float ringDist = abs(length(rotP) - 1.15);
  float ringGlow = exp(-ringDist * 28.0) * (0.18 + audio * 0.12);
  if (rotP.y < 0.0) ringGlow *= 0.4;
  finalColor.rgb += vec3(0.98, 0.82, 0.35) * ringGlow;
  finalColor.a += ringGlow * 0.5;

  // ── Ray-Sphere Geometry for Outer Translucent Shell ──
  float baseRadius = 0.74;
  if (state == 1.0) baseRadius += audio * 0.04; // Gentle expansion on speech
  
  if (dist < baseRadius + 0.12) {
    float zSq = max(0.0, baseRadius * baseRadius - r2);
    float z = sqrt(zSq);
    vec3 sphereP = normalize(vec3(p, z));
    
    // Calculate organic contour deformation
    float disp = shellDisplacement(sphereP, t, state, audio);
    float deformedDist = dist - disp;

    if (deformedDist < baseRadius + 0.02) {
      float eps = 0.015;
      vec3 norm = normalize(vec3(p.x, p.y, z + 0.15));
      norm.x += (snoise(sphereP * 2.5 + vec3(eps, 0.0, 0.0) + t * 0.3) - snoise(sphereP * 2.5 + t * 0.3)) * 1.5;
      norm.y += (snoise(sphereP * 2.5 + vec3(0.0, eps, 0.0) + t * 0.3) - snoise(sphereP * 2.5 + t * 0.3)) * 1.5;
      norm = normalize(norm);

      vec3 rayDir = vec3(0.0, 0.0, -1.0);
      vec3 eyeDir = -rayDir;

      // Refraction through glass shell
      vec3 refractRay = refract(rayDir, norm, 1.0 / 1.35);
      vec3 coreSampleP = sphereP + refractRay * 0.35;
      
      // Core Fluid Animation: Silky multi-harmonic ribbons
      float coreTime = t * (state == 2.0 ? 1.3 : (state == 3.0 ? 0.9 : 0.42));
      vec3 q = vec3(
        fbm(coreSampleP * 1.4 + vec3(0.0, 0.0, coreTime * 0.3)),
        fbm(coreSampleP * 1.4 + vec3(4.2, 1.2, coreTime * 0.28)),
        fbm(coreSampleP * 1.4 + vec3(1.7, 8.1, coreTime * 0.32))
      );
      vec3 rWarp = vec3(
        fbm(coreSampleP * 1.8 + 1.8 * q + vec3(1.3, 7.2, coreTime * 0.2)),
        fbm(coreSampleP * 1.8 + 1.8 * q + vec3(6.1, 2.4, coreTime * 0.22)),
        fbm(coreSampleP * 1.8 + 1.8 * q + vec3(2.8, 4.3, coreTime * 0.18))
      );
      float fluidPattern = fbm(coreSampleP * 2.0 + 2.2 * rWarp);
      
      float coreRadius = 0.54 + (state == 3.0 ? 0.08 : 0.0) + audio * 0.06;
      float coreDist = length(p + q.xy * 0.14);
      float coreMask = smoothstep(coreRadius + 0.16, coreRadius - 0.20, coreDist);
      
      // Color value from mapped noise:
      float colorVal = clamp(fluidPattern * 0.55 + 0.5, 0.0, 1.0);
      vec3 nucleusColor = getOpusLexColor(colorVal, state);
      
      float luminescence = 1.25;
      if (state == 1.0) luminescence += audio * 0.45;
      if (state == 2.0) luminescence += 0.3;
      if (state == 3.0) luminescence += 0.35 + 0.15 * sin(t * 6.0);
      
      vec3 coreColor = nucleusColor * luminescence * coreMask;

      // ── Outer Glass Membrane Shading ──
      float fresnel = pow(1.0 - max(0.0, dot(eyeDir, norm)), 2.6);
      vec3 fresnelColor = mix(vec3(0.96, 0.62, 0.04), vec3(1.0, 0.985, 0.92), fresnel * 0.85 + 0.15);
      
      // Specular Highlight 1: Top-left light source (sharp glint + soft gloss halo)
      vec3 light1 = normalize(vec3(0.35, 0.52, 0.78));
      vec3 half1 = normalize(eyeDir + light1);
      float nDotH1 = max(0.0, dot(norm, half1));
      float specSharp = pow(nDotH1, 46.0);
      float specSoft = pow(nDotH1, 12.0);
      vec3 specHighlight1 = vec3(1.0, 0.99, 0.95) * specSharp * 1.5 + vec3(1.0, 0.95, 0.85) * specSoft * 0.45;

      // Specular Highlight 2: Amber rim light
      vec3 light2 = normalize(vec3(-0.48, -0.42, 0.55));
      vec3 half2 = normalize(eyeDir + light2);
      float spec2 = pow(max(0.0, dot(norm, half2)), 22.0);
      vec3 specHighlight2 = vec3(0.96, 0.62, 0.04) * spec2 * 0.75;

      // Flowing surface striations on glass
      float striation = pow(abs(sin(norm.y * 10.0 + snoise(norm * 2.2 + t * 0.3) * 2.5)), 3.0) * 0.08;

      // Depth Separation: Soft shadow and refraction bleed between membrane and nucleus
      float depthShadow = smoothstep(coreRadius - 0.08, coreRadius + 0.16, deformedDist);
      vec3 glassMembrane = (fresnelColor * fresnel * 1.1) + specHighlight1 + specHighlight2 + striation;
      
      // Composite: Fluid Core viewed through Translucent Glass Shell
      vec3 finalOrb = mix(coreColor, glassMembrane + coreColor * 0.4, clamp(fresnel * 0.72 + depthShadow * 0.4, 0.0, 1.0));
      finalOrb += specHighlight1; // Specular glint on outer glass surface
      
      // Outer shell alpha
      float shellAlpha = smoothstep(baseRadius + 0.015, baseRadius - 0.035, deformedDist);
      
      finalColor.rgb = mix(finalColor.rgb, finalOrb, shellAlpha);
      finalColor.a = max(finalColor.a, shellAlpha);
    }
  }

  gl_FragColor = finalColor;
}
`;

export default function AssistantOrb({
  state,
  isOpen = false,
  onClick,
  shortcut = '⌥A',
  hasPendingAction = false,
  isCentered = false,
  size = isCentered ? 'xl' : 'md',
  audioLevel = 0,
  showLabel = isCentered,
  className = '',
}: AssistantOrbProps) {
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);
  const canvasRefCallback = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasNode(node);
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;
  const audioLevelRef = useRef(audioLevel);
  audioLevelRef.current = audioLevel;

  const smoothedAudioRef = useRef<number>(0);
  const [webGLSupported, setWebGLSupported] = useState<boolean>(true);

  // Sizing definitions: Enhanced large diameter for centered voice overlay
  const dimensions = useMemo(() => {
    switch (size) {
      case 'xl':
        return 'h-56 w-56 sm:h-64 sm:w-64 md:h-72 md:w-72';
      case 'lg':
        return 'h-32 w-32 sm:h-36 sm:w-36';
      case 'sm':
        return 'h-10 w-10';
      case 'md':
      default:
        return 'h-16 w-16';
    }
  }, [size]);

  // Audio-reactive scale calculation (0 to 1 -> subtle organic expansion)
  const reactiveScale = useMemo(() => {
    if (state === 'listening' && audioLevel > 0.02) {
      return 1 + Math.min(0.14, audioLevel * 0.18);
    }
    if (state === 'speaking') {
      return 1.04;
    }
    return 1;
  }, [state, audioLevel]);

  // Accessible state descriptions
  const stateDescription = useMemo(() => {
    switch (state) {
      case 'listening':
        return 'Listening... Speak naturally';
      case 'thinking':
        return 'Thinking & researching...';
      case 'speaking':
        return 'Speaking response...';
      case 'action-pending':
      case 'pending-action':
        return 'Action requires confirmation';
      case 'success':
        return 'Action completed';
      case 'error':
        return 'Voice recognition error';
      case 'idle':
      default:
        return 'Tap orb to speak';
    }
  }, [state]);

  const stateColor = useMemo(() => {
    switch (state) {
      case 'listening':
        return 'text-[#FBC648]';
      case 'thinking':
        return 'text-amber-300';
      case 'speaking':
        return 'text-neutral-100';
      case 'action-pending':
      case 'pending-action':
        return 'text-amber-400';
      case 'error':
        return 'text-red-400';
      case 'idle':
      default:
        return 'text-neutral-400 group-hover:text-neutral-200';
    }
  }, [state]);

  // WebGL Shader Initialization & Render Loop (Runs ONCE per canvas mount)
  useEffect(() => {
    if (!canvasNode) return;
    const canvas = canvasNode;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        depth: false,
        preserveDrawingBuffer: false,
        premultipliedAlpha: true,
      });
    } catch (e) {
      gl = null;
    }

    if (!gl) {
      console.warn('[AssistantOrb] WebGL context not supported, falling back to CSS procedural renderer');
      setWebGLSupported(false);
      return;
    }

    // Compile Helper
    const createShader = (type: number, source: string, label: string): WebGLShader | null => {
      const shader = gl!.createShader(type);
      if (!shader) return null;
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        console.error(`[AssistantOrb] Shader ${label} compile error:`, gl!.getShaderInfoLog(shader));
        gl!.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertShader = createShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE, 'VERTEX');
    const fragShader = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE, 'FRAGMENT');

    if (!vertShader || !fragShader) {
      setWebGLSupported(false);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      setWebGLSupported(false);
      return;
    }

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[AssistantOrb] Program link error:', gl.getProgramInfoLog(program));
      setWebGLSupported(false);
      return;
    }

    gl.useProgram(program);

    // Full-screen quad geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Uniform Locations
    const uniforms = {
      u_time: gl.getUniformLocation(program, 'u_time')!,
      u_state: gl.getUniformLocation(program, 'u_state')!,
      u_audio: gl.getUniformLocation(program, 'u_audio')!,
      u_resolution: gl.getUniformLocation(program, 'u_resolution')!,
      u_motion: gl.getUniformLocation(program, 'u_motion')!,
    };

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motionFactor = prefersReducedMotion ? 0.1 : 1.0;

    let animId: number | null = null;
    const startTime = performance.now();

    const render = () => {
      if (!gl || gl.isContextLost()) return;

      // Handle Canvas Sizing for Retina displays
      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      const displayWidth = Math.floor(canvas.clientWidth * dpr);
      const displayHeight = Math.floor(canvas.clientHeight * dpr);

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, displayWidth, displayHeight);
      }

      // Smooth audio amplitude (exponential moving average)
      const targetAudio = audioLevelRef.current;
      smoothedAudioRef.current += (targetAudio - smoothedAudioRef.current) * 0.18;

      // Map dynamic state string from ref to numeric uniform
      const currentState = stateRef.current;
      let stateCode = 0.0;
      if (currentState === 'listening') stateCode = 1.0;
      else if (currentState === 'thinking') stateCode = 2.0;
      else if (currentState === 'speaking') stateCode = 3.0;
      else if (currentState === 'error') stateCode = 4.0;
      else if (currentState === 'action-pending' || currentState === 'pending-action') stateCode = 5.0;
      else if (currentState === 'success') stateCode = 6.0;

      const elapsed = (performance.now() - startTime) / 1000;

      gl.useProgram(program);
      gl.uniform1f(uniforms.u_time, elapsed);
      gl.uniform1f(uniforms.u_state, stateCode);
      gl.uniform1f(uniforms.u_audio, smoothedAudioRef.current);
      gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.u_motion, motionFactor);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      if (animId) {
        cancelAnimationFrame(animId);
      }
      if (gl) {
        try {
          if (positionBuffer) gl.deleteBuffer(positionBuffer);
          if (vertShader) gl.deleteShader(vertShader);
          if (fragShader) gl.deleteShader(fragShader);
          if (program) gl.deleteProgram(program);
        } catch {}
      }
    };
  }, [canvasNode]);

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none ${
        isCentered ? 'my-auto' : ''
      } ${className}`}
    >
      {/* Outer Atmospheric Aura (Volumetric celestial glow) */}
      <div
        className="absolute rounded-full pointer-events-none transition-all duration-300"
        style={{
          width: size === 'xl' ? '150%' : '170%',
          height: size === 'xl' ? '150%' : '170%',
          background:
            state === 'error'
              ? 'radial-gradient(circle, rgba(239, 68, 68, 0.35) 0%, rgba(185, 28, 28, 0.15) 50%, transparent 75%)'
              : state === 'thinking'
              ? 'radial-gradient(circle, rgba(251, 198, 72, 0.5) 0%, rgba(234, 88, 12, 0.3) 45%, rgba(185, 28, 28, 0.12) 70%, transparent 85%)'
              : state === 'listening'
              ? `radial-gradient(circle, rgba(251, 198, 72, ${0.45 + audioLevel * 0.35}) 0%, rgba(234, 88, 12, ${
                  0.28 + audioLevel * 0.28
                }) 50%, transparent 80%)`
              : 'radial-gradient(circle, rgba(251, 198, 72, 0.3) 0%, rgba(234, 88, 12, 0.15) 50%, transparent 75%)',
          filter: 'blur(36px)',
          transform: `scale(${reactiveScale})`,
        }}
      />

      {/* Dynamic Audio Ripple Waves (When listening & user speaks) */}
      {state === 'listening' && (
        <>
          <div
            className="absolute rounded-full border border-[#FBC648]/40 animate-ping pointer-events-none"
            style={{
              width: '112%',
              height: '112%',
              animationDuration: audioLevel > 0.1 ? '1.3s' : '2.0s',
            }}
          />
          <div
            className="absolute rounded-full border border-amber-500/25 pointer-events-none"
            style={{
              width: '128%',
              height: '128%',
              transform: `scale(${1 + audioLevel * 0.22})`,
              transition: 'transform 100ms ease-out',
            }}
          />
        </>
      )}

      {/* Interactive Orb Button */}
      <button
        onClick={onClick}
        aria-label={`Themis Assistant (${shortcut}). Status: ${state}. Click to toggle listening.`}
        aria-expanded={isOpen}
        role="button"
        tabIndex={0}
        style={{
          transform: `scale(${reactiveScale})`,
          transition: 'transform 120ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 300ms ease',
        }}
        className={`group relative ${dimensions} rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FBC648]/70 focus-visible:ring-offset-4 focus-visible:ring-offset-black transition-transform active:scale-95`}
      >
        {/* Procedural WebGL 3D Glass Shell + Fluid Core Canvas */}
        {webGLSupported ? (
          <canvas
            ref={canvasRefCallback}
            className="absolute inset-0 h-full w-full pointer-events-none rounded-full"
            style={{ filter: 'drop-shadow(0 12px 32px rgba(234, 88, 12, 0.25))' }}
          />
        ) : (
          /* High-Fidelity Canvas2D / CSS Procedural Glass Fallback */
          <div className="relative h-full w-full rounded-full overflow-hidden shadow-2xl">
            {/* Base Spherical Deep Lighting */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  state === 'error'
                    ? 'radial-gradient(circle at 35% 30%, #FCA5A5 0%, #EF4444 30%, #B91C1C 60%, #450A0A 100%)'
                    : 'radial-gradient(circle at 35% 30%, #FFFBEB 0%, #FEF08A 18%, #FBC648 40%, #F59E0B 54%, #D97706 70%, #9A3412 85%, #450A0A 100%)',
              }}
            />
            {/* Swirling Fluid Waves */}
            <div
              className={`absolute inset-[-10%] rounded-full opacity-75 mix-blend-color-dodge ${
                state === 'thinking' ? 'animate-spin' : 'animate-[spin_12s_linear_infinite]'
              }`}
              style={{
                background:
                  'radial-gradient(ellipse at 70% 65%, rgba(220, 38, 38, 0.8) 0%, rgba(234, 88, 12, 0.65) 35%, transparent 70%)',
                filter: 'blur(8px)',
              }}
            />
            {/* Specular Glass Highlight */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.45) 18%, transparent 60%)',
              }}
            />
          </div>
        )}

        {/* State Glyphs (Only for Action Pending or Success) */}
        {(hasPendingAction || state === 'action-pending' || state === 'pending-action') && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-8 w-8 rounded-full bg-amber-500/85 backdrop-blur-sm border border-white/60 flex items-center justify-center shadow-lg">
              <AlertTriangle className="h-4 w-4 text-white" />
            </div>
          </div>
        )}

        {state === 'success' && (
          <div className="absolute inset-0 flex items-center justify-center animate-in zoom-in-50 duration-200 pointer-events-none">
            <div className="h-9 w-9 rounded-full bg-emerald-500/85 backdrop-blur-sm border border-white/70 flex items-center justify-center shadow-lg">
              <Check className="h-5 w-5 text-white" />
            </div>
          </div>
        )}
      </button>

      {/* State Caption & Instructions under Orb (in Centered Mode) */}
      {showLabel && (
        <div className="mt-6 flex flex-col items-center gap-1 transition-all duration-200">
          <p className={`text-sm font-medium tracking-wide ${stateColor} transition-colors flex items-center gap-2`}>
            {state === 'thinking' && <Loader2 size={13} className="animate-spin text-amber-300" />}
            <span>{stateDescription}</span>
          </p>
          {state === 'idle' && (
            <span className="text-[11px] text-neutral-400 font-normal">
              Click orb to speak or press{' '}
              <kbd className="px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 text-[10px] font-mono">
                {shortcut}
              </kbd>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
