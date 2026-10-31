/**
 * Turbo7 Agente - Teste de criação de anúncio no Google Ads (script de CONTA, não de MCC)
 *
 * Cria, dentro da primeira campanha de PESQUISA ativa da conta:
 *   - 1 grupo de anúncios "[TESTE AGENTE] ..." com 3 palavras-chave de frase
 *   - 1 anúncio responsivo de pesquisa (RSA)
 * O link final é copiado de um anúncio ativo da própria conta (nada é inventado).
 *
 * Como usar: na conta do cliente (ex.: Maison) > Ferramentas > Ações em massa > Scripts > +
 *   1. Cole o código e clique em Autorizar.
 *   2. Clique em VISUALIZAR: mostra o que seria criado, sem alterar nada.
 *   3. Se estiver certo, clique em EXECUTAR.
 * Com ATIVAR = false, o grupo nasce PAUSADO (sem gasto). Com true, nasce ativo.
 */

var CONFIG = {
  ATIVAR: true,                       // true = grupo de teste já ativo; false = pausado
  CAMPANHA_CONTEM: '',                // filtro opcional pelo nome da campanha
  NOME_GRUPO: '[TESTE AGENTE] PLANEJADOS 31/10/26',
  CPC_MAX: 3.00,                      // usado só se a campanha for de CPC manual
  PALAVRAS: ['"moveis planejados"', '"cozinha planejada"', '"loja de moveis planejados"'],
  TITULOS: [
    'Móveis Planejados Sob Medida', 'Cozinha Planejada Completa', 'Visite Nosso Showroom',
    'Projeto 3D Para o Seu Espaço', 'Acabamento de Alto Padrão', 'Agende Sua Visita Hoje'
  ],
  DESCRICOES: [
    'Ambientes planejados desenhados para o seu espaço e a sua rotina. Agende uma visita.',
    'Cozinhas, dormitórios e salas sob medida, com projeto e acabamento de alto padrão.'
  ]
};

function main() {
  var campanha = acharCampanha();
  if (!campanha) { Logger.log('PARADO: nenhuma campanha de pesquisa ativa encontrada.'); return; }
  var url = acharUrlFinal(campanha);
  if (!url) { Logger.log('PARADO: nenhum anúncio ativo com link final para copiar.'); return; }
  Logger.log('Campanha: ' + campanha.getName() + ' | link final: ' + url);

  var existe = campanha.adGroups().withCondition("ad_group.name = '" + CONFIG.NOME_GRUPO + "'").get();
  if (existe.hasNext()) { Logger.log('PARADO: grupo de teste já existe.'); return; }

  var op = campanha.newAdGroupBuilder()
    .withName(CONFIG.NOME_GRUPO)
    .withCpc(CONFIG.CPC_MAX)
    .withStatus(CONFIG.ATIVAR ? 'ENABLED' : 'PAUSED')
    .build();
  if (!op.isSuccessful()) { Logger.log('ERRO grupo: ' + op.getErrors().join('; ')); return; }
  var grupo = op.getResult();

  CONFIG.PALAVRAS.forEach(function (k) {
    var r = grupo.newKeywordBuilder().withText(k).build();
    Logger.log((r.isSuccessful() ? 'OK palavra: ' : 'ERRO palavra: ') + k + (r.isSuccessful() ? '' : ' ' + r.getErrors()));
  });

  var anuncio = grupo.newAd().responsiveSearchAdBuilder()
    .withHeadlines(CONFIG.TITULOS)
    .withDescriptions(CONFIG.DESCRICOES)
    .withFinalUrl(url)
    .build();
  Logger.log(anuncio.isSuccessful() ? 'OK anúncio responsivo criado' : 'ERRO anúncio: ' + anuncio.getErrors().join('; '));
  Logger.log('Grupo "' + CONFIG.NOME_GRUPO + '" criado como ' + (CONFIG.ATIVAR ? 'ATIVO' : 'PAUSADO') + '.');
}

function acharCampanha() {
  var sel = AdsApp.campaigns()
    .withCondition("campaign.status = 'ENABLED'")
    .withCondition("campaign.advertising_channel_type = 'SEARCH'");
  if (CONFIG.CAMPANHA_CONTEM) sel = sel.withCondition("campaign.name LIKE '%" + CONFIG.CAMPANHA_CONTEM + "%'");
  var it = sel.get();
  return it.hasNext() ? it.next() : null;
}

function acharUrlFinal(campanha) {
  var it = campanha.ads().withCondition("ad_group_ad.status = 'ENABLED'").get();
  while (it.hasNext()) {
    var u = it.next().urls().getFinalUrl();
    if (u) return u;
  }
  return null;
}
