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
  // DEFEITO REAL: usar `if (!state.syllableCoverage[chave])` para decidir se
  // inicializa nao funciona, porque a lista COMPLETA de pendentes e [] (array
  // vazio) - que e FALSY em JS. Entao uma palavra ja coberta era reinicializada
  // com todas as silabas, VOLTANDO a ser sorteada e fazendo silaba ja acertada
  // reaparecer. A checagem tem que ser por presenca da chave, nao por truthiness.
  if (!Object.prototype.hasOwnProperty.call(state.syllableCoverage, chave)) {
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

  // Modo silaba: basta o texto digitar CONTER a romanizacao da silaba.
  // O jogador esta lendo a palavra inteira (a silaba aparece no meio dela),
  // entao e natural digitar a palavra toda - "pala" para a silaba "la" vale.
  // Exigir igualdade exata punia quem leu certo mas romanizou a palavra toda.
  if (state.syllableModeEnabled) {
    return _contemSilaba(typed, target);
  }

  if (typed === target) return true;
  return state.reverseModeEnabled && typed === state.currentSyllable.answer;
}

// O texto digitado contem a romanizacao da silaba?
// Compara sem acento/caixa e sem espacos, para "Pala", "pála" e "pa la" valerem
// para a silaba "la". Alvo vazio nunca casa (evita acerto de graca).
function _contemSilaba(typed, alvo) {
  const normalizar = (s) =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "");

  const alvoNorm = normalizar(alvo);
  if (!alvoNorm) return false;
  return normalizar(typed).includes(alvoNorm);
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

  // DEFEITO REAL: ao errar, o card e reexibido por displaySyllable() e a
  // silaba era SORTEADA DE NOVO. O jogador via a mesma silaba repetir varias
  // vezes seguidas (so as vezes mudava), parecendo que o modo repetia silaba
  // ja acertada. Ao errar, a rodada e a MESMA: mantem a silaba ja sorteada
  // para a tentativa valer como repeticao daquela silaba especifica.
  //
  // A retencao so vale se a palavra tambem for a mesma: o sorteio de card
  // pode trocar de palavra, e nesse caso o indice guardado nao se aplica.
  if (state.syllableRetryIndex >= 0 && state.syllableRetryQuestion === state.currentSyllable.question) {
    state.syllableHighlightIndex = state.syllableRetryIndex;
    return;
  }

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

// --- Modo transcricao ------------------------------------------------------
// O jogador romaniza um TEXTO colado nas configuracoes do deck. A tela mostra
// duas caixas: o texto em russo (estimulo) e a romanizacao esperada.
// Regras:
//  - pontuacao/linhas/espacos sao ignorados ao montar os tokens;
//  - o jogador digita a palavra inteira e ela e comparada no Enter;
//  - errou: reinicia do inicio do TEXTO ou da PALAVRA, conforme a opcao;
//  - acertou todas: partida ganha.

function _iniciarTranscricao() {
  const tokens = syllables.tokenizarTranscricao(state.transcriptionText);
  state.transcriptionTokens = tokens;
  state.transcriptionIndex = 0;
  state.transcriptionRevealed = false;
  state.transcriptionFailedIndex = -1;
  _renderTranscricao();
  return tokens.length > 0;
}

// Renderiza as duas caixas. A palavra atual fica destacada nas duas, para o
// jogador saber exatamente onde esta.
function _renderTranscricao() {
  if (!dom.transcriptionBoxes) return;

  const tokens = state.transcriptionTokens;
  const idx = state.transcriptionIndex;
  const mostrar = state.transcriptionModeEnabled && tokens.length > 0;

  dom.transcriptionBoxes.style.display = mostrar ? "flex" : "none";
  if (!mostrar) return;

  const montar = (container, campo) => {
    container.textContent = "";
    tokens.forEach((tok, i) => {
      const span = document.createElement("span");
      span.textContent = tok[campo] + " ";
      if (i < idx) span.classList.add("transcription-done");
      else if (i === idx) span.classList.add("transcription-current");
      container.appendChild(span);
    });
  };

  montar(dom.transcriptionSourceText, "original");

  // A caixa de baixo e o CAMPO DE DIGITACAO: mostra o que o jogador esta
  // escrevendo (mesmo estilo de caixa). A romanizacao esperada NAO fica
  // visivel, senao o exercicio vira copia e mata o objetivo, que e aprender a
  // ler a palavra. Ela so aparece quando o jogador erra a rodada - nesse
  // momento a resposta ja e conhecida, entao revelar ajuda a corrigir.
  dom.transcriptionTargetText.textContent = state.userTyped || "";

  const revelado = dom.transcriptionRevealedText;
  if (revelado) {
    if (state.transcriptionRevealed) {
      // No erro, mostra a PALAVRA EM RUSSO que o jogador errou - nao a
      // romanizacao. O objetivo e treinar a leitura, entao a resposta
      // romanizada deve continuar sendo trabalho dele; o que ajuda e ver de
      // novo a palavra que ele leu errado (e nao entregar a transliteracao).
      //
      // Usa o indice guardado no erro, porque ao recomecar o texto o cursor
      // volta para 0 e revelar a primeira palavra nao diz nada sobre o erro.
      const iFalha = state.transcriptionFailedIndex;
      const alvo = iFalha >= 0 && tokens[iFalha] ? tokens[iFalha] : tokens[idx];
      revelado.textContent = alvo ? alvo.original : "";
      revelado.style.display = "block";
    } else {
      revelado.textContent = "";
      revelado.style.display = "none";
    }
  }
}

// Resultado digitado pelo jogador no modo transcricao.
//
// A validacao e LETRA A LETRA (ver _handleTranscricaoKey). Enter/Espaco aqui
// so confirmam a palavra JA validada - servem para avancar quando a palavra
// terminou, e nao mais para comparar o texto inteiro de uma vez.
function _handleTranscricaoEnter() {
  const tokens = state.transcriptionTokens;
  if (tokens.length === 0) return;

  const esperado = tokens[state.transcriptionIndex].romanizado;
  const digitado = String(state.userTyped).toLowerCase();

  // Palavra completa: avanca. Incompleta: conta como erro (o jogador pulou
  // letra ou apertou espaco antes de terminar).
  if (digitado === esperado.toLowerCase()) {
    _avancarTranscricao();
  } else {
    _errarTranscricao();
  }
}

// Letras aceitas como equivalentes na digitacao.
//
// z e s sao intercambiaveis: em russo, з soa como /s/ no fim de palavra e
// antes de consoante surda, e quem aprende romanizacao oscila entre as duas
// grafias. Cobrar a letra exata puniria uma leitura correta.
const LETRAS_EQUIVALENTES = { z: ["z", "s"], s: ["z", "s"] };

function _letraEquivalente(digitada, esperada) {
  const d = String(digitada).toLowerCase();
  const e = String(esperada).toLowerCase();
  if (d === e) return true;
  const lista = LETRAS_EQUIVALENTES[e];
  return !!lista && lista.indexOf(d) > -1;
}

// Processa UMA tecla no modo transcricao. Compara com a proxima letra
// esperada; se bater, aceita; se nao bater, erra na hora.
// Retorna true se a tecla foi consumida pelo modo.
export function handleTranscricaoKey(key) {
  const tokens = state.transcriptionTokens;
  if (!state.transcriptionModeEnabled || tokens.length === 0) return false;

  // Ja errou e ainda nao recomecou: as teclas restantes da rajada de digitacao
  // NAO podem ser reavaliadas, senao sobrescrevem o indice da palavra errada
  // (o cursor ja voltou para o inicio e o jogador veria a primeira palavra).
  // Ignoramos tudo ate ele digitar a primeira letra CORRETA da palavra atual.
  if (state.transcriptionRevealed) {
    const esperadoAtual = tokens[state.transcriptionIndex].romanizado.toLowerCase();
    if (!_letraEquivalente(key, esperadoAtual[0])) {
      return true; // consome sem efeito: ainda na esteira do erro
    }
    // Recomecou de verdade: limpa a revelacao e segue o fluxo normal.
    state.transcriptionRevealed = false;
    state.transcriptionFailedIndex = -1;
    if (dom.transcriptionRevealedText) {
      dom.transcriptionRevealedText.textContent = "";
      dom.transcriptionRevealedText.style.display = "none";
    }
  }

  // Espaco nativo do teclado separa palavras. Como a palavra ja avanca sozinha
  // ao ser completada, um espaco logo depois de completar e apenas o reflexo
  // de quem separa palavras ao digitar - nao pode virar erro na palavra que
  // acabou de aparecer. Ignoramos espaco quando o campo esta vazio (nada foi
  // digitado ainda nesta palavra) ou quando a palavra anterior acabou de ser
  // concluida (transcriptionJustAdvanced).
  if (key === " ") {
    if (state.transcriptionJustAdvanced || state.userTyped.length === 0) {
      state.transcriptionJustAdvanced = false;
      return true;
    }
    _handleTranscricaoEnter();
    return true;
  }

  state.transcriptionJustAdvanced = false;

  const esperado = tokens[state.transcriptionIndex].romanizado.toLowerCase();
  const pos = state.userTyped.length;

  // Ja terminou a palavra (nao deveria chegar aqui): confirma.
  if (pos >= esperado.length) {
    _handleTranscricaoEnter();
    return true;
  }

  const letraEsperada = esperado[pos];
  if (!_letraEquivalente(key, letraEsperada)) {
    // Errou esta letra: nao aceita a tecla, dispara o erro.
    _errarTranscricao();
    return true;
  }

  state.userTyped += key;
  if (!state.firstKeyTime) state.firstKeyTime = Date.now();

  // Ultima letra da palavra: avanca automaticamente, sem precisar de espaco.
  if (state.userTyped.length === esperado.length) {
    _avancarTranscricao();
    return true;
  }

  _renderTranscricao();
  return true;
}

function _avancarTranscricao() {
  const tokens = state.transcriptionTokens;

  state.transcriptionIndex++;
  state.userTyped = "";
  state.transcriptionRevealed = false;
  state.transcriptionFailedIndex = -1;
  // Marca que a palavra foi completada agora: um espaco logo a seguir e
  // apenas o separador natural entre palavras, nao erro.
  state.transcriptionJustAdvanced = true;
  if (state.translationElement) state.translationElement.textContent = "";

  if (state.transcriptionIndex >= tokens.length) {
    _renderTranscricao();
    showCongrats(false, startGame);
    return;
  }

  _renderTranscricao();
}

function _errarTranscricao() {
  // Guarda o indice que falhou ANTES de reposicionar o cursor, para a
  // revelacao mostrar a palavra realmente errada (e nao a do inicio do texto).
  state.transcriptionFailedIndex = state.transcriptionIndex;

  if (state.transcriptionResetScope !== "word") {
    state.transcriptionIndex = 0;
  }

  state.userTyped = "";
  state.hintUsed = true;
  state.transcriptionRevealed = true;
  if (state.translationElement) state.translationElement.textContent = "";
  if (state.wrongSoundEnabled) {
    wrongSound.currentTime = 0;
    wrongSound.play();
  }
  _renderTranscricao();
}


export function displaySyllable() {
  _setupSyllable();

  // Modo transcricao nao usa cards: trabalha sobre o texto colado. Tem
  // caminho proprio para nao precisar de deck com conteudo.
  if (state.transcriptionModeEnabled) {
    dom.contextHintBox.style.display = "none";
    if (state.currentSyllableElement) state.currentSyllableElement.remove();
    if (!_iniciarTranscricao()) return;

    // O texto digitado aparece NA CAIXA de baixo (ver _renderTranscricao),
    // entao nao criamos o elemento flutuante que os outros modos usam.
    // Mantemos o elemento de traducao apenas como referencia interna, oculto.
    const translationEl = _createTranslationElement();
    translationEl.style.display = "none";
    state.translationElement = translationEl;
    return;
  }

  if (dom.transcriptionBoxes) dom.transcriptionBoxes.style.display = "none";

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
  state.syllableRetryIndex = -1;
  state.syllableRetryQuestion = null;
  // Modo transcricao recomeca do inicio do texto a cada nova partida.
  state.transcriptionTokens = [];
  state.transcriptionIndex = 0;
  state.transcriptionRevealed = false;
  state.transcriptionFailedIndex = -1;
  srs.resetSessionStats();
}

function _cleanupGameUI() {
  if (state.currentSyllableElement) state.currentSyllableElement.remove();
  if (state.translationElement) state.translationElement.remove();
  if (dom.transcriptionBoxes) dom.transcriptionBoxes.style.display = "none";
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

  // Modo transcricao nao usa o conteudo do deck: o material vem do texto
  // colado nas configuracoes. Por isso pode iniciar mesmo sem cards.
  if (state.transcriptionModeEnabled) {
    updateScoreDisplay();
    displaySyllable();
    return;
  }

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
  // Modo transcricao: a caixa de baixo e o campo de digitacao.
  if (state.transcriptionModeEnabled) _renderTranscricao();
}

export function handleBackspace() {
  if (state.pronunciationModeEnabled) return;
  state.userTyped = state.userTyped.slice(0, -1);
  if (state.translationElement) {
    state.translationElement.textContent = state.userTyped;
  }
  // Modo transcricao: a caixa de baixo e o campo de digitacao.
  if (state.transcriptionModeEnabled) _renderTranscricao();
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

// Modo silaba: marcar a silaba mesmo quando o acerto vem depois de um erro.
//
// DEFEITO REAL: no free mode, _handleFreeModeCorrect so pontua/avanca quando
// !hintUsed. Como errar seta hintUsed=true, acertar a silaba na repeticao NAO
// marcava nada: a silaba continuava pendente e voltava a ser sorteada depois,
// dando a impressao de que o modo repetia silaba ja acertada. A cobertura tem
// que ser independente do hint - o jogador provou que sabe aquela silaba.
function _marcarSilabaPorRepeticao() {
  if (!state.syllableModeEnabled || !state.currentSyllable) return;
  _marcarSilabaAcertada(state.currentSyllable, state.syllableHighlightIndex);
  if (_palavraCoberta(state.currentSyllable)) {
    const i = state.currentGroup.indexOf(state.currentSyllable);
    if (i > -1) state.currentGroup.splice(i, 1);
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
  } else {
    // Acerto depois de ja ter visto a resposta (tipicamente a repeticao de uma
    // silaba errada). No modo silaba ainda conta para a cobertura - ver
    // _marcarSilabaPorRepeticao. Nos outros modos mantem o comportamento
    // antigo (nao pontua).
    _marcarSilabaPorRepeticao();
  }
  if (state.translationElement) state.translationElement.textContent = "";
  if (state.currentSyllableElement) state.currentSyllableElement.remove();
  // Acertou (ou ja tinha visto a resposta): a proxima exibicao sorteia uma
  // silaba nova, em vez de repetir a desta rodada.
  state.syllableRetryIndex = -1;
  state.syllableRetryQuestion = null;
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

  // Modo silaba: o jogador errou ESTA silaba, entao a repeticao imediata tem
  // que ser a mesma silaba - senao ele nunca consegue treinar a que errou.
  if (state.syllableModeEnabled) {
    state.syllableRetryIndex = state.syllableHighlightIndex;
    state.syllableRetryQuestion = state.currentSyllable.question;
  }

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
  // Modo transcricao tem fluxo proprio: compara palavra a palavra do texto
  // colado, nao o par question/answer de um card.
  if (state.transcriptionModeEnabled) {
    _handleTranscricaoEnter();
    return;
  }

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
