import { BOARD_H, BOARD_W, textFontSize, type Stroke } from "./model";

const GRID = 40;

/** Light squared-paper grid, drawn in board coordinates. */
export function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = "#e6e8f3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = GRID; x < BOARD_W; x += GRID) { ctx.moveTo(x, 0); ctx.lineTo(x, BOARD_H); }
  for (let y = GRID; y < BOARD_H; y += GRID) { ctx.moveTo(0, y); ctx.lineTo(BOARD_W, y); }
  ctx.stroke();
  ctx.restore();
}

/** Draws one stroke in board coordinates (the caller sets the scale transform). */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, fontFamily: string) {
  const p = s.points;
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.size;

  switch (s.tool) {
    case "highlighter":
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(16, s.size * 4);
      freehand(ctx, p, ctx.lineWidth);
      break;
    case "pen":
      freehand(ctx, p, s.size);
      break;
    case "line":
    case "arrow": {
      const [x0, y0, x1 = x0, y1 = y0] = p;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      if (s.tool === "arrow") {
        const a = Math.atan2(y1 - y0, x1 - x0);
        const head = Math.max(14, s.size * 3.5);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - head * Math.cos(a - Math.PI / 7), y1 - head * Math.sin(a - Math.PI / 7));
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - head * Math.cos(a + Math.PI / 7), y1 - head * Math.sin(a + Math.PI / 7));
        ctx.stroke();
      }
      break;
    }
    case "rect": {
      const [x0, y0, x1 = x0, y1 = y0] = p;
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      break;
    }
    case "ellipse": {
      const [x0, y0, x1 = x0, y1 = y0] = p;
      ctx.beginPath();
      ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "text": {
      const fs = textFontSize(s.size);
      ctx.font = `700 ${fs}px ${fontFamily}`;
      ctx.textBaseline = "top";
      (s.text ?? "").split("\n").forEach((line, i) => ctx.fillText(line, p[0], p[1] + i * fs * 1.25));
      break;
    }
  }
  ctx.restore();
}

/** Smooth freehand line through the points (quadratic curves between midpoints). */
function freehand(ctx: CanvasRenderingContext2D, p: number[], width: number) {
  if (p.length <= 2) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (p.length === 4) {
    ctx.lineTo(p[2], p[3]);
  } else {
    for (let i = 2; i + 3 < p.length; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  }
  ctx.stroke();
}
