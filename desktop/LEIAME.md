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

## Gerar um instalador novo
GitHub → **Actions** → "Programa desktop (instalador do Windows)" → **Run workflow**. Sai na
página Releases. Pra mudar a versão, altere `version` em `src-tauri/tauri.conf.json` e
`src-tauri/Cargo.toml` (mesmo número nos dois).

## Limites conhecidos
- O botão "Entrar com o Google" abre popup e provavelmente não funciona numa janela de programa
  (o Google bloqueia login em navegador embutido). A chave de acesso funciona normal.
- Windows apenas. O instalador não é assinado: o Windows pode mostrar o aviso "editor
  desconhecido" (SmartScreen) — "Mais informações" → "Executar assim mesmo".
