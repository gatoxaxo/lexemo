/**
 * SRS (Spaced Repetition System) - Adaptive Review Scheduler
 *
 * This is a heuristic-based adaptive scheduler, NOT the official FSRS algorithm. It is a custom SRS implementation.
 * Design goals: predictable, explainable, easy to adjust.
 */

import { state } from "./state.js";

// --- Global SRS Constants ---
const NEW_STEPS = [5 * 60 * 1000, 30 * 60 * 1000, 24 * 60 * 60 * 1000]; // 5m, 30m, 1d in ms
const LAPSE_STEPS = [5 * 60 * 1000, 30 * 60 * 1000, 6 * 60 * 60 * 1000]; // 5m, 30m, 6h in ms

const MIN_S = 0.15; // days
const MAX_S = 365; // days (1 year)
const MAX_GROWTH_PER_REVIEW = 2.5;
const MIN_SHRINK_PER_FAIL = 0.35;

/**
 * Calculate memory retention based on elapsed time since last review.
 * Uses exponential decay formula: R = exp(-t/s)
 */
export function calculateRetention(card) {
  if (!card.lastReview || card.s === undefined) return 1.0;
  const now = Date.now();
  const intervalDays = (now - card.lastReview) / (24 * 60 * 60 * 1000);
  const s = Math.max(MIN_S, card.s);
  return Math.exp(-intervalDays / s);
}

/**
 * Update stability and difficulty based on expected vs observed retention.
 * s_new = s_old * (1 + bonus * (1 - R_predicted) * (1 - d))
 */
function _updateStabilityAndDifficulty(card, grade, intervalDays) {
  const predictedRetention = calculateRetention(card);
  const isCorrect = grade > 0;
  
  // Difficulty update: smoothly adjust based on "surprise"
  // Increase d on fail, decrease on success
  const surprise = isCorrect ? (1 - predictedRetention) : predictedRetention;
  const dChange = isCorrect ? -0.1 * surprise : 0.2 * surprise;
  card.d = Math.max(0, Math.min(1, card.d + dChange));

  if (isCorrect) {
    // Stability growth
    // Grade 3 (Easy) gives a larger bonus than Grade 2 (Good) or 1 (Hard)
    const gradeBonus = [0, 0.5, 1.0, 2.0][grade]; 
    
    // Growth factor formula: 1 + bonus * (1 - R_predicted) * (1 - d)
    // We use (1 - predictedRetention) because success when retention was low is more valuable
    const growthFactor = 1 + gradeBonus * (1 - predictedRetention) * (1 - card.d);
    
    const cappedGrowth = Math.min(MAX_GROWTH_PER_REVIEW, growthFactor);
    card.s = Math.min(MAX_S, card.s * cappedGrowth);
  } else {
    // Stability shrink (handled in updateSrsData for relearning, but we can also do it here if needed)
    // For now, updateSrsData handles the state transition and stability reset.
  }
}

/**
 * Update card's SRS data after a review.
 * Handles state transitions: new -> learning -> review <-> relearning
 */
export function updateSrsData(card, grade) {
  const now = Date.now();
  
  // Initialize fields for backward compatibility
  if (!card.state) {
    if (!card.lastReview) {
      card.state = "new";
    } else {
      card.state = "review";
    }
  }
  if (card.s === undefined) card.s = MIN_S;
  if (card.d === undefined) card.d = 0.5;
  if (card.step === undefined) card.step = 0;
  if (card.lapses === undefined) card.lapses = 0;

  const isCorrect = grade > 0;
  const intervalDays = card.lastReview ? (now - card.lastReview) / (24 * 60 * 60 * 1000) : 0;

  if (card.state === "new" || card.state === "learning") {
    if (isCorrect) {
      card.step++;
      if (card.step >= NEW_STEPS.length) {
        // Graduate to review
        card.state = "review";
        card.s = 1.0; // Initial stability after learning
        card.dueDate = now + card.s * 24 * 60 * 60 * 1000;
      } else {
        card.state = "learning";
        card.dueDate = now + NEW_STEPS[card.step];
      }
    } else {
      // Failed in learning: reset steps
      card.step = 0;
      card.dueDate = now + NEW_STEPS[0];
    }
  } else if (card.state === "review") {
    if (isCorrect) {
      _updateStabilityAndDifficulty(card, grade, intervalDays);
      card.dueDate = _calculateReviewDueDate(card);
    } else {
      // Lapse
      card.lapses++;
      card.state = "relearning";
      card.step = 0;
      card.dueDate = now + LAPSE_STEPS[0];
    }
  } else if (card.state === "relearning") {
    if (isCorrect) {
      card.step++;
      if (card.step >= LAPSE_STEPS.length) {
        // Return to review
        card.state = "review";
        // Shrink stability on lapse
        card.s = Math.max(MIN_S, card.s * MIN_SHRINK_PER_FAIL);
        card.dueDate = _calculateReviewDueDate(card);
      } else {
        card.dueDate = now + LAPSE_STEPS[card.step];
      }
    } else {
      // Failed in relearning: reset steps
      card.step = 0;
      card.dueDate = now + LAPSE_STEPS[0];
    }
  }

  card.lastReview = now;
}

function _calculateReviewDueDate(card) {
  // tDays = -s * ln(TARGET_RETENTION)
  let intervalDays = -card.s * Math.log(state.targetRetention);

  // Apply Fuzz (random variation) to intervals > 1 day
  // This prevents cards learned together from sticking together forever
  if (intervalDays > 1.0) {
    const fuzzFactor = 0.95 + Math.random() * 0.1; // 0.95 to 1.05 (+/- 5%)
    intervalDays *= fuzzFactor;
  }

  return Date.now() + intervalDays * 24 * 60 * 60 * 1000;
}

/**
 * Calculate grade based on reaction time, typing speed, and fluency.
 * Grade 3 = Easy, Grade 2 = Good, Grade 1 = Hard
 */
export function calculatePerformanceGrade(signals, rtEma, cpsEma) {
  const { reactionTime, cps, backspaceCount, maxPause, totalTime, charCount } = signals;

  // Reaction time thresholds: mix of relative (EMA) and absolute
  const isFastReaction = reactionTime < rtEma * 0.8 || reactionTime < 0.8;
  const isSlowReaction = reactionTime > rtEma * 1.4 || reactionTime > 4.0;

  // CPS threshold: Only trust CPS if the word has at least 3 characters
  // Otherwise, typing speed is too volatile for short words
  const isFastTyping = charCount >= 3 ? (cps >= cpsEma * 0.9) : true;
  const isSlowTyping = charCount >= 3 ? (cps < cpsEma * 0.6) : false;

  // Fluency indicators
  const isFluent = backspaceCount === 0 && maxPause < 1.2;
  const isStruggling = backspaceCount > 1 || maxPause > 2.5 || totalTime > 12.0;

  if (isFastReaction && isFastTyping && isFluent) {
    return 3; // Easy
  }

  if (isSlowReaction || isSlowTyping || isStruggling) {
    return 1; // Hard
  }

  return 2; // Good
}

// ============================================================================
// Card Selection
// ============================================================================

// Track reviews to throttle new cards
let _reviewsSinceNewCard = 0;
let _newCardsThisSession = 0;
const NEW_CARD_INTERVAL = 4; 

export function resetSessionStats() {
  _newCardsThisSession = 0;
  _reviewsSinceNewCard = 0;
}

function _getDeckContent() {
  const deck = state.allDecks.find((d) => d.id === state.currentDeckId);
  return deck && deck.content ? deck.content : [];
}

/**
 * Pick next card with proper priority:
 * 1. Due cards in relearning
 * 2. Due cards in learning
 * 3. Due cards in review (sorted by lowest predicted retention)
 * 4. New cards (throttled)
 */
export function pickSrsCard() {
  const deckContent = _getDeckContent();
  if (deckContent.length === 0) return null;

  const now = Date.now();

  // Helper to find due cards in a specific state
  const findDueByState = (s) => deckContent.filter(c => c.state === s && c.dueDate && c.dueDate <= now);

  // 1. Due cards in relearning
  const relearning = findDueByState("relearning");
  if (relearning.length > 0) return relearning[0];

  // 2. Due cards in learning
  const learning = findDueByState("learning");
  if (learning.length > 0) return learning[0];

  // 3. Due cards in review
  const review = findDueByState("review")
    .sort((a, b) => calculateRetention(a) - calculateRetention(b));
  
  if (review.length > 0) {
    _reviewsSinceNewCard++;
    return review[0];
  }

  // 4. New cards (throttled)
  const newCards = deckContent.filter(c => !c.state || c.state === "new");
  if (newCards.length > 0 && _reviewsSinceNewCard >= NEW_CARD_INTERVAL && _newCardsThisSession < state.newCardLimit) {
    _reviewsSinceNewCard = 0;
    _newCardsThisSession++;
    return newCards[Math.floor(Math.random() * newCards.length)];
  }

  // Fallback: if only new cards left
  if (newCards.length > 0 && review.length === 0 && learning.length === 0 && relearning.length === 0 && _newCardsThisSession < state.newCardLimit) {
    _newCardsThisSession++;
    return newCards[Math.floor(Math.random() * newCards.length)];
  }

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
    const cardState = card.state || (!card.lastReview ? "new" : "review");
    if (cardState === "new") {
      stats.newCount++;
    } else {
      if (card.dueDate && card.dueDate <= today) stats.dueCount++;
      if (card.s < 7) stats.learningCount++;
      else if (card.s >= 21) stats.matureCount++;
    }
  }
  return stats;
}
