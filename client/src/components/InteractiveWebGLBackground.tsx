import { useEffect, useRef } from "react";

export function InteractiveWebGLBackground({ enabled = true, reducedMotion = false }: { enabled?: boolean; reducedMotion?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !enabled) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true });
    const resize = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.floor(window.innerWidth * dpr); canvas.height = Math.floor(window.innerHeight * dpr); canvas.style.width = "100vw"; canvas.style.height = "100vh"; gl?.viewport(0, 0, canvas.width, canvas.height); };
    resize();
    window.addEventListener("resize", resize);
    let frame = 0; let raf = 0; let pointerX = .5; let pointerY = .5;
    const move = (event: PointerEvent) => { pointerX = event.clientX / Math.max(1, window.innerWidth); pointerY = event.clientY / Math.max(1, window.innerHeight); };
    window.addEventListener("pointermove", move, { passive: true });
    if (!gl) {
      const ctx = canvas.getContext("2d");
      const draw2d = () => { if (!ctx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); const g = ctx.createRadialGradient(pointerX * canvas.width, pointerY * canvas.height, 0, canvas.width * .5, canvas.height * .5, canvas.width * .75); g.addColorStop(0, "rgba(125,211,252,.12)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height); if (!reducedMotion) raf = requestAnimationFrame(draw2d); }; draw2d(); return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("pointermove", move); };
    }
    const vertexSource = `attribute vec2 p; uniform vec2 u; uniform float t; void main(){ vec2 q=p; q.x += sin(t*.00025+p.y*7.0)*.025 + (u.x-.5)*.035; q.y += cos(t*.0002+p.x*6.0)*.02 + (.5-u.y)*.03; gl_Position=vec4(q,0.,1.); gl_PointSize=2.0; }`;
    const fragmentSource = `precision mediump float; void main(){ vec2 c=gl_PointCoord-.5; float a=smoothstep(.25,0.,dot(c,c)); gl_FragColor=vec4(.34,.78,1.,a*.24); }`;
    const compile = (type: number, source: string) => { const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader); return shader; };
    const program = gl.createProgram()!; gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource)); gl.linkProgram(program); gl.useProgram(program);
    const points = new Float32Array(Array.from({ length: 700 }, (_, i) => i % 2 === 0 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1)));
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW); const position = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0); const pointer = gl.getUniformLocation(program, "u"); const time = gl.getUniformLocation(program, "t");
    const draw = (now: number) => { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform2f(pointer, pointerX, pointerY); gl.uniform1f(time, reducedMotion ? 0 : now); gl.drawArrays(gl.POINTS, 0, points.length / 2); if (!reducedMotion) raf = requestAnimationFrame(draw); }; draw(0);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("pointermove", move); gl.deleteProgram(program); gl.deleteBuffer(buffer); };
  }, [enabled, reducedMotion]);
  return <canvas ref={ref} aria-hidden="true" className="interactive-webgl-background" />;
}
