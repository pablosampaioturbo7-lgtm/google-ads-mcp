/**
 * Turbo7 Agente - Carregador automático a partir do GitHub
 *
 * Cole ESTE script uma única vez no Google Ads e agende (ex.: Diariamente, 6h).
 * A cada execução ele baixa a versão mais nova do script escolhido no GitHub e a executa.
 * Atualizações enviadas ao repositório passam a valer sozinhas, sem colar código de novo.
 *
 *  - Na MCC da Turbo7:   SCRIPT = 'turbo7_agente.js'        (exporta dados de todas as contas)
 *  - Numa conta cliente: SCRIPT = 'turbo7_teste_anuncio.js' (teste de criação de anúncio)
 */

var SCRIPT = 'turbo7_agente.js';
// Para onde o script envia resultados e dados (n8n da Turbo7). Não publique este endereço.
var WEBHOOK_URL = ''; // preencha com o endereço do receptor n8n (fornecido no chat, não publique)
// true = exporta os dados de todas as contas nesta execução (além da rotina diária das 6h)
var FORCAR_EXPORTACAO = false;
var BASE = 'https://raw.githubusercontent.com/pablosampaioturbo7-lgtm/google-ads-mcp/turbo7/google-ads-scripts/';

function main() {
  var resposta = UrlFetchApp.fetch(BASE + SCRIPT + '?v=' + new Date().getTime(), { muteHttpExceptions: true });
  if (resposta.getResponseCode() !== 200) {
    throw new Error('Não foi possível baixar ' + SCRIPT + ' do GitHub (HTTP ' + resposta.getResponseCode() + ').');
  }
  var codigo = resposta.getContentText();
  Logger.log('Executando ' + SCRIPT + ' (' + codigo.length + ' caracteres) direto do GitHub.');
  new Function(codigo + '\nmain();')();
}
