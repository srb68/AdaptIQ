function initCanvas(canvasEl) {
  const ctx = canvasEl.getContext('2d');
  let mouse = { x: -9999, y: -9999 };
  let nodes = [];
  let rafId = null;

  function resize() {
    canvasEl.width = window.innerWidth;
    canvasEl.height = window.innerHeight;
  }

  function spawn() {
    nodes = [];
    for (let i = 0; i < 38; i++) {
      nodes.push({
        x:  Math.random() * canvasEl.width,
        y:  Math.random() * canvasEl.height,
        r:  0.6 + Math.random() * 1.8,
        vx: (Math.random() - 0.5) * 0.7,
        vy: (Math.random() - 0.5) * 0.7,
        pulse: Math.random() * Math.PI * 2,
        ps:    0.015 + Math.random() * 0.025,
      });
    }
  }

  function frame() {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      n.pulse += n.ps;
      if (n.x < 0 || n.x > canvasEl.width)  n.vx *= -1;
      if (n.y < 0 || n.y > canvasEl.height) n.vy *= -1;
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 110) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255,255,255,${(1 - d / 110) * 0.18})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    for (const n of nodes) {
      const dx = n.x - mouse.x;
      const dy = n.y - mouse.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < 140) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${(1 - d / 140) * 0.35})`;
        ctx.lineWidth = 0.5;
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
      }
    }

    for (const n of nodes) {
      const a = 0.2 + (Math.sin(n.pulse) * 0.5 + 0.5) * 0.7;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fill();
    }

    rafId = requestAnimationFrame(frame);
  }

  resize();
  spawn();

  window.addEventListener('resize', () => { resize(); spawn(); });
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

  if (rafId) cancelAnimationFrame(rafId);
  frame();
}
