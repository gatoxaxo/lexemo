// Modulo PURO: divisao silabica do russo + romanizacao.
// Sem DOM e sem estado global - toda funcao recebe e devolve dados.
//
// A romanizacao segue EXATAMENTE o gabarito do projeto (96 pares conferidos):
//   ш=sh  ч=ch  ц=ts  х=k  ж=j  щ=shch
//   и=й=ы=i   ь=ъ=(vazio)   ю=iu  я=ia   е=э=ё=e
//   demais letras = equivalente latino

const VOGAIS = new Set("аеёиоуыэюя".split(""));
const SINAIS = new Set(["ь", "ъ"]);

const ROMANO = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "j",
  з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "k", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "i", ь: "", э: "e",
  ю: "iu", я: "ia",
};

// Romaniza um trecho cirilico. Caracteres fora do mapa passam como estao
// (permite decks mistos sem quebrar).
export function romanizar(texto) {
  let out = "";
  for (const c of String(texto).normalize("NFKC").toLowerCase()) {
    out += Object.prototype.hasOwnProperty.call(ROMANO, c) ? ROMANO[c] : c;
  }
  return out;
}

// Divide uma palavra russa em silabas.
//
// A regra e FONETICA, derivada do gabarito do projeto: entre duas vogais,
//  - 0 consoantes -> corta entre elas (vogais adjacentes viram silabas)
//  - 1 consoante  -> a consoante vai para a silaba SEGUINTE  (V-CV)
//  - 2+ consoantes-> so a ULTIMA vai para a seguinte         (VC-CV)
//
// LIMITE CONHECIDO: e puramente fonetica. O russo tambem divide por morfologia
// (prefixos como со-, про-, and suffixos como -ов-), entao casos como
// "сохранить" saem "сох-ра-нить" em vez de "со-хра-нить". Nao ha regra
// fonetica que resolva isso; a decisao do projeto foi aceitar a divergencia.
//
// Garantia: toda silaba devolvida tem exatamente 1 vogal e nunca COMECA com
// ь/ъ (sinais ficam presos a consoante anterior). Palavras sem vogal
// (ex.: preposicao "в") voltam como silaba unica.
export function dividirSilabas(palavra) {
  const p = String(palavra).normalize("NFKC").toLowerCase();
  if (!p) return [];

  const idxVogais = [];
  for (let i = 0; i < p.length; i++) {
    if (VOGAIS.has(p[i])) idxVogais.push(i);
  }

  if (idxVogais.length <= 1) return [p];

  const cortes = [];
  for (let k = 1; k < idxVogais.length; k++) {
    const consoantes = idxVogais[k] - idxVogais[k - 1] - 1;
    cortes.push(consoantes <= 1 ? idxVogais[k] - consoantes : idxVogais[k] - 1);
  }

  const partes = [];
  let inicio = 0;
  for (const c of cortes) {
    partes.push(p.slice(inicio, c));
    inicio = c;
  }
  partes.push(p.slice(inicio));

  return _prenderSinais(partes);
}

// Um sinal no inicio da silaba pertence a consoante da silaba anterior.
function _prenderSinais(partes) {
  const out = [];
  for (const s of partes) {
    if (!s) continue;
    if (SINAIS.has(s[0]) && out.length > 0) {
      out[out.length - 1] += s;
    } else {
      out.push(s);
    }
  }
  return out;
}

// Sorteia o indice de uma silaba. `rng` e injetado por quem chama para o
// resultado ser reproduzivel nos testes (mesma convencao do motor em
// js/engine, que proibe Math.random interno).
export function escolherSilaba(silabas, rng = Math.random) {
  if (!silabas || silabas.length === 0) return -1;
  return Math.floor(rng() * silabas.length);
}

// --- Modo transcricao ------------------------------------------------------
// Converte um texto livre em russo numa lista de "tokens" prontos para o
// jogador romanizar. Cada token guarda o original (para mostrar na caixa de
// cima) e a romanizacao esperada (para comparar).
//
// Regra: IGNORA PONTUACAO, numeros e qualquer simbolo que nao seja letra
// cirilica ou latina. O exercicio e sobre romanizacao, entao virgula, ponto,
// travessao, aspas e quebra de linha nao podem contar como erro. Palavras
// separadas por esses sinais viram tokens independentes, entao o texto pode
// vir com qualquer formatacao.
//
// Caracteres fora do mapa (ex.: nomes em latim, numeros romanos) sao mantidos
// como estao no token: se o texto misturar "Москва" com "OK", o "OK" vira
// token com romanizacao "ok" (letras latinas passam direto).
const LETRA_CIRILICA = /[\u0400-\u04FF]/;
const LETRA_LATINA = /[a-z]/i;

export function tokenizarTranscricao(texto) {
  const tokens = [];
  const bruto = String(texto || "").normalize("NFKC");

  // Quebra em sequencias de letras (cirilicas ou latinas), descartando o resto.
  const pedacos = bruto.match(/[\u0400-\u04FFa-zA-Z]+/g) || [];

  for (const pedaco of pedacos) {
    // Um pedaco so entra se tiver pelo menos uma letra; isso ja e garantido
    // pela regex, mas mantemos a checagem para clareza.
    const original = pedaco;
    tokens.push({
      original,
      romanizado: romanizar(original),
    });
  }

  return tokens;
}

// O texto tem material suficiente para o exercicio?
export function transcricaoTemConteudo(texto) {
  return tokenizarTranscricao(texto).length > 0;
}

export { LETRA_CIRILICA, LETRA_LATINA };
