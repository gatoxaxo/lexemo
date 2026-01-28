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

export function generatePosition(str, seedStr = null) {
  const hash = hashCode(seedStr || str);
  const marginTop = 120;  
  const marginBottom = 180;  
  const marginLeft = 100;
  const marginRight = 100;

  const { elWidth, elHeight } = _getElementDimensions(str);

  const maxX = window.innerWidth - marginRight - elWidth;
  const maxY = window.innerHeight - marginBottom - elHeight;
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
