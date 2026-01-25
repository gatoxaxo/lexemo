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

function _speakCurrentSyllable() {
  const canSpeak =
    state.currentSyllable?.question &&
    !state.pronunciationModeEnabled &&
    state.utterance;

  if (canSpeak) {
    state.utterance.text = state.currentSyllable.question;
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    speechSynthesis.speak(state.utterance);
  }
}

export function selectVoice() {
  _setVoiceFromSelection();
  _updateRecognitionLanguage();
  _speakCurrentSyllable();
  startRecognition();
}
