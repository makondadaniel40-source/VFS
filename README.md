# VFS Bot — Automação de Agendamentos


Sistema automático para verificar e agendar vistos na plataforma VFS Global (Brasil/Angola).


## 🎯 Características


- ✅ **Painel web simples** — Interface para operadores não-técnicos
- ✅ **Automação com Playwright** — Preenche formulários automaticamente
- ✅ **Múltiplos clientes** — Processa lista de clientes em lote
- ✅ **Sessão persistente** — Mantém login autenticado
- ✅ **Monitoramento em tempo real** — Exibe status e últimas mensagens
- ✅ **Logs detalhados** — Tudo registado em `bot-output/bot.log`


## 📋 Pré-requisitos


- Node.js 18+
- npm ou yarn
- Credenciais VFS válidas


## 🚀 Instalação


```bash
# Clone o repositório
git clone https://github.com/seu-usuario/VFS.git
cd VFS/"vfs node"

# Instale dependências
npm install

# Configure dados sensíveis
cp clients.json.example clients.json
# Edite clients.json com seus dados reais


------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
⚙️ Configuração config.json

Define os seletores CSS do site VFS e URLs:
{
"baseUrl": "https://visa.vfsglobal.com/...",
"selectors": {
"form": { "name": "#applicantName", ... }
}
}
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
clients.json
Lista de clientes a agendar:


[
{
"name": "João Silva",
"phone": "912345678",
"email": "joao@example.com"
}
]
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

🎮 Uso - inicie o servidor (painel web):
node server-control.js
# Acesse: http://localhost:3000

------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
Texte preenchimento individual - cmd
HEADLESS=false node fill-clients.js --index=0

Texte preenchimento individual - cmd
npm run fill:all
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

📁 Estrutura

├── server-control.js      # Express server + orquestração
├── bot.js                 # Login manual e session save
├── fill-clients.js        # Playwright automation
├── config.json            # Seletores e URLs
├── clients.json           # Lista de clientes (ignored)
├── web-ui/                # Frontend estático
│   ├── index.html
│   ├── main.js
│   └── style.css
└── bot-output/            # Resultados, screenshots, logs

------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

⚠️ Segurança
NUNCA commite:
clients.json — dados pessoais
state.json — sessão autenticada
bot-output — screenshots sensíveis
.env — tokens/senhas
Veja .gitignore para lista completa de ficheiros ignorados.

🔍 Troubleshooting
"No slots found"

Verifique se os seletores CSS em config.json estão corretos
Inspecione o site com F12 e atualize os seletores
"Cannot find module" - npm install

Sessão expirada

Delete state.json e playwright-storage.json
Execute bot.js novamente para fazer login
📞 Suporte
Para problemas, verifique:

Logs em bot.log
Screenshots em bot-output/*/
Console do navegador (F12)
📄 Licença
MIT
