import { state } from "./state.js";
import { dom, showCustomAlert, isModalOpen } from "./ui.js";
import { samePronunciation } from "./utils.js";
import { getTranslation } from "./i18n/i18n.js";

export function populateVoices() {
  const voices = speechSynthesis.getVoices();
  dom.voiceSelect.innerHTML = `<option value="none">${getTranslation("NONE")}</option>`;
  voices.forEach((voice, index) => {
    const opt = document.createElement("option");
    opt.value = index;
    opt.textContent = `${voice.name} (${voice.lang})`;
    dom.voiceSelect.appendChild(opt);
  });
}

function _checkSpeechRecognitionSupport() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showCustomAlert(getTranslation("SPEECH_API_NOT_SUPPORTED"));
    return null;
  }
  return SpeechRecognition;
}

function _configureRecognition(recognition) {
  recognition.continuous = true;
  recognition.interimResults = true;
}

function _handleRecognitionResult(event) {
  if (!state.isRecognizing || !state.translationElement) {
    return;
  }

  let interimTranscript = "";
  let finalTranscript = "";

  for (let i = event.resultIndex; i < event.results.length; ++i) {
    const transcript = event.results[i][0].transcript;
    if (event.results[i].isFinal) {
      finalTranscript += transcript;
    } else {
      interimTranscript = transcript;
    }
  }

  const displayTranscript = (finalTranscript + interimTranscript).trim();
  state.translationElement.textContent = displayTranscript;

  if (displayTranscript) {
    const success = samePronunciation(
      state.currentSyllable.question,
      displayTranscript,
    );

    if (success) {
      stopRecognition();
      document.dispatchEvent(new CustomEvent("pronunciationSuccess"));
    }
  }
}

function _handleRecognitionEnd() {
  state.isRecognizing = false;

  if (isModalOpen()) {
    return;
  }

  if (state.recognitionStoppedManually) {
    state.recognitionStoppedManually = false;
    return;
  }

  const shouldRestart = state.pronunciationModeEnabled && state.currentSyllable;
  if (shouldRestart) {
    setTimeout(startRecognition, 50);
  }
}

function _handleRecognitionError(event) {
  console.error("Speech recognition error:", event.error);

  if (event.error === "not-allowed" || event.error === "service-not-allowed") {
    state.pronunciationModeEnabled = false;
    if (state.currentDeckId) {
      const deck = state.allDecks.find((d) => d.id === state.currentDeckId);
      if (deck) deck.settings.pronunciationModeEnabled = false;
    }
    showCustomAlert(getTranslation("MIC_PERMISSION_DENIED"));
  }

  state.isRecognizing = false;
}

export function initSpeechRecognition() {
  const SpeechRecognition = _checkSpeechRecognitionSupport();
  if (!SpeechRecognition) return;

  if (state.recognition) {
    try {
      state.recognition.abort();
    } catch (e) {}
    state.recognition.onresult = null;
    state.recognition.onend = null;
    state.recognition.onerror = null;
    state.recognition = null;
    state.isRecognizing = false;
  }

  state.recognition = new SpeechRecognition();
  _configureRecognition(state.recognition);

  if (state.selectedVoice) {
    state.recognition.lang = state.selectedVoice.lang;
  } else {
    state.recognition.lang = "en-US";
  }

  state.recognition.onresult = _handleRecognitionResult;
  state.recognition.onend = _handleRecognitionEnd;
  state.recognition.onerror = _handleRecognitionError;
}

function _tryStartRecognition() {
  try {
    state.recognition.lang = state.selectedVoice
      ? state.selectedVoice.lang
      : "en-US";
    state.recognition.start();
    state.isRecognizing = true;
    if (state.translationElement) {
      state.translationElement.textContent = "";
    }
  } catch (e) {
    if (e.name !== "InvalidStateError") {
      console.error("Error starting recognition:", e);
    }
    state.isRecognizing = false;
  }
}

export function startRecognition() {
  const canStart =
    state.recognition && state.pronunciationModeEnabled && !state.isRecognizing;
  if (!canStart) return;

  state.recognitionStoppedManually = false;
  _tryStartRecognition();
}

export function stopRecognition() {
  if (state.recognition && state.isRecognizing) {
    state.recognitionStoppedManually = true;
    try {
      state.recognition.stop();
    } catch (e) {
      console.error("Error stopping recognition:", e);
    }
    state.isRecognizing = false;
  }
}

// --- Hold-to-talk (free mode) ---------------------------------------------
// Segurar o mouse na tela transcreve a fala para o MESMO buffer do teclado
// (state.userTyped). Se nao houver nada segurando, o teclado digita normal
// (permite teclados de outros alfabetos). Nao avalia acerto: quem decide e o
// Enter (handleFreeModeEnter).

function _ensureHoldRecognition() {
  if (state.recognition) return true;
  const SpeechRecognition = _checkSpeechRecognitionSupport();
  if (!SpeechRecognition) return false;
  state.recognition = new SpeechRecognition();
  state.recognition.continuous = false;
  state.recognition.interimResults = true;
  state.recognition.onresult = _handleHoldRecognitionResult;
  state.recognition.onend = _handleHoldRecognitionEnd;
  state.recognition.onerror = _handleHoldRecognitionError;
  return true;
}

function _handleHoldRecognitionResult(event) {
  if (!state.holdToTalkActive) return;

  let text = "";
  for (let i = 0; i < event.results.length; ++i) {
    text += event.results[i][0].transcript;
  }
  if (!text.trim()) return;

  state.userTyped = text.trim().toLowerCase();
  if (state.translationElement) {
    state.translationElement.textContent = state.userTyped;
  }
}

function _handleHoldRecognitionEnd() {
  state.isRecognizing = false;
  // Segurou, soltou e o motor ainda esta subindo (start e assincrono):
  // precisa religar para nao perder o ditado.
  if (state.holdToTalkActive) {
    startHoldRecognition();
  }
}

function _handleHoldRecognitionError(event) {
  // "no-speech"/"aborted" sao normais quando o usuario solta o mouse.
  if (event.error === "not-allowed" || event.error === "service-not-allowed") {
    console.error("Hold-to-talk: microfone negado.");
  }
  state.isRecognizing = false;
}

export function startHoldRecognition() {
  if (!_ensureHoldRecognition()) return;
  if (!state.currentSyllable) return;
  state.isSpeechUnlocked = true;

  try {
    state.recognition.lang = state.selectedVoice
      ? state.selectedVoice.lang
      : "en-US";
    state.recognition.start();
    state.isRecognizing = true;
  } catch (e) {
    // InvalidStateError = ja iniciado; os outros merecem log.
    if (e.name !== "InvalidStateError") {
      console.error("Hold-to-talk: erro ao iniciar.", e);
    }
  }
}

export function stopHoldRecognition() {
  if (!state.recognition) return;
  try {
    state.recognition.stop();
  } catch (e) {
    console.error("Hold-to-talk: erro ao parar.", e);
  }
  state.isRecognizing = false;
}

function _setVoiceFromSelection() {
  if (dom.voiceSelect.value === "none") {
    state.selectedVoice = null;
    state.utterance = null;
    return;
  }
  state.selectedVoice = speechSynthesis.getVoices()[dom.voiceSelect.value];
  state.utterance = new SpeechSynthesisUtterance();
  state.utterance.voice = state.selectedVoice;
}

function _updateRecognitionLanguage() {
  initSpeechRecognition();
}

export function speakCurrentSyllable(force = false) {
  if (state.speechTimeout) {
    clearTimeout(state.speechTimeout);
    state.speechTimeout = null;
  }

  // No modo transcricao o "card atual" e um TOKEN do texto colado, nao um
  // currentSyllable. Sem isto, o Shift nao tocava nada nesse modo.
  const texto =
    state.transcriptionModeEnabled && state.transcriptionTokens?.length
      ? state.transcriptionTokens[state.transcriptionIndex]?.original
      : state.currentSyllable?.question;

  const canSpeak =
    state.isSpeechUnlocked &&
    !!texto &&
    (force || !state.pronunciationModeEnabled) &&
    state.selectedVoice;

  if (!canSpeak) return;

  // Chrome workaround: resume paused synthesis
  speechSynthesis.resume();

  // Cancel any ongoing speech
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
  }

  // Small delay to let cancel complete (Chrome bug workaround)
  state.speechTimeout = setTimeout(() => {
    state.speechTimeout = null;

    // Final check before speaking
    if (!state.isSpeechUnlocked) return;
    if (!force && state.pronunciationModeEnabled) return;

    // Recalcula o texto: o jogador pode ter avancado durante o timeout.
    const textoAtual =
      state.transcriptionModeEnabled && state.transcriptionTokens?.length
        ? state.transcriptionTokens[state.transcriptionIndex]?.original
        : state.currentSyllable?.question;
    if (!textoAtual) return;

    const utterance = new SpeechSynthesisUtterance(textoAtual);
    utterance.voice = state.selectedVoice;

    speechSynthesis.speak(utterance);
    state.hasSpokenCurrentCard = true;
  }, 250);
}

export function selectVoice() {
  _setVoiceFromSelection();
  _updateRecognitionLanguage();
  speakCurrentSyllable();
  startRecognition();
}

function _unlockSpeechSynthesis(e) {
  // If it's a click, it MUST be in the game area
  if (e.type === "click") {
    const isGameArea =
      e.target.closest("#game-area") ||
      e.target.closest(".syllable") ||
      e.target.closest(".flying-word");
    if (!isGameArea) return;
  }
  // If it's a keydown, no modal should be open
  else if (e.type === "keydown") {
    if (isModalOpen()) return;
  }

  // Remove listeners now that we're either keydown or a valid game area interaction
  document.removeEventListener("keydown", _unlockSpeechSynthesis, {
    capture: true,
  });
  document.removeEventListener("click", _unlockSpeechSynthesis, {
    capture: true,
  });

  state.isSpeechUnlocked = true;

  // Directly speak the current word now that user has interacted
  // Only play if it's a click (keydown will be handled by normal game logic)
  if (e.type === "click" && !state.hasSpokenCurrentCard) {
    speakCurrentSyllable();
  }
}

export function initSpeechUnlock() {
  document.addEventListener("keydown", _unlockSpeechSynthesis, {
    capture: true,
  });
  document.addEventListener("click", _unlockSpeechSynthesis, { capture: true });
}

export function resetSpeechUnlock() {
  state.isSpeechUnlocked = false;
  // Remove existing listeners just in case
  document.removeEventListener("keydown", _unlockSpeechSynthesis, {
    capture: true,
  });
  document.removeEventListener("click", _unlockSpeechSynthesis, {
    capture: true,
  });
  // Re-attach
  initSpeechUnlock();
}
