import { state, LAST_OPENED_DECK_ID } from "./state.js";
import {
  dom,
  showCustomAlert,
  showCustomConfirm,
  loadGlobalSettings,
  saveGlobalSettings,
  renderDeckModal,
  initModalCloseListeners,
  updateModeSettingsVisibility,
  isModalOpen,
} from "./ui.js";
import * as game from "./game.js";
import * as speech from "./speech.js";
import * as deckManager from "./deckManager.js";
import { timerMode } from "./timerMode.js";
import { getLanguage, getTranslation } from "./i18n/i18n.js";

async function _setupApp() {
  await loadGlobalSettings();
  speech.populateVoices();
  deckManager.loadDecks();
  renderDeckModal();
  initModalCloseListeners();
  deckManager.initJsonEditor();
  addDeckListListeners();
}

function _loadLastDeck() {
  const lastDeckId = localStorage.getItem(LAST_OPENED_DECK_ID);
  const lastDeck = state.allDecks.find((d) => d.id === lastDeckId);

  if (
    !lastDeckId ||
    !lastDeck ||
    !lastDeck.content ||
    lastDeck.content.length === 0
  ) {
    dom.deckModal.style.display = "flex";
    return;
  }

  deckManager.selectDeck(lastDeckId);
}

function _initCustomModalListeners() {
  dom.customAlertCloseBtn.addEventListener("click", () => {
    if (state.currentAlertOnOk) state.currentAlertOnOk();
    dom.customAlertModal.style.display = "none";
    state.currentAlertOnOk = null;
  });

  dom.customConfirmCancelBtn.addEventListener("click", () => {
    if (state.currentConfirmOnCancel) state.currentConfirmOnCancel();
    dom.customConfirmModal.style.display = "none";
    state.currentConfirmOnOk = null;
    state.currentConfirmOnCancel = null;
  });

  dom.customConfirmOkBtn.addEventListener("click", () => {
    if (state.currentConfirmOnOk) state.currentConfirmOnOk();
    dom.customConfirmModal.style.display = "none";
    state.currentConfirmOnOk = null;
    state.currentConfirmOnCancel = null;
  });
}

function _handleGlobalModalKeys(e) {
  const isConfirmOpen = dom.customConfirmModal.style.display === "flex";
  const isAlertOpen = dom.customAlertModal.style.display === "flex";
  const isEditCardOpen = dom.editCardModal.style.display === "flex";

  if (e.key === "Enter") {
    if (isConfirmOpen) {
      e.preventDefault();
      dom.customConfirmOkBtn.click();
      return;
    }
    if (isAlertOpen) {
      e.preventDefault();
      dom.customAlertCloseBtn.click();
      return;
    }
    if (isEditCardOpen) {
      e.preventDefault();
      dom.editCardSaveBtn.click();
      return;
    }
  }

  if (e.key === "Escape") {
    e.preventDefault();

    if (isConfirmOpen) {
      dom.customConfirmCancelBtn.click();
      return;
    }
    if (isAlertOpen) {
      dom.customAlertCloseBtn.click();
      return;
    }
    if (dom.editCardModal.style.display === "flex") {
      dom.editCardCancelBtn.click();
      return;
    }
    if (dom.mergeModal.style.display === "flex") {
      dom.cancelMergeBtn.click();
      return;
    }
    if (dom.jsonEditorModal.style.display === "flex") {
      dom.cancelJsonBtn.click();
      return;
    }
    if (dom.statsModal.style.display === "flex") {
      dom.statsCloseBtn.click();
      return;
    }
    if (dom.generalSettingsModal.style.display === "flex") {
      dom.generalSettingsCancelBtn.click();
      return;
    }
    if (dom.settingsModal.style.display === "flex") {
      dom.settingsCancelBtn.click();
      return;
    }
    if (dom.congratsModal.style.display === "flex") {
      dom.restartBtn.click();
      return;
    }
    if (dom.deckModal.style.display === "flex") {
      dom.deckModal.style.display = "none";
      document.dispatchEvent(new CustomEvent("deckModalClosed"));
      return;
    }
  }
}

function _initVoiceListeners() {
  speechSynthesis.onvoiceschanged = speech.populateVoices;
  dom.voiceSelect.addEventListener("change", () => {
    speech.selectVoice();

    const isVoiceSelected = dom.voiceSelect.value !== "none";
    // O modo pronuncia so PRECISA de voz quando o estimulo e sonoro
    // ("por pronuncia"). Na versao invertida por romanizacao a resposta e
    // digitada e o audio e apenas um apoio opcional, entao a ausencia de voz
    // nao deve bloquear o modo.
    dom.modePronunciationToggle.disabled = _pronunciationRequiresVoice() && !isVoiceSelected;

    if (!isVoiceSelected) {
      dom.pronunciationAudioOnlyToggle.checked = false;
      updateModeSettingsVisibility();
    }
  });
}

// O modo pronuncia exige uma voz sintetizada apenas no caso em que o estimulo
// e o proprio audio. Fora disso (romanizacao visivel) o exercicio funciona com
// digitacao.
function _pronunciationRequiresVoice() {
  return dom.pronunciationAudioOnlyToggle.checked;
}

function _initTopPanelListeners() {
  dom.generalSettingsBtn.addEventListener("click", () => {
    dom.generalCorrectSoundToggle.checked = state.correctSoundEnabled;
    dom.generalWrongSoundToggle.checked = state.wrongSoundEnabled;
    dom.generalDarkModeToggle.checked = state.darkModeEnabled;
    dom.languageSelector.value = getLanguage();
    dom.generalSettingsModal.style.display = "flex";
  });

  dom.deckSelectBtn.addEventListener("click", () => {
    speech.stopRecognition();
    if (speechSynthesis.speaking) speechSynthesis.cancel();
    dom.deckModal.style.display = "flex";
  });

  dom.settingsBtn.addEventListener("click", () => {
    if (state.currentDeckId) {
      deckManager.openSettingsModal(state.currentDeckId);
    } else {
      showCustomAlert(getTranslation("SELECT_DECK_FIRST"));
      dom.deckModal.style.display = "flex";
    }
  });
}

function _initGlobalSettingsListeners() {
  dom.generalSettingsSaveBtn.addEventListener("click", () => {
    saveGlobalSettings();
    dom.generalSettingsModal.style.display = "none";

    if (state.currentSyllable) {
      game.displaySyllable();
    }
  });

  dom.generalSettingsCancelBtn.addEventListener("click", () => {
    dom.generalSettingsModal.style.display = "none";
  });
}

function _handleDeckListClick(e) {
  const mainCard = e.target.closest(".deck-card-main");
  const statsBtn = e.target.closest(".deck-action-btn.stats");
  const deleteBtn = e.target.closest(".deck-action-btn.delete");

  if (mainCard) {
    deckManager.selectDeck(mainCard.dataset.deckId);
    return;
  }
  if (statsBtn) {
    deckManager.showDeckStats(statsBtn.dataset.deckId);
    return;
  }
  if (deleteBtn) {
    deckManager.deleteDeck(deleteBtn.dataset.deckId);
    return;
  }
}

function addDeckListListeners() {
  dom.deckList.addEventListener("click", _handleDeckListClick);
}

function _initDeckModalListeners() {
  dom.addDeckBtn.addEventListener("click", () => {
    deckManager.openSettingsModal(null);
  });

  dom.statsCloseBtn.addEventListener("click", () => {
    dom.statsModal.style.display = "none";
  });

  dom.statsResetSrsBtn.addEventListener("click", () => {
    const deck = state.allDecks.find((d) => d.id === state.currentDeckStatsId);
    if (!deck) return;

    showCustomConfirm(
      getTranslation("RESET_SRS_CONFIRMATION").replace("{0}", deck.name),
      () => {
        deck.content.forEach((card) => {
          card.s = 0.1;
          card.d = 0.5;
          card.lastReview = null;
          card.dueDate = null;
        });
        deckManager.saveDecks();
        deckManager.showDeckStats(state.currentDeckStatsId);

        showCustomAlert(getTranslation("SRS_STATS_RESET"));
      },
    );
  });
}

function _initDeckSettingsListeners() {
  dom.settingsSaveBtn.addEventListener("click", deckManager.saveDeckChanges);

  dom.settingsCancelBtn.addEventListener("click", () => {
    dom.settingsModal.style.display = "none";
    state.pendingDeckContent = null;
  });

  function handleAnswerTipChange() {
    let val = parseInt(dom.answerTipInput.value);
    if (isNaN(val) || val < 0) val = 0;
    if (val > 3) val = 3;
    dom.answerTipInput.value = val;
  }

  dom.answerTipInput.addEventListener("change", handleAnswerTipChange);
  dom.answerTipDecrement.addEventListener("click", () => {
    dom.answerTipInput.value = Math.max(
      0,
      parseInt(dom.answerTipInput.value) - 1,
    );
    handleAnswerTipChange();
  });

  dom.answerTipIncrement.addEventListener("click", () => {
    dom.answerTipInput.value = Math.min(
      3,
      parseInt(dom.answerTipInput.value) + 1,
    );
    handleAnswerTipChange();
  });

  function handleGameSpeedChange() {
    let val = parseInt(dom.gameSpeedInput.value);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 10) val = 10;
    dom.gameSpeedInput.value = val;
  }

  dom.gameSpeedInput.addEventListener("change", handleGameSpeedChange);
  dom.gameSpeedDecrement.addEventListener("click", () => {
    dom.gameSpeedInput.value = Math.max(
      1,
      parseInt(dom.gameSpeedInput.value) - 1,
    );
    handleGameSpeedChange();
  });
  dom.gameSpeedIncrement.addEventListener("click", () => {
    dom.gameSpeedInput.value = Math.min(
      10,
      parseInt(dom.gameSpeedInput.value) + 1,
    );
    handleGameSpeedChange();
  });

  // SRS Settings Listeners
  const handleTargetRetentionChange = () => {
    let val = parseInt(dom.targetRetentionInput.value);
    if (isNaN(val) || val < 70) val = 70;
    if (val > 99) val = 99;
    dom.targetRetentionInput.value = val;
  };
  dom.targetRetentionInput.addEventListener("change", handleTargetRetentionChange);
  dom.targetRetentionDecrement.addEventListener("click", () => {
    dom.targetRetentionInput.value = Math.max(70, parseInt(dom.targetRetentionInput.value) - 1);
    handleTargetRetentionChange();
  });
  dom.targetRetentionIncrement.addEventListener("click", () => {
    dom.targetRetentionInput.value = Math.min(99, parseInt(dom.targetRetentionInput.value) + 1);
    handleTargetRetentionChange();
  });

  const handleNewCardLimitChange = () => {
    let val = parseInt(dom.newCardLimitInput.value);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 100) val = 100;
    dom.newCardLimitInput.value = val;
  };
  dom.newCardLimitInput.addEventListener("change", handleNewCardLimitChange);
  dom.newCardLimitDecrement.addEventListener("click", () => {
    dom.newCardLimitInput.value = Math.max(1, parseInt(dom.newCardLimitInput.value) - 1);
    handleNewCardLimitChange();
  });
  dom.newCardLimitIncrement.addEventListener("click", () => {
    dom.newCardLimitInput.value = Math.min(100, parseInt(dom.newCardLimitInput.value) + 1);
    handleNewCardLimitChange();
  });

  const modeToggles = [
    dom.modeFreeToggle,
    dom.modeSrsToggle,
    dom.modePronunciationToggle,
    dom.modeTimerToggle,
    dom.modeTranscriptionToggle,
  ];
  modeToggles.forEach((toggle) =>
    toggle.addEventListener("click", (e) => {
      const selectedToggle = e.target;
      if (!selectedToggle.checked) {
        selectedToggle.checked = true;
        return;
      }
      modeToggles.forEach((t) => {
        if (t !== selectedToggle) t.checked = false;
      });
      updateModeSettingsVisibility();
    }),
  );

  // Opcoes internas do modo pronuncia: nao sao modos, so ajustam o enunciado
  // (mostrar romanizacao / ocultar tudo). Basta recalcular a visibilidade.
  [
    dom.pronunciationInvertedToggle,
    dom.pronunciationAudioOnlyToggle,
  ].forEach((toggle) => {
    if (!toggle) return;
    toggle.addEventListener("click", () => updateModeSettingsVisibility());
  });
}

function _handleKeyEnter() {
  // Modo pronuncia invertido: Enter confirma a palavra digitada em russo.
  // Sem inverter, Enter continua pedindo a repeticao do audio (comportamento
  // antigo do modo, quando o canal era a fala).
  if (state.pronunciationModeEnabled) {
    if (state.pronunciationInvertedEnabled) {
      game.handleFreeModeEnter();
    } else {
      game.handlePronunciationEnter();
    }
  } else if (state.transcriptionModeEnabled) {
    // Modo transcricao nao grava nada no deck (nao ha SRS nem card).
    game.handleFreeModeEnter();
  } else if (state.evaluativeModeEnabled) {
    game.handleSrsEnter();
    deckManager.saveDecks();
  } else {
    game.handleFreeModeEnter();
  }
}

// --- Hold-to-talk ---------------------------------------------------------
// TEMPORARIAMENTE DESATIVADO: o gatilho por mouse foi desligado porque o
// usuario vai escolher uma TECLA dedicada para ativar o microfone. Por
// enquanto o unico caminho de entrada e o teclado.
// A implementacao de voz segue em speech.js (startHoldRecognition) e sera
// ligada de novo na tecla escolhida - nao reescrever o motor, so o gatilho.
const HOLD_TO_TALK_MOUSE_ENABLED = false;

// Enquanto ouve, a tela entra nesta classe para o arrasto nao selecionar
// texto da interface.
const HOLD_NEUTRAL_CLICK_CLASS = "no-select";

function _canHoldToTalk() {
  return (
    !state.evaluativeModeEnabled &&
    !state.pronunciationModeEnabled &&
    !state.timerModeEnabled &&
    !!state.currentSyllable
  );
}

function _handleHoldStart(e) {
  if (!HOLD_TO_TALK_MOUSE_ENABLED) return;
  if (isModalOpen() || e.button !== 0) return;
  if (!_canHoldToTalk()) return;
  // e.target pode nao ser um Element (ex.: o proprio document), e nesse caso
  // nao existe closest. Por isso a checagem de tipo.
  const target = e.target;
  if (target instanceof Element && target.closest("button, a, input, select, textarea, label")) {
    return;
  }

  e.preventDefault();
  state.holdToTalkActive = true;
  document.body.classList.add(HOLD_NEUTRAL_CLICK_CLASS);
  speech.stopHoldRecognition();
  speech.startHoldRecognition();
}

function _handleHoldEnd() {
  if (!HOLD_TO_TALK_MOUSE_ENABLED) return;
  if (!state.holdToTalkActive) return;
  state.holdToTalkActive = false;
  document.body.classList.remove(HOLD_NEUTRAL_CLICK_CLASS);
  speech.stopHoldRecognition();
}

function _handleKeyPress(e) {
  if (isModalOpen()) return;
  // Modo pronuncia: so a versao INVERTIDA aceita digitacao (o estimulo deixa
  // de ser a propria palavra). Sem inverter o microfone continua sendo o canal.
  if (state.pronunciationModeEnabled && !state.pronunciationInvertedEnabled) return;

  // Modo transcricao nao usa card: o alvo vem do texto colado.
  if (state.transcriptionModeEnabled) {
    // Enter, Espaco e Backspace sao tratados no keydown (que faz
    // preventDefault). Aqui so passam as letras.
    if (e.key === "Enter" || e.key === "Backspace" || e.key === " ") return;
    game.handleTranscricaoKey(e.key);
    return;
  }

  if (!state.currentSyllable || !state.currentSyllable.answer) return;

  if (e.key === "Enter" || e.key === "Backspace") {
    return;
  }

  game.handleKeyInput(e.key.toLowerCase());
}

function _handleKeyDown(e) {
  if (isModalOpen()) return;

  const canScopeLevel = !state.evaluativeModeEnabled;
  if (canScopeLevel && e.key === "ArrowUp") {
    e.preventDefault();
    if (!state.isLevelSkipActive) {
      state.levelSkipInput = "";
    }
    state.isLevelSkipActive = true;
    return;
  }
  if (state.isLevelSkipActive && /^[0-9-]$/.test(e.key)) {
    e.preventDefault();
    state.levelSkipInput += e.key;
    return;
  }

  if (e.key === "Delete") {
    e.preventDefault();
    if (!state.timerModeEnabled) {
      game.handleDeleteCurrentCardRequest();
    }
    return;
  }

  // Modo transcricao nao usa card (`currentSyllable` nunca e setado), entao
  // precisa tratar Backspace/Enter ANTES do guard que exige um card.
  if (state.transcriptionModeEnabled) {
    if (e.key === "Backspace") {
      game.handleBackspace();
      return;
    }
    // Espaco vai pelo MESMO caminho das letras: a validacao e letra a letra, e
    // espaco e um caso tratado dentro do modo (separador ignorado ou erro por
    // palavra incompleta). Roteado aqui apenas para poder fazer preventDefault
    // e nao rolar a pagina.
    if (e.key === " ") {
      e.preventDefault();
      game.handleTranscricaoKey(" ");
      return;
    }
    if (e.key === "Enter") {
      game.handleFreeModeEnter();
      return;
    }
    return;
  }

  if (!state.currentSyllable || !state.currentSyllable.answer) return;

  if (e.key === "Backspace") {
    game.handleBackspace();
  } else if (
    e.key === "Shift" &&
    !state.timerModeEnabled &&
    !state.reverseModeEnabled &&
    (!state.pronunciationModeEnabled || state.pronunciationInvertedEnabled)
  ) {
    // No modo reverso o Shift nao faz nada: o audio so toca ao errar.
    // No modo pronuncia, Shift so faz sentido quando o estimulo NAO e a
    // palavra escrita - ou seja, invertido (romanizacao ou audio).
    game.handleVoiceRepeat();
  } else if (e.key === "Enter") {
    _handleKeyEnter();
  } else if (e.key === "Alt") {
    e.preventDefault();
    if (!state.timerModeEnabled) {
      game.handleEditCurrentCardRequest();
    }
  }
}

function _handleKeyUp(e) {
  if (isModalOpen()) return;

  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (state.isLevelSkipActive && state.levelSkipInput.length > 0) {
      game.setGameScope(state.levelSkipInput);
    }
    state.isLevelSkipActive = false;
    state.levelSkipInput = "";
  }
}
function _initGameListeners() {
  document.addEventListener("keydown", _handleKeyDown);
  document.addEventListener("keyup", _handleKeyUp);
  document.addEventListener("keypress", _handleKeyPress);
  document.addEventListener("mousedown", _handleHoldStart);
  document.addEventListener("mouseup", _handleHoldEnd);
  // Se o botao for solto fora da janela (ou o foco se perde), encerra o ditado
  // para nao ficar com o microfone aberto.
  window.addEventListener("blur", _handleHoldEnd);
  document.addEventListener(
    "pronunciationSuccess",
    game.handleCorrectPronunciation,
  );
  document.addEventListener("cardDeleted", () => {
    deckManager.saveDecks();
    deckManager.renderDeckModal();
  });
  document.addEventListener("cardUpdated", () => {
    deckManager.saveDecks();
    deckManager.renderDeckModal();
  });
}
function _initModalCloseResumeListeners() {
  document.addEventListener("deckModalClosed", () => {
    if (!isModalOpen()) {
      if (state.pronunciationModeEnabled && state.currentSyllable) {
        speech.startRecognition();
      }
    }
  });
}

function _initEditCardModalListeners() {
  dom.editCardCancelBtn.addEventListener("click", () => {
    dom.editCardModal.style.display = "none";
  });

  dom.editCardSaveBtn.addEventListener("click", () => {
    const newData = {
      question: dom.editCardQuestionInput.value.trim().toLowerCase(),
      answer: dom.editCardAnswerInput.value.trim().toLowerCase(),
      hint: dom.editCardHintInput.value.trim(),
    };

    if (!newData.question || !newData.answer) {
      showCustomAlert(getTranslation("EMPTY_QUESTION_ANSWER"));
      return;
    }

    game.updateCurrentCard(newData);
    dom.editCardModal.style.display = "none";
  });
}

async function init() {
  await _setupApp();
  _initCustomModalListeners();
  _initVoiceListeners();
  _initTopPanelListeners();
  _initGlobalSettingsListeners();
  _initDeckModalListeners();
  _initDeckSettingsListeners();
  _initEditCardModalListeners();
  _initGameListeners();
  _initModalCloseResumeListeners();

  document.addEventListener("keydown", _handleGlobalModalKeys);

  // Add one-time listeners to unlock speech synthesis on first interaction
  speech.initSpeechUnlock();

  _loadLastDeck();
}

init();