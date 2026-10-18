export const GROUP_SIZE = 5;
export const DECK_STORAGE_KEY = "association_game_decks_fsrs";
export const GLOBAL_SETTINGS_KEY = "association_game_global_settings";
export const LAST_OPENED_DECK_ID = "association_game_last_deck";

export const correctSound = new Audio("assets/right.mp3");
export const wrongSound = new Audio("assets/wrong.mp3");
export const gunSound = new Audio("assets/gun.mp3");
export const shotSound = new Audio("assets/shot.mp3");
export const explosionSound = new Audio("assets/explosion.mp3");

export const state = {
  allDecks: [],
  currentDeckId: null,
  currentDeckStatsId: null,
  originalSyllableList: [],
  syllableList: [],
  currentGroupIndex: 0,
  currentGroup: [],
  sessionReviewQueue: [],
  currentSyllable: null,
  currentSyllableElement: null,
  questionElement: null,
  translationElement: null,

  userTyped: "",
  score: 0,
  hintUsed: false,
  cardStartTime: 0,
  firstKeyTime: 0,

  selectedVoice: null,
  utterance: null,
  recognition: null,
  isRecognizing: false,
  recognitionStoppedManually: false,

  correctSoundEnabled: true,
  wrongSoundEnabled: true,
  darkModeEnabled: true,

  randomToggleEnabled: false,
  colorHintEnabled: true,
  positionHintEnabled: true,
  answerTipLetters: 0,
  restartOnWrongEnabled: false,
  evaluativeModeEnabled: false,
  pronunciationModeEnabled: false,
  hearingModeEnabled: false,
  // Reverse mode: o ANSWER vira o estimulo e o jogador digita o QUESTION.
  // So vale no free mode (SRS fica intacto).
  reverseModeEnabled: false,  // Modo silaba: mostra a palavra russa com UMA silaba aleatoria destacada e
  // o jogador digita a romanizacao dessa silaba (ver js/syllables.js).
  syllableModeEnabled: false,
  // Modo transcricao: o jogador romaniza um TEXTO colado nas configuracoes.
  // Ignora pontuacao; erro reinicia do inicio (do texto ou da palavra,
  // conforme transcriptionResetScope).
  transcriptionModeEnabled: false,
  transcriptionText: "",
  // Transcricao invertida: o estimulo passa a ser a ROMANIZACAO da palavra e o
  // jogador digita a palavra em RUSSO (exercicio som -> grafia).
  transcriptionInvertedEnabled: false,
  // Oculta a caixa de CIMA (o texto em russo) mesmo sem inverter. Fica dentro
  // do modo transcricao e serve para treinar de ouvido/leitura sem a muleta.
  transcriptionHideSourceEnabled: false,
  // Keyboard training: estimulo = texto em RUSSO e a resposta e o MESMO texto,
  // digitado em russo. Treina o layout cirilico (onde cada letra fica no
  // teclado), nao a traducao nem a romanizacao.
  transcriptionKeyboardTrainingEnabled: false,
  // "text" = erro volta ao inicio do texto; "word" = volta a palavra atual.
  transcriptionResetScope: "text",
  // Progresso da rodada: lista de tokens e indice da palavra atual.
  transcriptionTokens: [],
  transcriptionIndex: 0,
  // A romanizacao (resposta) so aparece depois de um erro na rodada.
  transcriptionRevealed: false,
  // Indice da palavra que o jogador ERROU (-1 = nenhuma). Guardado porque o
  // cursor pode voltar para o inicio do texto antes de revelar a resposta.
  transcriptionFailedIndex: -1,
  // A palavra acabou de ser completada. Serve para ignorar o espaco que o
  // jogador digita logo depois, separando palavras (nao e erro).
  transcriptionJustAdvanced: false,
  // Dados da rodada atual do modo silaba (calculados em game.js).
  syllableParts: [],
  syllableHighlightIndex: -1,
  // Cobertura no modo silaba: cada palavra precisa ter TODAS as silabas
  // acertadas antes de sair do grupo. Mapeia question -> indices pendentes.
  syllableCoverage: {},
  // Silaba a manter na proxima exibicao (-1 = sortear). Usado para repetir a
  // MESMA silaba quando o jogador erra, em vez de sortear outra.
  syllableRetryIndex: -1,
  syllableRetryQuestion: null,  // Hold-to-talk: reconhecimento de voz disparado por mouse down na tela.
  // Preenche o mesmo buffer do teclado (state.userTyped).
  holdToTalkActive: false,


  editModeDeckId: null,
  pendingDeckContent: null,
  jsonEditorOriginalContent: null,
  importCache: { content: null, name: null },

  currentConfirmOnOk: null,
  currentConfirmOnCancel: null,
  currentAlertOnOk: null,

  isLevelSkipActive: false,
  levelSkipInput: "",

  levelScopeStart: 1,
  levelScopeEnd: 1,
  isSpeechUnlocked: false,
  hasSpokenCurrentCard: false,

  // User typing baselines (EMA)
  rtEma: 2.0, // Default 2s reaction time
  cpsEma: 4.0, // Default 4 chars/sec
  
  // Per-card typing signals
  lastKeyTime: 0,
  backspaceCount: 0,
  maxPause: 0,
  speechTimeout: null,
  totalReviews: 0,

  // Advanced SRS and Game Settings
  autoplayEnabled: true,
  targetRetention: 0.9,
  newCardLimit: 20,
};
