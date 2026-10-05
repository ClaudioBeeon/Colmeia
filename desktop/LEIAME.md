# Colmeia para Windows

Uma janela própria pro Colmeia, feita com [Tauri](https://tauri.app). É só uma **moldura**:
abre `https://colmeia.beeon.com.br/` e mostra o site de verdade. Por isso o Colmeia continua se
atualizando sozinho — o programa só precisa ser refeito quando a MOLDURA mudar.

## Instalar
Página **Releases** do repositório → baixar o `.exe` → abrir. Instala só pro usuário (não pede
senha de administrador).

## O que a moldura faz
- janela própria, ícone na barra de tarefas, lembra tamanho e posição;
- uma instância só (abrir de novo traz a janela que já existe pra frente);
- links externos (Drive, WhatsApp, Runrun.it, `adbps://`) abrem no navegador/programa do
  computador, nunca dentro da janela;
- as páginas do CLIENTE (`aprovar.html`, `ajuste.html`, `/adn/...`) também abrem no navegador.

## O painel do ponto
Botão do relógio na barra do topo (só aparece no programa). Abre o site de ponto
(`app.mywork.com.br`, a página inicial — `/ponto` dá "página não encontrada" sem login) numa telinha nativa dentro da MESMA janela, encostada à direita, e o
mesmo botão esconde/mostra (a página fica onde estava). Não dá pra fazer isso numa página comum porque o site do ponto proíbe ser
mostrado dentro de outra página (`X-Frame-Options`). O login do ponto fica guardado no programa.
O site do Colmeia só pode pedir isso ao programa (comando `alternar_ponto`, ver
`capabilities/main.json`) — nada além.

## Link do Drive de algo que está no computador
No card (coluna da direita, só no programa): "Escolher um arquivo" / "Escolher uma pasta". O programa
abre o seletor do Windows e devolve o CAMINHO; o servidor (`linkDoCaminhoLocalNoDrive`, Drive.gs)
descobre o link andando pelas pastas do Drive pelo NOME — o Drive no computador não guarda o ID do
arquivo em lugar nenhum legível. Ponto de partida: o ID de `.shortcut-targets-by-id\<ID>\` no
caminho, ou a pasta já linkada no card. O link é copiado e colocado no campo de comentário (sem
enviar). Se houver dois itens com o mesmo nome no mesmo lugar, o servidor avisa em vez de chutar.

## Abrir a pasta do card no computador
Botão "Abrir a pasta do card no computador" (mesmo bloco). O servidor devolve a CADEIA de pastas do
Drive, da pasta do card até a mais de cima (`ancestraisDaPastaDoCard`, Drive.gs); o programa
(`abrir_pasta_no_computador`) acha qual ID da cadeia existe em `X:\.shortcut-targets-by-id\` e monta
o resto pelos nomes, tentando os dois formatos (`<ID>\<Nome>` e `<ID>` direto). Abre no Explorador.
Só pastas compartilhadas (`.shortcut-targets-by-id`) por enquanto — "Meu Drive" não.

## ⚠️ Arrastar e soltar no Windows
O programa usa `disable_drag_drop_handler()` na janela do Colmeia. Sem isso o Tauri captura todo
arrastar de arquivo e o arrastar e soltar do PRÓPRIO site (cards do quadro, clientes entre
atendimentos, arquivo solto no card) para de funcionar. O preço: um arquivo arrastado chega ao site
sem o caminho dele — por isso o link do Drive usa o seletor, não o arrastar.

## Gerar um instalador novo
GitHub → **Actions** → "Programa desktop (instalador do Windows)" → **Run workflow**. Sai na
página Releases. Pra mudar a versão, altere `version` em `src-tauri/tauri.conf.json` e
`src-tauri/Cargo.toml` (mesmo número nos dois).

## Limites conhecidos
- O botão "Entrar com o Google" abre popup e provavelmente não funciona numa janela de programa
  (o Google bloqueia login em navegador embutido). A chave de acesso funciona normal.
- Windows apenas. O instalador não é assinado: o Windows pode mostrar o aviso "editor
  desconhecido" (SmartScreen) — "Mais informações" → "Executar assim mesmo".
