import { state, GROUP_SIZE, correctSound, wrongSound } from "./state.js";
import * as utils from "./utils.js";
import * as srs from "./srs.js";
import * as speech from "./speech.js";
import * as syllables from "./syllables.js";
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

// --- Cobertura de silabas (modo silaba) -----------------------------------
// No modo silaba a palavra nao sai do grupo quando o jogador acerta UMA
// silaba: ela fica ate TODAS as silabas terem sido acertadas, dando cobertura
// completa da palavra. Cada silaba acertada vale 1 ponto.
//
// O progresso vive em state.syllableCoverage, mapeado por question (e nao por
// referencia do objeto) porque o mesmo card aparece em syllableList,
// currentGroup e sessionReviewQueue como copias diferentes.

function _getPendentes(card) {
  if (!card) return null;
  const chave = card.question;
  if (!state.syllableCoverage[chave]) {
    // Primeira vez nesta palavra: todas as silabas pendentes.
    const total = syllables.dividirSilabas(chave).length;
    state.syllableCoverage[chave] = [];
    for (let i = 0; i < total; i++) state.syllableCoverage[chave].push(i);
  }
  return state.syllableCoverage[chave];
}

function _marcarSilabaAcertada(card, indice) {
  const pendentes = _getPendentes(card);
  if (!pendentes) return;
  const pos = pendentes.indexOf(indice);
  if (pos > -1) pendentes.splice(pos, 1);
}

function _palavraCoberta(card) {
  const pendentes = _getPendentes(card);
  return !!pendentes && pendentes.length === 0;
}

// Escolhe o proximo card do grupo.
// Modo silaba: prioriza palavras com silabas pendentes e so descarta a palavra
// quando todas foram acertadas.
// Modo normal: comportamento antigo (uma passada por card).
function _pickNextFromGroup() {
  if (!state.syllableModeEnabled) {
    const idx = _pickNonRepeatingRandomIndex(state.currentGroup);
    return { syllable: state.currentGroup[idx], index: idx };
  }

  // Descarta as palavras ja cobertas.
  const candidatos = [];
  for (let i = 0; i < state.currentGroup.length; i++) {
    if (!_palavraCoberta(state.currentGroup[i])) candidatos.push(i);
  }
  if (candidatos.length === 0) return null;

  const idx = candidatos[Math.floor(Math.random() * candidatos.length)];
  lastPickedIndex = idx;
  return { syllable: state.currentGroup[idx], index: idx };
}

function pickRandomSyllable() {
  _ensureGroupHasSyllables();
  if (state.currentGroup.length === 0) return null;
  return _pickNextFromGroup();
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
    let picked = pickRandomSyllable();
    // Modo silaba: quando todas as palavras do grupo ja foram cobertas, o
    // grupo ainda tem itens (eles so saem junto com a ultima silaba), entao
    // avanca para o proximo grupo em vez de encerrar a partida.
    if (!picked && state.syllableModeEnabled) {
      state.currentGroupIndex++;
      loadGroup(state.currentGroupIndex);
      picked = pickRandomSyllable();
    }
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
  // Modo silaba: a palavra e renderizada com UMA silaba destacada, montada em
  // spans separados (ver _renderSyllableHighlight). Nao entra no fluxo do
  // "prompt -> target" porque o estimulo nao e um texto unico.
  if (state.syllableModeEnabled) {
    _renderSyllableHighlight(questionEl);
    return;
  }

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

// Monta a palavra como spans: a silaba sorteada ganha a classe que a deixa
// mais clara. A cor-base vem do _applyFreeModeStyles (dica de cor quando
// ligada, cor padrao do texto quando nao). O destaque e SEMPRE mais claro:
// com dica de cor fica um tom claro da mesma matiz; sem dica fica cinza claro,
// que se distingue do preto/cinza-escuro padrao.
function _renderSyllableHighlight(questionEl) {
  questionEl.textContent = "";

  state.syllableParts.forEach((parte, i) => {
    const span = document.createElement("span");
    span.textContent = parte;
    if (i === state.syllableHighlightIndex) {
      span.classList.add("syllable-highlight");
      span.classList.add(
        state.colorHintEnabled ? "syllable-highlight-color" : "syllable-highlight-plain",
      );
    }
    questionEl.appendChild(span);
  });
}

// Alvo = o que o jogador deve digitar. Sem reverse: o answer (traducao).
// Com reverse: o question (o termo no idioma estudado).
// Modo silaba: a romanizacao da silaba destacada.
function _getTargetText() {
  if (state.syllableModeEnabled) {
    const partes = state.syllableParts;
    const i = state.syllableHighlightIndex;
    return i >= 0 && i < partes.length ? syllables.romanizar(partes[i]) : "";
  }
  return state.reverseModeEnabled
    ? state.currentSyllable.question
    : state.currentSyllable.answer;
}

// Comparacao de acerto. O modo reverso aceita as duas direcoes para nao
// punir quando question e answer sao iguais (decks sem traducao, ver notas).
function _isTargetMatch(typed) {
  const target = _getTargetText();

  if (state.syllableModeEnabled) {
    return typed === target;
  }

  if (typed === target) return true;
  return state.reverseModeEnabled && typed === state.currentSyllable.answer;
}

// Sorteia a silaba da rodada.
// Dentre as silabas AINDA PENDENTES da palavra (nunca repete uma ja acertada),
// o que garante cobertura total antes de a palavra sair do grupo.
function _setupSyllableRound() {
  state.syllableParts = [];
  state.syllableHighlightIndex = -1;
  if (!state.syllableModeEnabled || !state.currentSyllable) return;

  const partes = syllables.dividirSilabas(state.currentSyllable.question);
  state.syllableParts = partes;

  const pendentes = _getPendentes(state.currentSyllable);
  const disponiveis = pendentes && pendentes.length > 0
    ? pendentes
    : partes.map((_, i) => i);
  // escolherSilaba devolve um indice DENTRO da lista passada, entao precisa
  // ser traduzido para o indice da silaba (a lista pendente nao e 0..n-1).
  const posEscolhida = syllables.escolherSilaba(disponiveis);
  state.syllableHighlightIndex =
    posEscolhida >= 0 ? disponiveis[posEscolhida] : -1;
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

    // A posicao e derivada do par estimulo → alvo. No modo silaba o estimulo e
    // a palavra inteira (renderizada em spans, nao como texto unico).
    const prompt = state.syllableModeEnabled
      ? state.currentSyllable.question
      : state.reverseModeEnabled
        ? state.currentSyllable.answer
        : state.currentSyllable.question;
    const fullText = prompt + " → " + _getTargetText();
    const { x, y } = utils.generatePosition(fullText, prompt);
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

  // Sorteia a silaba ANTES de aplicar os estilos: _applyFreeModeStyles ->
  // _setSyllableText monta a palavra destacada.
  _setupSyllableRound();

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
      // Modo reverso: o estimulo e o answer do card, entao tocar o audio do
      // question aqui entregaria a resposta. O audio so sai quando o jogador
      // erra (ver _handleFreeModeIncorrect).
      // Modo silaba: a palavra E o estimulo (esta visivel), mas o TTS le a
      // palavra inteira e nao ajuda a isolar a silaba - o valor do exercicio
      // esta justamente em o jogador ler a silaba destacada. Por isso tambem
      // nao toca automaticamente; o audio sai no erro.
      if (!state.reverseModeEnabled && !state.syllableModeEnabled) {
        speech.speakCurrentSyllable();
      }
    }
  }
}

function _resetGameState() {
  state.score = 0;
  state.sessionReviewQueue = [];
  state.currentSyllable = null;
  state.currentGroupIndex = 0;
  state.currentGroup = [];
  // Zerar a cobertura para um restart comecar a palavra do inicio.
  state.syllableCoverage = {};
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

  // Modo silaba: a palavra permanece no grupo ate TODAS as silabas serem
  // acertadas. Cada acerto marca a silaba da rodada; so remove quando nao
  // sobrar nenhuma pendente.
  if (state.syllableModeEnabled) {
    _marcarSilabaAcertada(state.currentSyllable, state.syllableHighlightIndex);
    if (_palavraCoberta(state.currentSyllable)) {
      state.currentGroup.splice(state.currentSyllable.pickIndex, 1);
    }
  } else {
    state.currentGroup.splice(state.currentSyllable.pickIndex, 1);
  }

  updateScoreDisplay();

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

  // Modo reverso: o audio do question era a resposta, entao so toca no erro.
  // Modo silaba: idem - o audio sai no erro para reforcar o som da palavra
  // que o jogador nao conseguiu romanizacar.
  if (state.reverseModeEnabled || state.syllableModeEnabled) {
    state.isSpeechUnlocked = true;
    speech.speakCurrentSyllable(true);
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
