import { state, GROUP_SIZE, correctSound, wrongSound } from "./state.js";
import * as utils from "./utils.js";
import * as srs from "./srs.js";
import * as speech from "./speech.js";
import { timerMode } from "./timerMode.js";
import {
  dom,
  showCongrats,
  updateScoreDisplay,
  createParticle,
  showCustomAlert,
  showCustomConfirm,
  openEditCardModal,
  saveGlobalSettings,
} from "./ui.js";
import { getTranslation } from "./i18n/i18n.js";

let lastPickedIndex = -1;

function loadGroup(index) {
  const start = index * GROUP_SIZE;
  state.currentGroup = state.syllableList.slice(start, start + GROUP_SIZE);

  if (
    state.currentGroup.length === 0 &&
    state.syllableList.length > 0 &&
    !state.evaluativeModeEnabled
  ) {
    showCongrats(false, startGame);
  }
}

function _ensureGroupHasSyllables() {
  if (state.currentGroup.length === 0) {
    state.currentGroupIndex++;
    loadGroup(state.currentGroupIndex);
  }
}

function _pickNonRepeatingRandomIndex(group) {
  let randomIndex;
  do {
    randomIndex = Math.floor(Math.random() * group.length);
  } while (group.length > 1 && randomIndex === lastPickedIndex);
  lastPickedIndex = randomIndex;
  return randomIndex;
}

function pickRandomSyllable() {
  _ensureGroupHasSyllables();
  if (state.currentGroup.length === 0) return null;

  const randomIndex = _pickNonRepeatingRandomIndex(state.currentGroup);
  return { syllable: state.currentGroup[randomIndex], index: randomIndex };
}

function _setupSyllable() {
  state.userTyped = "";
  state.hintUsed = false;
  state.hasSpokenCurrentCard = false;
  state.lastKeyTime = 0;
  state.backspaceCount = 0;
  state.maxPause = 0;
  // Trocar de card encerra o ditado pendente (o texto era do card anterior).
  state.holdToTalkActive = false;
  document.body.classList.remove("no-select");
  if (state.currentSyllableElement) state.currentSyllableElement.remove();
}

function _pickNextCard() {
  if (state.evaluativeModeEnabled) {
    state.currentSyllable = srs.pickSrsCard();
    if (!state.currentSyllable) {
      showCongrats(true, startGame);
      return false;
    }
  } else {
    const picked = pickRandomSyllable();
    if (!picked) return false;
    state.currentSyllable = picked.syllable;
    state.currentSyllable.pickIndex = picked.index;
  }
  return true;
}

function _showContextHint() {
  if (state.currentSyllable.hint && !state.pronunciationModeEnabled) {
    dom.contextHintText.textContent = state.currentSyllable.hint;
    dom.contextHintBox.style.display = "flex";
  } else {
    dom.contextHintBox.style.display = "none";
  }
}



function _createSyllableElement() {
  const syllableEl = document.createElement("div");
  syllableEl.classList.add("syllable");
  syllableEl.style.position = "absolute";
  return syllableEl;
}

function _createTranslationElement() {
  const translationEl = document.createElement("span");
  translationEl.classList.add("translation");
  translationEl.textContent = "";
  return translationEl;
}

function _createQuestionElement() {
  const questionEl = document.createElement("span");
  questionEl.classList.add("question-text");
  return questionEl;
}


function _applySrsStyles(syllableEl, translationEl) {
  syllableEl.style.color = "inherit";
  syllableEl.style.textShadow = "0 0 2px currentColor";
  translationEl.style.color = "inherit";

  translationEl.style.textShadow = "0 0 2px currentColor";
  syllableEl.style.left = "50%";
  syllableEl.style.top = "50%";
  syllableEl.style.transform = "translate(-50%, -50%)";
}

function _setSyllableText(questionEl) {
  // Modo reverso: o ESTIMULO passa a ser o answer do card.
  const prompt = state.reverseModeEnabled
    ? state.currentSyllable.answer
    : state.currentSyllable.question;
  const target = _getTargetText();

  let placeholder = target.length - state.answerTipLetters > 0 ? "~" : "";
  if (state.answerTipLetters > 0 && !state.pronunciationModeEnabled) {
    questionEl.textContent =
      prompt + " → " + target.substring(0, state.answerTipLetters) + placeholder;
  } else {
    questionEl.textContent = prompt;
  }
}

// Alvo = o que o jogador deve digitar. Sem reverse: o answer (traducao).
// Com reverse: o question (o termo no idioma estudado).
function _getTargetText() {
  return state.reverseModeEnabled
    ? state.currentSyllable.question
    : state.currentSyllable.answer;
}

// Comparacao de acerto. O modo reverso aceita as duas direcoes para nao
// punir quando question e answer sao iguais (decks sem traducao, ver notas).
function _isTargetMatch(typed) {
  const target = _getTargetText();
  if (typed === target) return true;
  return state.reverseModeEnabled && typed === state.currentSyllable.answer;
}


function _applyFreeModeStyles(syllableEl, translationEl) {
  const color = utils.generateColor(state.currentSyllable.question);
  const hintColor =
    state.colorHintEnabled && !state.pronunciationModeEnabled
      ? color
      : "inherit";
  syllableEl.style.color = hintColor;
  syllableEl.style.textShadow = "0 0 2px currentColor";
  translationEl.style.color = hintColor;
  translationEl.style.textShadow = "0 0 2px currentColor";

  _setSyllableText(state.questionElement);

  if (state.positionHintEnabled && !state.pronunciationModeEnabled) {

    const fullText = state.reverseModeEnabled
      ? state.currentSyllable.answer + " → " + state.currentSyllable.question
      : state.currentSyllable.question + " → " + state.currentSyllable.answer;
    const { x, y } = utils.generatePosition(
      fullText,
      state.reverseModeEnabled
        ? state.currentSyllable.answer
        : state.currentSyllable.question,
    );
    syllableEl.style.left = x + "px";
    syllableEl.style.top = y + "px";
  } else {
    syllableEl.style.left = "50%";
    syllableEl.style.top = "50%";
    syllableEl.style.transform = "translate(-50%, -50%)";
  }
}

function _appendSyllableToDom(syllableEl, questionEl, translationEl) {
  syllableEl.appendChild(questionEl);
  syllableEl.appendChild(translationEl);
  state.currentSyllableElement = syllableEl;
  state.questionElement = questionEl;
  state.translationElement = translationEl;
  dom.gameArea.appendChild(syllableEl);
}


export function displaySyllable() {
  _setupSyllable();
  if (!_pickNextCard()) return;

  _showContextHint();

  const syllableEl = _createSyllableElement();
  const questionEl = _createQuestionElement();
  const translationEl = _createTranslationElement();

  state.questionElement = questionEl;

  if (state.evaluativeModeEnabled) {
    _applySrsStyles(syllableEl, translationEl);
    state.questionElement.textContent = state.currentSyllable.question;
  } else {
    _applyFreeModeStyles(syllableEl, translationEl);
  }
  _appendSyllableToDom(syllableEl, questionEl, translationEl);
  
  if (state.hearingModeEnabled && state.reverseModeEnabled) {
    // hearing + reverse = ler/som do texto de entrada (o answer) nao faz
    // sentido: o estimulo auditivo e a traducao, que nao tem audio util.
    // Por isso o hearing e ignorado quando o reverse esta ligado.
    console.warn("hearingMode ignorado: incompativel com reverseMode");
  }

  if (state.hearingModeEnabled && !state.evaluativeModeEnabled && !state.reverseModeEnabled) {
    questionEl.style.opacity = "0";
  }



  if (state.pronunciationModeEnabled) {
    if (state.utterance) {
      state.utterance.onend = null;
      state.utterance.onerror = null;
    }
    setTimeout(speech.startRecognition, 200);
  } else {
    if (state.autoplayEnabled) {
      speech.speakCurrentSyllable();
    }
  }
}

function _resetGameState() {
  state.score = 0;
  state.sessionReviewQueue = [];
  state.currentSyllable = null;
  state.currentGroupIndex = 0;
  state.currentGroup = [];
  srs.resetSessionStats();
}

function _cleanupGameUI() {
  if (state.currentSyllableElement) state.currentSyllableElement.remove();
  if (state.translationElement) state.translationElement.remove();
  dom.contextHintBox.style.display = "none";
}

function _initializeDeckMode() {
  if (state.evaluativeModeEnabled) {
    state.cardStartTime = Date.now();
  } else {
    // Apply level scope if set
    if (state.originalSyllableList) {
      if (state.levelScopeStart && state.levelScopeEnd) {
        const startIndex = (state.levelScopeStart - 1) * GROUP_SIZE;
        const endIndex = state.levelScopeEnd * GROUP_SIZE;
        state.syllableList = state.originalSyllableList.slice(startIndex, endIndex);
      } else {
        state.syllableList = [...state.originalSyllableList];
      }
    }
    
    if (state.randomToggleEnabled) {
      state.syllableList = utils.shuffle([...state.syllableList]);
    }
    loadGroup(state.currentGroupIndex);
  }
}

/**
 * Stop all active game processes and clear state.
 */
export function stopGame() {
  if (state.speechTimeout) {
    clearTimeout(state.speechTimeout);
    state.speechTimeout = null;
  }
  timerMode.stop();
  speech.stopRecognition();
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
  }
  _cleanupGameUI();
  _resetGameState();
}

export function startGame() {
  // Always stop any current game first
  stopGame();

  if (!state.syllableList || state.syllableList.length === 0) {
    if (state.isLevelSkipActive) {
      showCustomAlert(getTranslation("NO_CARDS_FOR_LEVEL_SCOPE"));
      state.isLevelSkipActive = false;
    }
    return;
  }

  if (state.timerModeEnabled) {
    if (state.originalSyllableList) {
      if (state.levelScopeStart && state.levelScopeEnd) {
        const startIndex = (state.levelScopeStart - 1) * GROUP_SIZE;
        const endIndex = state.levelScopeEnd * GROUP_SIZE;
        state.syllableList = state.originalSyllableList.slice(
          startIndex,
          endIndex,
        );
      } else {
        state.syllableList = [...state.originalSyllableList];
      }
    }

    if (state.randomToggleEnabled) {
      state.syllableList = utils.shuffle([...state.syllableList]);
    }

    timerMode.start(startGame);
    return;
  }

  _initializeDeckMode();

  updateScoreDisplay();
  displaySyllable();
}

export function handleKeyInput(key) {
  if (state.pronunciationModeEnabled) return;
  if (!state.firstKeyTime) state.firstKeyTime = Date.now();
  state.userTyped += key;
  if (state.translationElement) {
    state.translationElement.textContent = state.userTyped;
  }
}

export function handleBackspace() {
  if (state.pronunciationModeEnabled) return;
  state.userTyped = state.userTyped.slice(0, -1);
  if (state.translationElement) {
    state.translationElement.textContent = state.userTyped;
  }
}

export function handleVoiceRepeat() {
  if (state.timerModeEnabled) return;
  state.isSpeechUnlocked = true;
  speech.speakCurrentSyllable(true);
}

function _playCorrectFeedback() {
  if (state.correctSoundEnabled) {
    correctSound.currentTime = 0;
    correctSound.play();
  }
  if (state.currentSyllableElement) {
    createParticle(state.currentSyllableElement);
  }
}

function _updateScoreAndGroup() {
  state.score++;
  updateScoreDisplay();
  state.currentGroup.splice(state.currentSyllable.pickIndex, 1);

  if (state.currentGroup.length === 0) {
    state.currentGroupIndex++;
    loadGroup(state.currentGroupIndex);
  }
}

export function handleCorrectPronunciation() {
  if (!state.hintUsed) {
    _playCorrectFeedback();
    _updateScoreAndGroup();
  }

  state.hintUsed = false;

  if (state.translationElement) state.translationElement.textContent = "";
  if (state.currentSyllableElement) state.currentSyllableElement.remove();
  speech.stopRecognition();
  displaySyllable();
}

export function handlePronunciationEnter() {
  if (state.wrongSoundEnabled) {
    wrongSound.currentTime = 0;
    wrongSound.play();
  }

  if (state.speechTimeout) {
    clearTimeout(state.speechTimeout);
  }
  state.speechTimeout = setTimeout(() => speech.speakCurrentSyllable(true), 200);

  if (state.translationElement) {
    state.translationElement.textContent = state.currentSyllable.question;
    state.translationElement.dataset.isHint = "true";
  }
  state.hintUsed = true;
}

function _handleSrsRepeat() {
  state.hintUsed = false;
  state.userTyped = "";
  if (state.translationElement) state.translationElement.textContent = "";
  if (state.currentSyllableElement) state.currentSyllableElement.remove();

  state.cardStartTime = Date.now();
  state.firstKeyTime = 0;

  displaySyllable();
}

function _calculateSrsTimings() {
  const endTime = Date.now();
  const reactionTime = state.firstKeyTime
    ? (state.firstKeyTime - state.cardStartTime) / 1000
    : (endTime - state.cardStartTime) / 1000;
  
  const totalTime = (endTime - state.cardStartTime) / 1000;
  const typingTime = state.firstKeyTime ? (endTime - state.firstKeyTime) / 1000 : 0;
  
  const charCount = state.currentSyllable.answer.length;
  const cps = typingTime > 0 ? charCount / typingTime : 0;

  const signals = {
    reactionTime,
    typingTime,
    totalTime,
    cps,
    backspaceCount: state.backspaceCount,
    maxPause: state.maxPause,
    charCount
  };

  state.firstKeyTime = 0;
  state.lastKeyTime = 0;
  state.backspaceCount = 0;
  state.maxPause = 0;

  return signals;
}

function _handleSrsIncorrect() {
  if (state.wrongSoundEnabled) {
    wrongSound.currentTime = 0;
    wrongSound.play();
  }
  if (state.translationElement) {
    state.translationElement.textContent = state.currentSyllable.answer;
  }
  state.userTyped = "";
  state.hintUsed = true;
  state.sessionReviewQueue.push(state.currentSyllable);
  state.cardStartTime = Date.now();
  state.firstKeyTime = 0;
}

function _handleSrsCorrect() {
  _playCorrectFeedback();
  state.score++;
  if (state.translationElement) state.translationElement.textContent = "";
  if (state.currentSyllableElement) state.currentSyllableElement.remove();

  state.cardStartTime = Date.now();
  state.firstKeyTime = 0;

  displaySyllable();
}

export function handleSrsEnter() {
  if (state.hintUsed) {
    _handleSrsRepeat();
    return;
  }

  const userTyped = state.userTyped.trim().toLowerCase();
  const answer = state.currentSyllable.answer.trim().toLowerCase();
  const isCorrect = userTyped === answer;
  const isMature = state.currentSyllable.s >= 21;
  const isTypo = isMature && utils.levenshteinDistance(userTyped, answer) === 1;

  let grade = 0;

  if (isCorrect || isTypo) {
    const signals = _calculateSrsTimings();
    
    // Update User Baselines (EMA)
    // Use a higher alpha (0.4) for the first 20 reviews to accelerate calibration
    const alpha = state.totalReviews < 20 ? 0.4 : 0.1;
    state.rtEma = (1 - alpha) * state.rtEma + alpha * signals.reactionTime;
    if (signals.cps > 0) {
      state.cpsEma = (1 - alpha) * state.cpsEma + alpha * signals.cps;
    }
    state.totalReviews++;
    saveGlobalSettings();

    grade = srs.calculatePerformanceGrade(signals, state.rtEma, state.cpsEma);
    const finalGrade = isTypo ? 1 : grade;

    srs.updateSrsData(state.currentSyllable, finalGrade);
    _handleSrsCorrect(finalGrade);
  } else {
    grade = 0;
    srs.updateSrsData(state.currentSyllable, grade);
    _handleSrsIncorrect();
  }

  updateScoreDisplay();
}

function _handleFreeModeCorrect() {
  if (!state.hintUsed) {
    _playCorrectFeedback();
    _updateScoreAndGroup();
  }
  if (state.translationElement) state.translationElement.textContent = "";
  if (state.currentSyllableElement) state.currentSyllableElement.remove();
  displaySyllable();
}

function _handleFreeModeIncorrect() {
  if (state.translationElement) {
    state.translationElement.textContent = _getTargetText();
  }

  if (state.wrongSoundEnabled) {
    wrongSound.currentTime = 0;
    wrongSound.play();
  }
  state.userTyped = "";
  state.hintUsed = true;

  if (state.restartOnWrongEnabled) {
    setTimeout(() => {
      showCustomAlert(getTranslation("WRONG_ANSWER_RESTART"), () => {
        startGame();
      });
    }, 100);
  }
}

function _deleteCurrentCardLogic() {
  if (!state.currentSyllable || !state.currentDeckId) return false;

  const deck = state.allDecks.find((d) => d.id === state.currentDeckId);
  if (!deck) return false;

  const q = state.currentSyllable.question;
  const a = state.currentSyllable.answer;

  let cardRemoved = false;

  const cardIndexInDeck = deck.content.findIndex(
    (c) => c.question === q && c.answer === a,
  );
  if (cardIndexInDeck > -1) {
    deck.content.splice(cardIndexInDeck, 1);
    cardRemoved = true;
  }
  const cardIndexInSession = state.syllableList.findIndex(
    (c) => c.question === q && c.answer === a,
  );
  if (cardIndexInSession > -1) {
    state.syllableList.splice(cardIndexInSession, 1);
  }

  const cardIndexInGroup = state.currentGroup.findIndex(
    (c) => c.question === q && c.answer === a,
  );
  if (cardIndexInGroup > -1) {
    state.currentGroup.splice(cardIndexInGroup, 1);
  }

  const cardIndexInQueue = state.sessionReviewQueue.findIndex(
    (c) => c.question === q && c.answer === a,
  );
  if (cardIndexInQueue > -1) {
    state.sessionReviewQueue.splice(cardIndexInQueue, 1);
  }

  return cardRemoved;
}

export function handleFreeModeEnter() {
  if (_isTargetMatch(state.userTyped)) {
    _handleFreeModeCorrect();
  } else {
    _handleFreeModeIncorrect();
  }
}

export function handleDeleteCurrentCardRequest() {
  if (!state.currentSyllable) return;

  const cardQuestion = state.currentSyllable.question;
  const msg = getTranslation("DELETE_CARD_CONFIRMATION").replace(
    "{0}",
    cardQuestion,
  );

  showCustomConfirm(msg, () => {
    if (_deleteCurrentCardLogic()) {
      document.dispatchEvent(new CustomEvent("cardDeleted"));
      updateScoreDisplay();

      if (speechSynthesis.speaking) speechSynthesis.cancel();
      speech.stopRecognition();

      displaySyllable();
    } else {
      showCustomAlert(getTranslation("ERROR_CARD_NOT_FOUND"));
    }
  });
}

export function handleEditCurrentCardRequest() {
  if (!state.currentSyllable || !state.currentDeckId) return;

  speech.stopRecognition();
  if (speechSynthesis.speaking) speechSynthesis.cancel();

  openEditCardModal(state.currentSyllable);
}

export function updateCurrentCard(newData) {
  if (!state.currentSyllable) return;

  const oldQ = state.currentSyllable.question;
  const oldA = state.currentSyllable.answer;
  const newQ = newData.question;
  const newA = newData.answer;

  state.currentSyllable.question = newQ;
  state.currentSyllable.answer = newA;
  state.currentSyllable.hint = newData.hint;

  if (newQ !== oldQ || newA !== oldA) {
    state.currentSyllable.s = 0.1;
    state.currentSyllable.d = 0.5;
    state.currentSyllable.lastReview = null;
    state.currentSyllable.dueDate = null;
  }

  document.dispatchEvent(new CustomEvent("cardUpdated"));

  displaySyllable();
}

export function setGameScope(scopeInput) {
  const maxLevel = Math.ceil(state.originalSyllableList.length / GROUP_SIZE);
  if (maxLevel === 0) return;

  let startLevel, endLevel;

  const parts = scopeInput.match(/^(\d+)-(\d+)$/);

  if (parts) {
    startLevel = parseInt(parts[1], 10);
    endLevel = parseInt(parts[2], 10);
  } else if (/^\d+$/.test(scopeInput)) {
    startLevel = parseInt(scopeInput, 10);
    endLevel = maxLevel;
  } else {
    console.warn(`Invalid level scope: ${scopeInput}`);
    return;
  }

  if (isNaN(startLevel) || startLevel <= 0) startLevel = 1;
  if (isNaN(endLevel) || endLevel <= 0) endLevel = maxLevel;

  if (startLevel > endLevel) {
    [startLevel, endLevel] = [endLevel, startLevel];
  }

  if (startLevel > maxLevel) {
    showCustomAlert(getTranslation("NO_CARDS_FOR_LEVEL_SCOPE"));
    return;
  }

  if (startLevel > maxLevel) startLevel = maxLevel;
  if (endLevel > maxLevel) endLevel = maxLevel;

  state.levelScopeStart = startLevel;
  state.levelScopeEnd = endLevel;

  const startIndex = (startLevel - 1) * GROUP_SIZE;
  const endIndex = endLevel * GROUP_SIZE;

  state.syllableList = state.originalSyllableList.slice(startIndex, endIndex);

  if (speechSynthesis.speaking) speechSynthesis.cancel();
  speech.stopRecognition();
  if (state.currentSyllableElement) state.currentSyllableElement.remove();
  if (state.translationElement) state.translationElement.remove();
  dom.contextHintBox.style.display = "none";

  state.isLevelSkipActive = true;

  startGame();

  setTimeout(() => {
    state.isLevelSkipActive = false;
  }, 100);
}
