# VFS Bot - Agendador Automático de Vistos

Sistema automatizado para monitorizar disponibilidade de vagas e agendar vistos no site VFS Global Brasil.

## 📋 Índice

- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Como Usar](#como-usar)
- [Componentes](#componentes)
- [Troubleshooting](#troubleshooting)

---

## 🔧 Requisitos

- **Node.js** 14+ (recomendado: 16 ou superior)
- **npm** (vem com Node.js)
- **Google Chrome** ou **Chromium** instalado (opcional, mas recomendado para melhor compatibilidade)
- **Windows 10+**, **macOS 10.14+**, ou **Linux** (Ubuntu 18+)

---

## 💻 Instalação

### 1. Clonar ou descarregar o projeto

```bash
cd caminho/do/seu/projeto
# ou
git clone <repo-url>
cd vfs-bot
```

### 2. Instalar dependências Node.js

```powershell
npm install
```

Isto vai instalar:
- `express` - servidor web para o painel de controle
- `playwright` - automação de navegador
- `minimist` - parse de argumentos CLI
- `cors` - suporte CORS
- `dotenv` - variáveis de ambiente
- `nodemailer` - suporte para emails (opcional)

### 3. Instalar navegadores Playwright

```powershell
npx playwright install chromium
```

Ou para instalar vários navegadores:

```powershell
npx playwright install
```

---

## ⚙️ Configuração

### Passo 1: Editar `clients.json`

Adiciona os clientes que deseja agendar. Exemplo:

```json
[
  {
    "firstName": "João",
    "lastName": "Silva",
    "passport": "AA1234567",
    "phone": "+244923456701",
    "email": "joao.silva@gmail.com",
    "dob": "1987-01-23"
  },
  {
    "firstName": "Maria",
    "lastName": "Santos",
    "passport": "AB9876543",
    "phone": "+244923456702",
    "email": "maria.santos@gmail.com",
    "dob": "1992-05-14"
  }
]
```

### Passo 2: Editar `config.json`

Configure os seletores CSS e comportamento do bot:

```json
{
  "baseUrl": "https://visa.vfsglobal.com/ago/pt/bra/login",
  "checkUrl": "https://visa.vfsglobal.com/ago/pt/bra/application-detail",
  "checkIntervalMs": 30000,
  "outputDir": "bot-output/recibos",
  "pauseBeforeConfirm": false,
  "selectors": {
    "startBooking": "button:has-text(\"Start New Booking\")",
    "centerSelect": "select[name=\"centre\"]",
    "serviceSelect": "select[name=\"service\"]",
    "slotList": ".slot, .time-slot, .available-slot",
    "bookButton": "button:has-text(\"Reservar\"), button:has-text(\"Book\")",
    "confirmButton": "button:has-text(\"Confirm\"), button:has-text(\"Pagar\")",
    "receipt": ".receipt, #receipt",
    "form": {
      "name": "#applicantName",
      "phone": "#phone",
      "email": "#email"
    }
  },
  "formData": {
    "center": "Centro de Solicitação de Vistos do Brasil - Luanda",
    "service": "VITUR - Visto de turista (permanência até 90 dias)"
  }
}
```

**Notas importantes:**
- `pauseBeforeConfirm: true` — pausa antes de confirmar (útil para testes)
- `pauseBeforeConfirm: false` — confirma automaticamente (produção)
- Ajusta os seletores conforme o site mude

---

## 🚀 Como Usar

### Fluxo Recomendado (Passo-a-Passo)

#### **1. Iniciar Painel de Controle** (opcional mas recomendado)

Em um terminal separado:

```powershell
node server-control.js
```

Depois acede a: `http://localhost:3000`

O painel mostra:
- Status do bot
- Última verificação
- Screenshots do último agendamento
- Botões para: Forçar verificação, Pausar, Retomar

---

#### **2. Executar o Bot com Login Manual**

```powershell
node bot.js
```

Isto irá:
- Abrir um navegador (Chrome/Chromium)
- Navegar para a página de login do VFS
- **Tu fazes login manualmente** (resolve CAPTCHA, 2FA, etc.)
- Depois de completar o login, **pressiona ENTER no terminal**
- O script salva a sessão em `state.json`
- **Automaticamente executa `fill-clients.js --all=true`** para agendar todos os clientes

---

#### **3. Verificação de Resultados**

Após a execução, verifica:

```powershell
# Ver diretório dos runs
Get-ChildItem .\bot-output\fill-runs | Sort-Object Name -Descending | Select-Object -First 5

# Ver resultado de um cliente específico
Get-Content .\bot-output\fill-runs\<TIMESTAMP>\result.json
```

Cada execução gera:
- `result.json` — resultado (sucesso/erro, detalhes)
- `filled.png` — screenshot do formulário preenchido
- `receipt.png` — screenshot do recibo (se conseguiu agendar)
- `error.html` / `console.log` — debug (se houve erro)

---

### Scripts NPM Disponíveis

```powershell
# Testar preenchimento para 1 cliente (headless)
npm run fill:one

# Agendar todos os clientes (headless)
npm run fill:all

# Com modo visível (útil para debug)
$env:HEADLESS='false'
npm run fill:one
```

---

## 📦 Componentes

### `bot.js`
- Abre navegador com sessão persistente (user-data)
- Guia login manual do utilizador
- Salva `state.json` (sessão autenticada)
- Dispara automaticamente `fill-clients.js --all=true` após login

### `fill-clients.js`
- Lê `clients.json` e `config.json`
- Usa sessão (`state.json`) para aceder ao site já autenticado
- Clica em "Start New Booking"
- Seleciona centro e serviço
- Aguarda vagas (até 60s)
- Preenche formulário e confirma agendamento
- Captura recibo e salva screenshots

### `server-control.js`
- Servidor Express na porta 3000
- API REST para controlar o bot
- Painel web (HTML + JS)
- Endpoints:
  - `GET /status` — estado atual do bot
  - `POST /force` — força verificação imediata
  - `POST /pause` — pausa bot
  - `POST /resume` — retoma bot
  - `GET /logs` — último logs
  - `GET /last-result` — último resultado de agendamento

### `web-ui/`
- Interface web do painel
- `index.html` — estrutura HTML
- `main.js` — lógica JS (fetch, atualização de status)
- `style.css` — estilos

### `config.json`
- URL do site
- Seletores CSS (adaptáveis ao site)
- Dados do formulário

### `clients.json`
- Lista de clientes para agendar
- Campos: firstName, lastName, passport, phone, email, dob

### `state.json` (gerado)
- Sessão autenticada (cookies, tokens)
- Criado por `bot.js` após login manual
- Reutilizado por `fill-clients.js`

---

## 🔐 Segurança

### Proteção com Token (Opcional)

Se quiseres proteger os endpoints do painel:

```powershell
# Define um token antes de rodar server-control.js
$env:CONTROL_API_TOKEN = 'meu-token-secreto'
node server-control.js
```

O painel então exigirá esse token em operações sensíveis (POST).

No painel web, entra o token no campo de "API token" na navbar e clica "Salvar" (fica guardado em localStorage do browser).

---

## 🐛 Troubleshooting

### "No storage state found" ao rodar `fill-clients.js`

**Causa:** Não existe `state.json` (sessão autenticada).

**Solução:**
```powershell
# Rodar bot.js para fazer login e gerar state.json
node bot.js
# Faz login manualmente e pressiona ENTER
```

---

### "no slots found" para todos os clientes

**Causas possíveis:**
- Genuinamente não há vagas disponíveis
- Site mudou estrutura/seletores CSS
- Bot não conseguiu clicar em "Start New Booking"

**Solução:**
```powershell
# Rodar em modo visível para ver o fluxo real
$env:HEADLESS='false'
node fill-clients.js --index=0

# Inspetor do browser (F12) para verificar seletores
```

Se seletores mudaram, atualiza `config.json` com os novos.

---

### Bot não aguarda vagas por 60s

**Solução:** O bot tenta por até 60s com intervalos de 2s. Se quiseres aumentar, edita `fill-clients.js` e muda a constante `timeoutMs` na função de polling.

---

### Screenshots não aparecem no painel

**Verificar:**
```powershell
# Confirma que os screenshots foram salvos
Get-ChildItem .\bot-output\fill-runs\<TIMESTAMP>\ -Filter *.png
```

Se existem, verifica em browser:
- F12 → Console
- Vê se há erros de CORS ou requisição

---

### Erro "Cannot find module"

```powershell
# Certifica-te que instalaste dependências
npm install

# Se o erro persiste, reinstala tudo
rm -r node_modules
npm install
```

---

## 📝 Exemplo Completo (End-to-End)

```powershell
# 1. Instalar dependências (primeira vez)
npm install
npx playwright install chromium

# 2. Editar clients.json com os teus clientes
# (já vem com exemplos)

# 3. Editar config.json (opcional — já vem configurado)
# (se o site mudar, atualiza seletores)

# 4. Iniciar painel (opcional)
node server-control.js
# Acede http://localhost:3000 num outro browser

# 5. Iniciar bot com login
node bot.js
# Faz login manualmente no navegador que abrir
# Pressiona ENTER no terminal após login

# 6. Bot automaticamente tenta agendar todos
# Vê resultados em bot-output/fill-runs/

# 7. Se quiseres rodar novamente (sem fazer login de novo)
npm run fill:all

# 8. Consulta status pelo painel
# http://localhost:3000
```

---

## 📞 Suporte

Se encontrares problemas:

1. **Verifica logs:**
   ```powershell
   Get-Content .\bot-output\fill-runs\<TIMESTAMP>\result.json
   cat .\bot-output\fill-runs\<TIMESTAMP>\error.html
   ```

2. **Roda em modo visível** (`HEADLESS=false`) para ver exatamente o que o bot está a fazer

3. **Atualiza seletores** em `config.json` se o site mudou

---

## 📄 Licença

Este projeto é fornecido "tal como está" para fins educacionais e de automação pessoal.

---

**Última atualização:** Dezembro 2025
