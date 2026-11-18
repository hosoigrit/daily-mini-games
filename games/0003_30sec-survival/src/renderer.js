import { CONFIG } from "./core.js";

const STAR_FIELD = Array.from({ length: 48 }, (_, index) => ({
  x: (index * 73 + 19) % CONFIG.width,
  y: (index * 137 + 31) % CONFIG.height,
  radius: index % 7 === 0 ? 1.4 : 0.8,
  alpha: 0.35 + (index % 5) * 0.12,
}));

export function createRenderer(canvas) {
  const context = canvas.getContext("2d");
  let renderedWidth = 0;
  let renderedHeight = 0;
  let renderedDpr = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (width === renderedWidth && height === renderedHeight && dpr === renderedDpr) return;

    canvas.width = width;
    canvas.height = height;
    renderedWidth = width;
    renderedHeight = height;
    renderedDpr = dpr;
  }

  function render(game) {
    resize();
    context.setTransform(
      canvas.width / CONFIG.width,
      0,
      0,
      canvas.height / CONFIG.height,
      0,
      0,
    );
    drawBackground(context);
    for (const meteor of game.meteors) drawMeteor(context, meteor);

    const blinkHidden =
      game.player.invincibleSteps > 0 && Math.floor(game.player.invincibleSteps / 4) % 2 === 0;
    if (!blinkHidden) drawShip(context, game.player);
  }

  return { render, resize };
}

function drawBackground(context) {
  const gradient = context.createLinearGradient(0, 0, 0, CONFIG.height);
  gradient.addColorStop(0, "#08142f");
  gradient.addColorStop(0.55, "#101b43");
  gradient.addColorStop(1, "#190f37");
  context.fillStyle = gradient;
  context.fillRect(0, 0, CONFIG.width, CONFIG.height);

  for (const star of STAR_FIELD) {
    context.globalAlpha = star.alpha;
    context.fillStyle = "#eaf7ff";
    context.beginPath();
    context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawShip(context, player) {
  context.save();
  context.translate(player.x, player.y);
  context.rotate(player.heading);

  context.shadowColor = "rgba(63, 214, 255, 0.8)";
  context.shadowBlur = 12;
  context.fillStyle = "#5ee7ff";
  context.beginPath();
  context.moveTo(0, -18);
  context.lineTo(13, 14);
  context.lineTo(0, 9);
  context.lineTo(-13, 14);
  context.closePath();
  context.fill();

  context.shadowBlur = 0;
  context.fillStyle = "#eefcff";
  context.beginPath();
  context.moveTo(0, -10);
  context.lineTo(5, 7);
  context.lineTo(-5, 7);
  context.closePath();
  context.fill();

  context.fillStyle = "#ffbd59";
  context.beginPath();
  context.moveTo(-5, 13);
  context.lineTo(0, 23);
  context.lineTo(5, 13);
  context.closePath();
  context.fill();
  context.restore();
}

function drawMeteor(context, meteor) {
  context.save();
  context.translate(meteor.x, meteor.y);
  const gradient = context.createRadialGradient(-5, -6, 2, 0, 0, meteor.visualRadius);
  gradient.addColorStop(0, "#ffd08a");
  gradient.addColorStop(0.45, "#e97c3a");
  gradient.addColorStop(1, "#7f3429");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, meteor.visualRadius, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(88, 35, 30, 0.55)";
  context.beginPath();
  context.arc(6, 4, 4, 0, Math.PI * 2);
  context.arc(-6, 7, 3, 0, Math.PI * 2);
  context.arc(3, -8, 2.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
