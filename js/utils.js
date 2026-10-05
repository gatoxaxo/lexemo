import { state } from "./state.js";
import phoneticMaps from "./phoneticMaps.js";
import { getTranslation } from "./i18n/i18n.js";

export function normalizePronunciation(word) {
  const phoneticMapToUse = phoneticMaps[state.recognition?.lang] ?? {};

  return word
    .normalize("NFKC")
    .toLowerCase()
    .split("")
    .map((c) => phoneticMapToUse[c] ?? c)
    .join("");
}

export function samePronunciation(targetWord, spokenText) {
  const normTarget = normalizePronunciation(targetWord);
  const normSpoken = normalizePronunciation(spokenText);

  if (normTarget.length <= 4) {
    const spokenWords = normSpoken.split(" ");
    if (spokenWords.some((word) => word === normTarget)) {
      return true;
    }
  }
  return normTarget === normSpoken;
}

export function hashCode(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

const NEON_PALETTE = [
  "hsl(0, 100%, 60%)",    
  "hsl(15, 100%, 60%)",   
  "hsl(30, 100%, 60%)",   
  "hsl(45, 100%, 60%)",   
  "hsl(60, 100%, 60%)",   
  "hsl(75, 100%, 60%)",   
  "hsl(90, 100%, 60%)",   
  "hsl(105, 100%, 60%)",  
  "hsl(120, 100%, 60%)",  
  "hsl(135, 100%, 60%)",  
  "hsl(150, 100%, 60%)",  
  "hsl(165, 100%, 60%)",  
  "hsl(180, 100%, 60%)",  
  "hsl(195, 100%, 60%)",  
  "hsl(210, 100%, 60%)",  
  "hsl(225, 100%, 60%)",  
  "hsl(240, 100%, 60%)",  
  "hsl(255, 100%, 60%)",  
  "hsl(270, 100%, 60%)",  
  "hsl(285, 100%, 60%)",  
  "hsl(300, 100%, 60%)",  
  "hsl(315, 100%, 60%)",  
  "hsl(330, 100%, 60%)",  
  "hsl(345, 100%, 60%)",  
  "hsl(0, 100%, 75%)",    
  "hsl(60, 100%, 75%)",   
  "hsl(120, 100%, 75%)",  
  "hsl(180, 100%, 75%)",  
  "hsl(240, 100%, 75%)",  
  "hsl(300, 100%, 75%)"   
];

const NEON_PALETTE_LIGHT = [
  "hsl(0, 100%, 40%)",    
  "hsl(15, 100%, 40%)",   
  "hsl(30, 100%, 40%)",   
  "hsl(45, 100%, 35%)",   
  "hsl(60, 100%, 30%)",   
  "hsl(75, 100%, 35%)",   
  "hsl(90, 100%, 35%)",   
  "hsl(105, 100%, 35%)",  
  "hsl(120, 100%, 35%)",  
  "hsl(135, 100%, 35%)",  
  "hsl(150, 100%, 35%)",  
  "hsl(165, 100%, 35%)",  
  "hsl(180, 100%, 35%)",  
  "hsl(195, 100%, 40%)",  
  "hsl(210, 100%, 40%)",  
  "hsl(225, 100%, 40%)",  
  "hsl(240, 100%, 40%)",  
  "hsl(255, 100%, 40%)",  
  "hsl(270, 100%, 40%)",  
  "hsl(285, 100%, 40%)",  
  "hsl(300, 100%, 40%)",  
  "hsl(315, 100%, 40%)",  
  "hsl(330, 100%, 40%)",  
  "hsl(345, 100%, 40%)"   
];

export function generateColor(str) {
  const hash = hashCode(str);
   
  const palette = state.darkModeEnabled ? NEON_PALETTE : NEON_PALETTE_LIGHT;
  const index = Math.abs(hash) % palette.length;
  return palette[index];
}

function _getElementDimensions(str) {
  const tempEl = document.createElement("div");
  tempEl.classList.add("syllable");
  tempEl.textContent = str;
  tempEl.style.visibility = "hidden";
  tempEl.style.position = "absolute";
  document.body.appendChild(tempEl);

  const elWidth = tempEl.offsetWidth;
  const elHeight = tempEl.offsetHeight;
  document.body.removeChild(tempEl);
  return { elWidth, elHeight };
}

function _hashStream(seed, count) {
  let h = hashCode(String(seed));
  const out = [];
  for (let i = 0; i < count; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h = h >>> 0;
    out.push(h);
  }
  return out;
}

function _randRange(stream, index, min, max) {
  const span = max - min;
  return min + ((stream[index] % 100000) / 100000) * span;
}

function _buildPoints(stream, shapeKind, sides, radius, rot) {
  const points = [];
  const cx = 0;
  const cy = 0;

  if (shapeKind === 0) {
    for (let i = 0; i < sides; i++) {
      const angle =
        rot + (i * Math.PI * 2) / sides + _randRange(stream, 10 + i, -0.28, 0.28);
      const r = radius * _randRange(stream, 20 + i, 0.62, 1.0);
      points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
    }
  } else if (shapeKind === 1) {
    const spikes = sides < 3 ? 5 : sides;
    for (let i = 0; i < spikes * 2; i++) {
      const angle = rot + (i * Math.PI) / spikes;
      const r =
        i % 2 === 0
          ? radius * _randRange(stream, 20 + i, 0.85, 1.0)
          : radius * _randRange(stream, 40 + i, 0.32, 0.52);
      points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
    }
  } else if (shapeKind === 2) {
    const blobSides = sides < 4 ? 6 : sides + 3;
    for (let i = 0; i < blobSides; i++) {
      const baseAngle = rot + (i * Math.PI * 2) / blobSides;
      const wobble = _randRange(stream, 60 + i, -0.35, 0.35);
      const r = radius * _randRange(stream, 80 + i, 0.55, 1.0);
      points.push([
        cx + Math.cos(baseAngle + wobble) * r,
        cy + Math.sin(baseAngle + wobble) * r,
      ]);
    }
  } else {
    const cross = Math.max(3, sides - 1);
    for (let i = 0; i < cross; i++) {
      const angle = rot + (i * Math.PI * 2) / cross;
      const r = radius * _randRange(stream, 100 + i, 0.7, 1.0);
      const inner = radius * _randRange(stream, 120 + i, 0.25, 0.45);
      points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
      points.push([
        cx + Math.cos(angle + Math.PI / cross) * inner,
        cy + Math.sin(angle + Math.PI / cross) * inner,
      ]);
    }
  }
  return points;
}

export function generateShape(str, seedStr = null) {
  const seed = seedStr || str;
  const stream = _hashStream(seed, 200);
  const shapeKind = stream[0] % 4;
  const sides = 3 + (stream[1] % 6);
  const rot = _randRange(stream, 2, 0, Math.PI * 2);
  const jitter = shapeKind === 2 ? 0.18 : 0.28;
  return { seed: String(seed), shapeKind, sides, rot, jitter, stream };
}

function _shapePointsNormalized(shape, width, height, padding) {
  const usableW = Math.max(1, width - padding * 2);
  const usableH = Math.max(1, height - padding * 2);
  const radius = Math.min(usableW, usableH) / 2;
  const raw = _buildPoints(
    shape.stream,
    shape.shapeKind,
    shape.sides,
    radius,
    shape.rot,
  );

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [px, py] of raw) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const rawW = Math.max(1, maxX - minX);
  const rawH = Math.max(1, maxY - minY);
  const scale = Math.min(usableW / rawW, usableH / rawH);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return raw.map(([px, py]) => [
    width / 2 + (px - midX) * scale,
    height / 2 + (py - midY) * scale,
  ]);
}

export function buildShapeSvg(str, width, height, options = {}) {
  const seed = options.seedStr || str;
  const shape = generateShape(str, seed);
  const padding = options.padding ?? 8;
  const strokeWidth = options.strokeWidth ?? 3;
  const color = options.color || "currentColor";
  const points = _shapePointsNormalized(shape, width, height, padding);

  const d =
    points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ") + " Z";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("shape-outline");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", String(strokeWidth));
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");

  svg.appendChild(path);
  return svg;
}

export function generatePosition(str, seedStr = null) {
  const hash = hashCode(seedStr || str);
  const marginTop = 180;  
  const marginBottom = 260;  
  const marginLeft = 100;
  const marginRight = 100;

  const { elWidth, elHeight } = _getElementDimensions(str);

  const { width: viewW, height: viewH } = getLayoutViewportSize();

  const maxX = viewW - marginRight - elWidth;
  const maxY = viewH - marginBottom - elHeight;
  const minX = marginLeft;
  const minY = marginTop;

  const rangeX = Math.max(1, maxX - minX + 1);
  const rangeY = Math.max(1, maxY - minY + 1);

  let x = minX + (Math.abs(hash) % rangeX);
  let y = minY + (Math.abs(hash >> 8) % rangeY);

  x = Math.min(Math.max(x, minX), maxX);
  y = Math.min(Math.max(y, minY), maxY);

  return { x, y };
}

export function getLayoutViewportSize() {
  const scaleWrap = document.getElementById("app-scale");
  if (scaleWrap && scaleWrap.offsetWidth > 0 && scaleWrap.offsetHeight > 0) {
    return { width: scaleWrap.offsetWidth, height: scaleWrap.offsetHeight };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function prettyPrintJson(jsonString) {
  try {
    const obj = JSON.parse(jsonString);
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return jsonString;
  }
}

function _cleanCard(card) {
  const q = (card.question || "").trim().toLowerCase();
  const a = (card.answer || "").trim().toLowerCase();
  if (q && a) {
    return {
      question: q,
      answer: a,
      hint: (card.hint || "").trim(),
    };
  }
  return null;
}

export function cleanJsonContent(contentArray) {
  return contentArray.map(_cleanCard).filter((item) => item !== null);
}

function _createCardKey(card) {
  const q = (card.question || "").trim().toLowerCase();
  const a = (card.answer || "").trim().toLowerCase();
  return q && a ? `${q}::${a}` : null;
}

export function deduplicateCards(cards, showAlert) {
  const qaKeys = new Set();
  let hasDuplicates = false;

  const filtered = cards.filter((card) => {
    const key = _createCardKey(card);
    if (!key) return false;

    if (qaKeys.has(key)) {
      hasDuplicates = true;
      return false;
    }
    qaKeys.add(key);
    return true;
  });

  if (hasDuplicates) {
    showAlert(getTranslation("DUPLICATE_CARDS_REMOVED"));
  }
  return filtered;
}

/**
 * Calculate Levenshtein distance between two strings.
 */
export function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
