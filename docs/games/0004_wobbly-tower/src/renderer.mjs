import { CONFIG, LANDING } from "./rules.mjs";
import { PHASES, getFallProgress, getShakeOffset } from "./state.mjs";

const COLORS = ["#73e6ff", "#8cf0c7", "#ffdb73", "#ff9e78", "#c79cff"];

export function createRenderer(canvas) {
  const context = canvas.getContext("2d");
  let reducedMotion = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
  }

  function render(game) {
    resize();
    context.setTransform(canvas.width / CONFIG.width, 0, 0, canvas.height / CONFIG.height, 0, 0);
    drawBackground(context);

    const shake = getShakeOffset(game, reducedMotion);
    context.save();
    context.translate(shake, 0);
    game.placed.forEach((block, index) => drawBlock(context, block, index));
    context.restore();

    if (shouldDrawMovingBlock(game)) {
      const rendered = { ...game.moving };
      rendered.y = getMovingRenderY(game);
      drawBlock(context, rendered, game.floor + 1, true);
    }

    drawGuide(context, game);
    drawFeedback(context, game);
  }

  function setReducedMotion(value) {
    reducedMotion = Boolean(value);
  }

  return { render, resize, setReducedMotion };
}

export function shouldDrawMovingBlock(game) {
  if (!game.moving) return false;
  const visiblePhase = game.phase === PHASES.PAUSED ? game.pausedFrom : game.phase;
  if (visiblePhase === PHASES.MOVING || visiblePhase === PHASES.FALLING) return true;
  return visiblePhase === PHASES.SETTLING && game.lastLanding === LANDING.MISS;
}

export function getMovingRenderY(game) {
  if (!game.moving) return null;
  const visiblePhase = game.phase === PHASES.PAUSED ? game.pausedFrom : game.phase;
  if (visiblePhase === PHASES.FALLING) {
    const progress = getFallProgress(game);
    return game.moving.y + (game.moving.targetY - game.moving.y) * easeIn(progress);
  }
  if (visiblePhase === PHASES.SETTLING || visiblePhase === PHASES.JUDGING) {
    return game.moving.targetY;
  }
  return game.moving.y;
}

function drawBackground(context) {
  const gradient = context.createLinearGradient(0, 0, 0, CONFIG.height);
  gradient.addColorStop(0, "#151331");
  gradient.addColorStop(0.58, "#22224a");
  gradient.addColorStop(1, "#161b35");
  context.fillStyle = gradient;
  context.fillRect(0, 0, CONFIG.width, CONFIG.height);

  context.fillStyle = "rgba(255, 255, 255, 0.035)";
  for (let y = 40; y < CONFIG.height; y += 52) {
    context.fillRect(0, y, CONFIG.width, 1);
  }
  for (let index = 0; index < 18; index += 1) {
    const x = (index * 83 + 29) % CONFIG.width;
    const y = (index * 47 + 35) % 260;
    context.fillStyle = index % 4 === 0 ? "rgba(255,220,120,.7)" : "rgba(185,225,255,.45)";
    context.beginPath();
    context.arc(x, y, index % 4 === 0 ? 1.4 : 0.8, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(9, 12, 29, 0.8)";
  context.fillRect(0, CONFIG.baseY + CONFIG.blockHeight, CONFIG.width, CONFIG.height - CONFIG.baseY);
}

function drawBlock(context, block, index, moving = false) {
  const color = block.isBase ? "#62739b" : COLORS[(index - 1) % COLORS.length];
  context.save();
  context.shadowColor = moving ? "rgba(115, 230, 255, .75)" : "rgba(0, 0, 0, .3)";
  context.shadowBlur = moving ? 13 : 6;
  context.shadowOffsetY = 4;
  roundedRect(context, block.x, block.y, Math.max(block.width, 0.45), block.height, 5);
  context.fillStyle = color;
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = "rgba(255, 255, 255, .28)";
  roundedRect(context, block.x + 3, block.y + 3, Math.max(0, block.width - 6), 4, 2);
  context.fill();
  context.restore();
}

function drawGuide(context, game) {
  if (game.phase !== PHASES.MOVING || !game.moving) return;
  const support = game.placed.at(-1);
  context.strokeStyle = "rgba(255, 255, 255, .11)";
  context.setLineDash([5, 6]);
  context.beginPath();
  context.moveTo(support.x, game.moving.y + CONFIG.blockHeight + 8);
  context.lineTo(support.x, support.y);
  context.moveTo(support.x + support.width, game.moving.y + CONFIG.blockHeight + 8);
  context.lineTo(support.x + support.width, support.y);
  context.stroke();
  context.setLineDash([]);
}

function drawFeedback(context, game) {
  const visiblePhase = game.phase === PHASES.PAUSED ? game.pausedFrom : game.phase;
  if (visiblePhase !== PHASES.SETTLING || !game.lastLanding) return;
  const labels = {
    [LANDING.PERFECT]: ["PERFECT!", "#fff199"],
    [LANDING.NORMAL]: ["NICE", "#d6f6ff"],
    [LANDING.MISS]: ["MISS", "#ff9f9f"],
  };
  const [label, color] = labels[game.lastLanding];
  const progress = Math.min(1, game.animationElapsedSec / CONFIG.settleDurationSeconds);
  context.save();
  context.globalAlpha = 1 - Math.max(0, progress - 0.55) / 0.45;
  context.fillStyle = color;
  context.font = "900 28px system-ui, sans-serif";
  context.textAlign = "center";
  context.shadowColor = "rgba(0,0,0,.75)";
  context.shadowBlur = 8;
  context.fillText(label, CONFIG.width / 2, 112 - progress * 10);
  context.restore();
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, Math.max(0, width / 2), height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
}

function easeIn(value) {
  return value * value;
}
