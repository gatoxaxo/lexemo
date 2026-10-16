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
