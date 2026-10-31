/**
 * Turbo7 Agente - Script de MCC do Google Ads
 *
 * O que faz (a cada execução):
 *  1. Exporta, de TODAS as contas da MCC, campanhas (7 e 30 dias), tendência diária
 *     (14 dias) e principais termos de busca (30 dias) para a planilha do agente.
 *  2. Opcional: aplica as ações APROVADAS na aba "Acoes" (pausar/ativar campanha,
 *     orçamento diário com teto de variação, negativar termo). Desligado por padrão.
 *
 * Instalação: Google Ads (MCC) > Ferramentas > Ações em massa > Scripts > +
 * Cole este código, clique em Autorizar, Visualizar e depois Executar.
 * Agende: Frequência "Diariamente" (ou "A cada hora" se usar as ações).
 */

var CONFIG = {
  PLANILHA_URL: 'https://docs.google.com/spreadsheets/d/1UREbDc2c3uIqYm0vU6TPEH4ntFzzlUCLwS3-w_rBJqU/edit',
  APLICAR_ACOES: false,          // true = executa ações aprovadas na aba "Acoes"
  VARIACAO_MAX_ORCAMENTO: 0.20,  // teto de mudança de orçamento por ação (20%)
  CONTAS_EXCLUIDAS: [],          // IDs (só números) que o script deve ignorar
  TERMOS_POR_CONTA: 30,
  // Fila de comandos no GitHub: o agente escreve, este script executa (agende "A cada hora").
  FILA_URL: 'https://raw.githubusercontent.com/pablosampaioturbo7-lgtm/google-ads-mcp/turbo7/google-ads-scripts/fila/fila.json',
  EXECUTAR_FILA_GITHUB: true,
  HORA_EXPORTACAO: 6             // exportação completa de dados 1x por dia, nesta hora
};

var CAB_CAMPANHAS = ['atualizado_em', 'periodo', 'conta_id', 'conta', 'campanha_id', 'campanha',
  'status', 'tipo', 'orcamento_diario', 'impressoes', 'cliques', 'custo', 'conversoes',
  'valor_conversoes', 'ctr', 'cpc', 'cpa', 'parcela_impressoes_busca'];
var CAB_DIARIO = ['atualizado_em', 'conta_id', 'conta', 'data', 'impressoes', 'cliques', 'custo', 'conversoes'];
var CAB_TERMOS = ['atualizado_em', 'conta_id', 'conta', 'campanha_id', 'campanha', 'grupo', 'termo',
  'status_termo', 'impressoes', 'cliques', 'custo', 'conversoes'];
var CAB_ACOES = ['id', 'conta_id', 'campanha_id', 'acao', 'valor', 'motivo', 'aprovado', 'status', 'executado_em'];

function main() {
  var ss = SpreadsheetApp.openByUrl(CONFIG.PLANILHA_URL);
  var fuso = AdsApp.currentAccount().getTimeZone();
  var agora = Utilities.formatDate(new Date(), fuso, 'yyyy-MM-dd HH:mm');
  var previa = AdsApp.getExecutionInfo().isPreview();
  if (CONFIG.EXECUTAR_FILA_GITHUB) processarFila(ss, agora, previa);
  var hora = Number(Utilities.formatDate(new Date(), fuso, 'H'));
  if (hora === CONFIG.HORA_EXPORTACAO || !ss.getSheetByName('Campanhas')) exportar(ss, agora);
}

function exportar(ss, agora) {
  var linhas = { campanhas: [], diario: [], termos: [], contas: [] };

  var contas = AdsManagerApp.accounts().get();
  while (contas.hasNext()) {
    var conta = contas.next();
    var id = conta.getCustomerId().replace(/-/g, '');
    if (CONFIG.CONTAS_EXCLUIDAS.indexOf(id) >= 0) continue;
    AdsManagerApp.select(conta);
    linhas.contas.push([agora, id, conta.getName(), conta.getCurrencyCode()]);
    try {
      coletarCampanhas(agora, id, conta.getName(), 'LAST_7_DAYS', linhas.campanhas);
      coletarCampanhas(agora, id, conta.getName(), 'LAST_30_DAYS', linhas.campanhas);
      coletarDiario(agora, id, conta.getName(), linhas.diario);
      coletarTermos(agora, id, conta.getName(), linhas.termos);
    } catch (e) {
      log(ss, agora, id, 'ERRO_COLETA', String(e));
    }
  }

  escrever(ss, 'Contas', ['atualizado_em', 'conta_id', 'conta', 'moeda'], linhas.contas);
  escrever(ss, 'Campanhas', CAB_CAMPANHAS, linhas.campanhas);
  escrever(ss, 'Diario', CAB_DIARIO, linhas.diario);
  escrever(ss, 'Termos', CAB_TERMOS, linhas.termos);
  prepararAcoes(ss);
  if (CONFIG.APLICAR_ACOES) aplicarAcoes(ss, agora);
  log(ss, agora, '-', 'OK', linhas.contas.length + ' contas exportadas');
}

// ---------- Fila de comandos vinda do GitHub ----------
function processarFila(ss, agora, previa) {
  var r = UrlFetchApp.fetch(CONFIG.FILA_URL + '?v=' + new Date().getTime(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) { log(ss, agora, '-', 'FILA_INDISPONIVEL', 'HTTP ' + r.getResponseCode()); return; }
  var fila = JSON.parse(r.getContentText()).comandos || [];
  var aba = ss.getSheetByName('Execucoes') || ss.insertSheet('Execucoes');
  if (aba.getLastRow() === 0) aba.appendRow(['comando_id', 'conta_id', 'acao', 'resultado', 'executado_em']);
  var feitos = {};
  aba.getDataRange().getValues().forEach(function (l) { feitos[l[0]] = true; });
  fila.forEach(function (c) {
    if (!c.id || feitos[c.id]) return;
    var resultado;
    try {
      var it = AdsManagerApp.accounts().withIds([String(c.conta_id).replace(/\D/g, '')]).get();
      if (!it.hasNext()) resultado = 'ERRO: conta fora da MCC';
      else { AdsManagerApp.select(it.next()); resultado = executarComando(c); }
    } catch (e) { resultado = 'ERRO: ' + e; }
    if (previa) { Logger.log('PREVIA (nada gravado) ' + c.id + ': ' + resultado); return; }
    aba.appendRow([c.id, c.conta_id, c.acao, resultado, agora]);
  });
}

function executarComando(c) {
  var acao = String(c.acao).toUpperCase();
  if (acao === 'CRIAR_GRUPO_RSA') return criarGrupoRsa(c);
  return executar(acao, String(c.campanha_id), c.valor);
}

function criarGrupoRsa(c) {
  var camp = buscarCampanha(c.campanha_id);
  if (!camp) return 'ERRO: campanha nao encontrada';
  if (camp.adGroups().withCondition("ad_group.name = '" + c.grupo + "'").get().hasNext()) return 'IGNORADO: grupo ja existe';
  if ((c.titulos || []).some(function (t) { return t.length > 30; })) return 'BLOQUEADO: titulo acima de 30';
  if ((c.descricoes || []).some(function (d) { return d.length > 90; })) return 'BLOQUEADO: descricao acima de 90';
  var url = c.url_final;
  if (!url) {
    var ads = camp.ads().withCondition("ad_group_ad.status = 'ENABLED'").get();
    while (!url && ads.hasNext()) url = ads.next().urls().getFinalUrl();
  }
  if (!url) return 'BLOQUEADO: sem link final';
  var op = camp.newAdGroupBuilder().withName(c.grupo).withCpc(c.cpc_max || 3)
    .withStatus(c.ativar ? 'ENABLED' : 'PAUSED').build();
  if (!op.isSuccessful()) return 'ERRO grupo: ' + op.getErrors().join('; ');
  var g = op.getResult(), erros = [];
  (c.palavras || []).forEach(function (k) {
    var r = g.newKeywordBuilder().withText(k).build();
    if (!r.isSuccessful()) erros.push(k + ': ' + r.getErrors().join(','));
  });
  var ad = g.newAd().responsiveSearchAdBuilder().withHeadlines(c.titulos).withDescriptions(c.descricoes)
    .withFinalUrl(url).build();
  if (!ad.isSuccessful()) erros.push('anuncio: ' + ad.getErrors().join(','));
  return (erros.length ? 'PARCIAL: ' + erros.join(' | ') : 'OK') + ' (grupo ' + (c.ativar ? 'ATIVO' : 'PAUSADO') + ', link ' + url + ')';
}

function coletarCampanhas(agora, contaId, contaNome, periodo, saida) {
  var q = 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ' +
    'campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, ' +
    'metrics.conversions, metrics.conversions_value, metrics.search_impression_share ' +
    'FROM campaign WHERE segments.date DURING ' + periodo + " AND campaign.status != 'REMOVED'";
  var it = AdsApp.search(q);
  while (it.hasNext()) {
    var r = it.next(), m = r.metrics || {};
    var custo = micros(m.costMicros), cliques = num(m.clicks), imp = num(m.impressions), conv = num(m.conversions);
    saida.push([agora, periodo, contaId, contaNome, r.campaign.id, r.campaign.name, r.campaign.status,
      r.campaign.advertisingChannelType, micros(r.campaignBudget && r.campaignBudget.amountMicros),
      imp, cliques, custo, conv, num(m.conversionsValue),
      imp ? cliques / imp : 0, cliques ? custo / cliques : 0, conv ? custo / conv : '',
      m.searchImpressionShare === undefined ? '' : m.searchImpressionShare]);
  }
}

function coletarDiario(agora, contaId, contaNome, saida) {
  var it = AdsApp.search('SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, ' +
    'metrics.conversions FROM customer WHERE segments.date DURING LAST_14_DAYS');
  while (it.hasNext()) {
    var r = it.next(), m = r.metrics || {};
    saida.push([agora, contaId, contaNome, r.segments.date, num(m.impressions), num(m.clicks),
      micros(m.costMicros), num(m.conversions)]);
  }
}

function coletarTermos(agora, contaId, contaNome, saida) {
  var it = AdsApp.search('SELECT campaign.id, campaign.name, ad_group.name, search_term_view.search_term, ' +
    'search_term_view.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions ' +
    'FROM search_term_view WHERE segments.date DURING LAST_30_DAYS ' +
    'ORDER BY metrics.cost_micros DESC LIMIT ' + CONFIG.TERMOS_POR_CONTA);
  while (it.hasNext()) {
    var r = it.next(), m = r.metrics || {};
    saida.push([agora, contaId, contaNome, r.campaign.id, r.campaign.name, r.adGroup.name,
      r.searchTermView.searchTerm, r.searchTermView.status, num(m.impressions), num(m.clicks),
      micros(m.costMicros), num(m.conversions)]);
  }
}

function aplicarAcoes(ss, agora) {
  var aba = ss.getSheetByName('Acoes');
  var dados = aba.getDataRange().getValues();
  var porConta = {};
  for (var i = 1; i < dados.length; i++) {
    var l = dados[i];
    if (String(l[6]).toUpperCase() !== 'SIM' || l[7]) continue;
    var cid = String(l[1]).replace(/\D/g, '');
    (porConta[cid] = porConta[cid] || []).push(i);
  }
  for (var cid in porConta) {
    var it = AdsManagerApp.accounts().withIds([cid]).get();
    if (!it.hasNext()) { porConta[cid].forEach(function (i) { marcar(aba, i, 'ERRO: conta fora da MCC', agora); }); continue; }
    AdsManagerApp.select(it.next());
    porConta[cid].forEach(function (i) {
      var l = dados[i];
      try { marcar(aba, i, executar(String(l[3]).toUpperCase(), String(l[2]), l[4]), agora); }
      catch (e) { marcar(aba, i, 'ERRO: ' + e, agora); }
    });
  }
}

function executar(acao, campanhaId, valor) {
  var c = buscarCampanha(campanhaId);
  if (!c) return 'ERRO: campanha nao encontrada';
  if (acao === 'PAUSAR_CAMPANHA') { c.pause(); return 'OK'; }
  if (acao === 'ATIVAR_CAMPANHA') { c.enable(); return 'OK'; }
  if (acao === 'ALTERAR_ORCAMENTO_DIARIO') {
    var b = c.getBudget(), atual = b.getAmount(), novo = Number(valor);
    if (b.isExplicitlyShared()) return 'BLOQUEADO: orcamento compartilhado';
    if (!(novo > 0)) return 'BLOQUEADO: valor invalido';
    if (Math.abs(novo - atual) / atual > CONFIG.VARIACAO_MAX_ORCAMENTO)
      return 'BLOQUEADO: variacao acima de ' + CONFIG.VARIACAO_MAX_ORCAMENTO * 100 + '% (atual ' + atual + ')';
    b.setAmount(novo); return 'OK: ' + atual + ' -> ' + novo;
  }
  if (acao === 'NEGATIVAR_TERMO') {
    if (!c.addNegativeKeyword) return 'BLOQUEADO: tipo de campanha nao aceita negativa por script';
    c.addNegativeKeyword('[' + String(valor).replace(/[\[\]"]/g, '') + ']'); return 'OK';
  }
  return 'BLOQUEADO: acao desconhecida';
}

function buscarCampanha(id) {
  var seletores = [AdsApp.campaigns(), AdsApp.performanceMaxCampaigns()];
  for (var s = 0; s < seletores.length; s++) {
    var it = seletores[s].withIds([Number(id)]).get();
    if (it.hasNext()) return it.next();
  }
  return null;
}

function prepararAcoes(ss) {
  var aba = ss.getSheetByName('Acoes') || ss.insertSheet('Acoes');
  if (aba.getLastRow() === 0) aba.appendRow(CAB_ACOES);
}

function marcar(aba, i, status, agora) { aba.getRange(i + 1, 8, 1, 2).setValues([[status, agora]]); }

function escrever(ss, nome, cabecalho, linhas) {
  var aba = ss.getSheetByName(nome) || ss.insertSheet(nome);
  aba.clearContents();
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  if (linhas.length) aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
  aba.setFrozenRows(1);
}

function log(ss, agora, conta, tipo, msg) {
  var aba = ss.getSheetByName('Log') || ss.insertSheet('Log');
  if (aba.getLastRow() === 0) aba.appendRow(['quando', 'conta_id', 'tipo', 'mensagem']);
  aba.appendRow([agora, conta, tipo, msg]);
}

function num(v) { return v === undefined || v === null ? 0 : Number(v); }
function micros(v) { return v === undefined || v === null ? 0 : Math.round(Number(v) / 10000) / 100; }
