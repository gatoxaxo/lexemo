import { state } from "./state.js";

export function calculateRetention(card) {
  if (!card.lastReview || card.s === undefined || card.s <= 0.1) return 1.0;
  const now = Date.now();
  const intervalDays = (now - card.lastReview) / (24 * 60 * 60 * 1000);
  return Math.exp(-intervalDays / card.s);
}

function _calculateNewStability(s, d, grade, isNew) {
  if (grade === 0) {
    return Math.max(0.1, s * 0.4);
  }

  if (isNew) {
    if (grade === 1) return 0.5;
    if (grade === 2) return 1.0;
    if (grade === 3) return 2.0;
  }

  let factor;
  let easeBonus;

  if (grade === 1) {
    factor = 1.2 * (1 - d);
    easeBonus = 0;
    return Math.max(s * factor, s + 0.1);
  }

  if (grade === 2) {
    factor = 1.5 * (1 - d);
    easeBonus = 1;
    return (s + easeBonus) * factor;
  }

  if (grade === 3) {
    factor = 2.0 * (1 - d);
    easeBonus = 2;
    return (s + easeBonus) * factor;
  }

  return s;
}

function _calculateNewDifficulty(d, grade) {
  const change = [0.1, 0.04, -0.06, -0.15][grade];
  return Math.max(0, Math.min(1, d + change));
}

function _calculateNewDueDate(s, grade) {
  if (grade === 0) {
    return Date.now() + 5 * 60 * 1000;
  }
  return Date.now() + s * 24 * 60 * 60 * 1000;
}

export function updateFsrsData(card, grade) {
  const isNew = !card.lastReview;

  card.s = card.s ?? 0.1;
  card.d = card.d ?? 0.5;

  const old_s = card.s;
  const old_d = card.d;

  card.s = _calculateNewStability(old_s, old_d, grade, isNew);
  card.d = _calculateNewDifficulty(old_d, grade);
  card.lastReview = Date.now();
  card.dueDate = _calculateNewDueDate(card.s, grade);
}

function _getDeckContent() {
  const deck = state.allDecks.find((d) => d.id === state.currentDeckId);
  return deck && deck.content ? deck.content : [];
}

function _getCardsToConsider() {
  const deckContent = _getDeckContent();
  if (deckContent.length === 0) return [];

  const queuedIds = new Set(state.sessionReviewQueue.map((c) => c.id));
  const availableCards = deckContent.filter((c) => !queuedIds.has(c.id));

  return availableCards.length > 0 ? availableCards : deckContent;
}

function _findBestDueCard(cards) {
  const today = Date.now();
  const dueCards = cards.filter((c) => c.dueDate && c.dueDate <= today);
  if (dueCards.length === 0) return null;

  let bestCard = null;
  let minRetention = Infinity;
  for (const card of dueCards) {
    const retention = calculateRetention(card);
    if (retention < minRetention) {
      minRetention = retention;
      bestCard = card;
    }
  }
  return bestCard;
}

function _findNewCard(cards) {
  const newCards = cards.filter((c) => !c.lastReview);
  if (newCards.length === 0) return null;
  return newCards[Math.floor(Math.random() * newCards.length)];
}

function _getNextReviewCard() {
  if (state.sessionReviewQueue.length > 0) {
    return state.sessionReviewQueue.shift();
  }
  return null;
}

export function pickFsrsCard() {
  const cardsToConsider = _getCardsToConsider();
  if (cardsToConsider.length === 0) return null;

  const dueCard = _findBestDueCard(cardsToConsider);
  if (dueCard) return dueCard;

  const newCard = _findNewCard(cardsToConsider);
  if (newCard) return newCard;

  const reviewCard = _getNextReviewCard();
  if (reviewCard) return reviewCard;

  return null;
}

export function calculateDeckStats(content) {
  const today = Date.now() + 2 * 60 * 1000;
  const stats = {
    total: content.length,
    newCount: 0,
    dueCount: 0,
    learningCount: 0,
    matureCount: 0,
  };

  for (const card of content) {
    if (!card.lastReview) {
      stats.newCount++;
    } else {
      if (card.dueDate && card.dueDate <= today) stats.dueCount++;
      if (card.s < 7) stats.learningCount++;
      else if (card.s >= 21) stats.matureCount++;
    }
  }
  return stats;
}

export function calculatePerformanceGrade({ reactionTime, typingTime }) {
  const r = reactionTime / 1000;
  const t = typingTime / 1000;
  const total = r + t;

  const thinkingWhileTyping = t > r * 2.5 && t > 4;
  const verySlow = total > 10;

  if (verySlow || thinkingWhileTyping) {
    return 1;
  }

  if (r < 2.5) {
    return 3;
  }

  if (r < 6.0) {
    return 2;
  }

  return 1;
}
