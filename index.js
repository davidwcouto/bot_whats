const mysql = require('mysql2/promise');
require('dotenv').config();

process.on("unhandledRejection", err => {
    const mensagem = String(err?.message || err);

    if (
        mensagem.includes("Execution context was destroyed") ||
        mensagem.includes("Runtime.callFunctionOn")
    ) {
        console.warn(
            "⚠ O contexto do WhatsApp Web foi recarregado durante uma operação."
        );
        return;
    }

    console.error(
        "UNHANDLED REJECTION:",
        err?.stack || err
    );
});

process.on('uncaughtException', err => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

const db = mysql.createPool({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT,
    waitForConnections: true,
    connectionLimit: 10
});

const fs = require("fs");
const cryptoEntregas = require('crypto');
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const path = require("path");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const express = require('express');
const qrcode = require("qrcode-terminal");
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;
const inicioBot = Math.floor(Date.now() / 1000);	
const { DateTime } = require("luxon");
const Tesseract = require("tesseract.js");
const multer = require("multer");
const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- Carregar contatos autorizados a partir do arquivo de textoo --
let allowedContacts = [];
try {
  const contactsData = fs.readFileSync("allowed.txt", "utf8");
  // Divide o conteúdo em linhas, remove espaços e filtra linhas vaziass
  allowedContacts = contactsData
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);
  console.log("Contatos autorizados carregados:");
} catch (err) {
  console.error("Erro ao carregar contatos do arquivo allowed.txt:", err.message);
}

// Criando o cliente do WhatsApp Web
const client = new Client({
    authStrategy: new LocalAuth(),

    puppeteer: {
        headless: true,

        executablePath:
            process.env.PUPPETEER_EXECUTABLE_PATH,

        protocolTimeout: 90000,

        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage"
        ]
    }
});

let atendimentoHumano = new Set(); // Armazena usuários em atendimento humano
let clientesAtendidos = new Set(); // Garante que a mensagem inicial só seja enviada uma vez por cliente
let silencedChats = new Set(); // Lista de conversas silenciadas
let ultimoProdutoConsultado = new Map(); // Guardar o últiimo produto consultadoo

// Gera o QR Code para autenticação
client.on("qr", (qr) => {
    console.log("Escaneie este QR Code no WhatsApp Web:");
    qrcode.generate(qr, { small: true });
});

// Confirma que o bot foi iniciado
client.on('ready', async () => {
    console.log("🤖 Bot conectado e pronto para uso!");
	
	  const page = await client.pupPage; 
	
	  await page.evaluate(() => {
    if (window.WWebJS && window.WWebJS.sendSeen) {
      window.WWebJS.sendSeen = () => {};
    }
  });
});

// Funções para remover clientes da lista
const removerAtendimentoHumano = (chatId) => {
    setTimeout(async () => {
        if (atendimentoHumano.has(chatId)) {
            atendimentoHumano.delete(chatId);
        }
    }, 60 * 60 * 1000);
};

const removerClientesAtendidos = (chatId) => {
    setTimeout(() => {
        clientesAtendidos.delete(chatId);
    }, 60 * 60 * 1000);
};

const removerSilencedChats = (chatId) => {
    setTimeout(() => {
		silencedChats.delete(chatId);
		clientesAtendidos.delete(chatId);
    }, 30 * 60 * 1000);
};

// Função para buscar preços
function normalizarTexto(texto) {
    return String(texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function formatarPreco(valor) {
    if (valor === null || valor === undefined || valor === "") {
        return "0,00";
    }

    let numero;

    if (typeof valor === "number") {
        numero = valor;
    } else {
        const texto = String(valor).trim();

        // Formato brasileiro: 1.250,90
        if (texto.includes(",") && texto.includes(".")) {
            numero = Number(
                texto
                    .replace(/\./g, "")
                    .replace(",", ".")
            );

        // Formato brasileiro simples: 70,00
        } else if (texto.includes(",")) {
            numero = Number(texto.replace(",", "."));

        // Formato da API: 70.00
        } else {
            numero = Number(texto);
        }
    }

    if (!Number.isFinite(numero)) {
        console.error("Preço inválido recebido do GestãoClick:", valor);
        return "0,00";
    }

    return numero.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function prepararPesquisa(texto) {
    let pesquisa = normalizarTexto(texto);
	
	// Remove marcas que podem não estar no nome cadastrado
	pesquisa = pesquisa
	  .replace(/\bsamsung\b/g, '')
	  .replace(/\bmotorola\b/g, '')
	  .replace(/\bapple\b/g, '')
	  .replace(/\s+/g, ' ')
	  .trim();

    // Tela
    pesquisa = pesquisa.replace(/\bdisplay\b/g, "tela");
    pesquisa = pesquisa.replace(/\bfrontal\b/g, "tela");
    pesquisa = pesquisa.replace(/\bcombo\b/g, "tela");
	pesquisa = pesquisa.replace(/\bnacional\b/g, "nac");

    // Placa de carga
	pesquisa = pesquisa.replace(/\bdock de carga iphone\b/g, "flex de carga");	
	pesquisa = pesquisa.replace(/\bdock iphone\b/g, "flex de carga");
	pesquisa = pesquisa.replace(/\bdock\b/g, "placa de carga");
	pesquisa = pesquisa.replace(/\placa\b/g, "placa de carga");	

    // Se não informou o tipo da peça, assume tela
    const tipos = [
        "tela",
        "bateria",
        "placa de carga",
        "flex",
		"tampa",
		"cola",
		"chave",
		"luva",
		"conector"
    ];

    const possuiTipo = tipos.some(tipo => pesquisa.includes(tipo));

    if (!possuiTipo) {
        pesquisa = "tela " + pesquisa;
    }

    return pesquisa.trim();
}

function pesquisaValida(pesquisa) {
    const tiposPermitidos = [
        "tela",
        "bateria",
        "placa de carga",
        "flex",
		"tampa",
		"cola",
		"chave",
		"luva",
		"conector"
    ];

    return tiposPermitidos.some(tipo =>
        pesquisa.includes(tipo)
    );

}

async function buscarPreco(produto, chatId) {
    if (!produto) {
        return "⚠ Nenhum produto foi informado. Digite o nome corretamente.";
    }

    const pesquisa = prepararPesquisa(produto);

    if (!pesquisaValida(pesquisa)) {
        return `⚠️ Para consultar, digite o *tipo da peça* e o *modelo do aparelho*.

Exemplos:
• tela A12
• bateria A12
• placa de carga A12
• flex A12

Digite novamente sua consulta.`;
    }

    if (
        !process.env.GESTAOCLICK_ACCESS_TOKEN ||
        !process.env.GESTAOCLICK_SECRET_ACCESS_TOKEN
    ) {
        console.error("Tokens do GestãoClick não configurados no .env.");

        return `⚠ Não consegui consultar o sistema agora.

Digite 2️⃣ para atendimento.`;
    }

    try {
        const resposta = await axios.get(
            "https://api.gestaoclick.com/produtos",
            {
                headers: {
                    "access-token":
                        process.env.GESTAOCLICK_ACCESS_TOKEN,

                    "secret-access-token":
                        process.env.GESTAOCLICK_SECRET_ACCESS_TOKEN,

                    "Accept": "application/json"	
                },

                params: {
					loja_id: 552685,
					nome: pesquisa,
					ativo: 1
				},

                timeout: 15000
            }
        );

        const produtos = Array.isArray(resposta.data?.data)
            ? resposta.data.data
            : [];

        const palavrasPesquisa = pesquisa
            .split(" ")
            .filter(Boolean);

		const encontrados = produtos.filter(item => {
			const nomeProduto = normalizarTexto(item.nome);

			if (!nomeProduto) {
				return false;
			}

			const correspondePesquisa = palavrasPesquisa.every(palavra =>
				nomeProduto.includes(palavra)
			);

			const estoque = Number(
				String(item.estoque ?? "0")
					.replace(",", ".")
			);

			const possuiEstoque =
				Number.isFinite(estoque) &&
				estoque > 0;

			return correspondePesquisa && possuiEstoque;
		});

        if (encontrados.length === 0) {
            return `❌ Produto não encontrado.

		Exemplos:
		• tela A12
		• bateria A12
		• placa de carga A12
		• flex A12

		Para atendimento digite 2️⃣`;
        }

        const encontradosLimitados = encontrados.slice(0, 15);

        /*
         * Guarda o primeiro resultado para manter compatibilidade
         * com a opção 3 do seu bot.
         */
        ultimoProdutoConsultado.set(chatId, {
            Produto: encontradosLimitados[0].nome,
            Preco: encontradosLimitados[0].valor_venda,
            Estoque: encontradosLimitados[0].estoque,
            Imagem: null
        });

        setTimeout(() => {
            ultimoProdutoConsultado.delete(chatId);
        }, 30 * 60 * 1000);

        let mensagem =
            `🔎 No estoque temos essas opções para ` +
            `*${produto.toUpperCase()}*:\n\n`;

        encontradosLimitados.forEach((item, index) => {
            mensagem += `${index + 1}️⃣ *${item.nome}*\n`;
            mensagem +=
                `💰 R$ ${formatarPreco(item.valor_venda)}\n`;

            if (
                item.estoque !== undefined &&
                item.estoque !== null &&
                item.estoque !== ""
            )

            mensagem += "\n";
        });

        mensagem += "Para fazer pedido digite 2️⃣";

        return mensagem;

    } catch (erro) {
        console.error("❌ Erro ao consultar GestãoClick:", {
            mensagem: erro.message,
            status: erro.response?.status,
            resposta: erro.response?.data
        });

        if (erro.code === "ECONNABORTED") {
            return `⚠ O GestãoClick demorou para responder.

Tente novamente ou digite 2️⃣ para atendimento.`;
        }

        if (
            erro.response?.status === 401 ||
            erro.response?.status === 403
        ) {
            return `⚠ Não foi possível autenticar no GestãoClick.

Digite 2️⃣ para atendimento.`;
        }

        return `⚠ Não consegui consultar o GestãoClick agora.

Digite 2️⃣ para atendimento.`;
    }
}

const horarioAtendimento = {
    inicio: 9,        // 09:00
    fim: 18,          // 18:00
    minutosFim: 00,   // Até 18:30
    intervaloInicio: 12,   // Início do intervalo de não atendimento
    intervaloFim: 12,     // Fim do intervalo de não atendimento
};

// Horário de atendimento especial para sabado
const horarioSabado = {
    inicio: 9,        // 09:00
    fim: 17,          // 18:00 (horário reduzido para sabado)
    minutosFim: 00,    // Sem minutos após as 18:00
    intervaloInicio: 12,   // Início do intervalo de não atendimentoo
    intervaloFim: 12,     // Fim do intervalo de não atendimento
};

// Função para verificar se está dentro do horário de atendimento
const estaDentroDoHorario = () => {
	const agoraBrasil = DateTime.now().setZone("America/Sao_Paulo");
    const horaAtual = agoraBrasil.hour;
    const minutosAtuais = agoraBrasil.minute;
    const diaSemana = agoraBrasil.weekday; // 1 - Segunda, 2 - Terça, ..., 7 - Domingo

    // Se for Domingo (dia 7)
    if (diaSemana === 7) {
            return false;
        }

    // Se for sabado (dia 6)
    if (diaSemana === 6) {
        // Horário reduzido no sabado (09:00 - 18:00 com intervalo de almoço)
        if (horaAtual >= horarioSabado.inicio && horaAtual < horarioSabado.intervaloInicio) {
            return true; // Entre 09:00 e 12:00
        }

        if (horaAtual >= horarioSabado.intervaloFim && horaAtual < horarioSabado.fim) {
            return true; // Entre 13:00 e 18:00
        }

        return false; // Fora do horário de atendimento ou dentro do intervalo de não atendimento
    }

    // Horário normal de segunda a sexta (09:00 - 18:00 com intervalo de almoço)
    if (horaAtual >= horarioAtendimento.inicio && horaAtual < horarioAtendimento.intervaloInicio) {
        return true; // Entre 09:00 e 12:00
    }

    if (horaAtual >= horarioAtendimento.intervaloFim && horaAtual < horarioAtendimento.fim) {
        return true; // Entre 13:00 e 18:00
    }

    // Verifica se a hora está dentro do intervalo de 18:00 até 18:30
    if (horaAtual === horarioAtendimento.fim && minutosAtuais <= horarioAtendimento.minutosFim) {
        return true; // Entre 18:00 e 18:30
    }

    return false; // Fora do horário de atendimento ou dentro do intervalo de não atendimento
};

// FUNÇÃO PARA ENVIAR LISTA DE TRANSMISSAO
async function enviarMensagemEmMassa(texto, caminhoImagem) {
    console.log("🚀 Iniciando envio em massa...");
	
	if (!caminhoImagem) {
    console.log("Sem imagem, enviando só texto...");
    
    for (const numero of allowedContacts) {
        const chatId = numero + "@c.us";
        await client.sendMessage(chatId, texto);
		
		console.log("✅ Enviado para:", numero);
		
		const delay = Math.floor(Math.random() * 3000) + 4000;
		await new Promise(r => setTimeout(r, delay));
		}

    console.log("✅ Disparo finalizado.");
    return;
}

	if (path.extname(caminhoImagem).toLowerCase() === ".jpeg" || path.extname(caminhoImagem).toLowerCase() === ".jpg" || path.extname(caminhoImagem).toLowerCase() === ".png") {
    for (const numero of allowedContacts) {
        const chatId = numero + "@c.us";

        try {
            if (caminhoImagem) {
				const ext = path.extname(caminhoImagem).toLowerCase();

				let mimetype = "image/jpeg";

				const media = new MessageMedia(
					mimetype,
					fs.readFileSync(caminhoImagem, { encoding: "base64" })
				);
				
				await client.sendMessage(chatId, media, {
                    caption: texto
                });
				
            } else {
                await client.sendMessage(chatId, texto);
            }

            console.log("✅ Enviado para:", numero);

            const delay = Math.floor(Math.random() * 4000) + 4000;
			await new Promise(r => setTimeout(r, delay));

        } catch (erro) {
            console.log("❌ Erro ao enviar para:", numero);
        }
    }}
	
	if (path.extname(caminhoImagem).toLowerCase() === ".mp4" || path.extname(caminhoImagem).toLowerCase() === ".mov") {
    for (const numero of allowedContacts) {
        const chatId = numero + "@c.us";

        try {
            if (caminhoImagem) {
				const ext = path.extname(caminhoImagem).toLowerCase();

				let mimetype = "video/mp4";

				const media = new MessageMedia(
					mimetype,
					fs.readFileSync(caminhoImagem, { encoding: "base64" })
				);
				
				await client.sendMessage(chatId, media, {
                    caption: texto
                });
				
            } else {
                await client.sendMessage(chatId, texto);
            }

            console.log("✅ Enviado para:", numero);

            const delay = Math.floor(Math.random() * 4000) + 4000;
			await new Promise(r => setTimeout(r, delay));

        } catch (erro) {
            console.log("❌ Erro ao enviar para:", numero);
        }
    }}

    console.log("✅ Disparo finalizado.");
	
    if (fs.existsSync(caminhoImagem)) {
        fs.unlink(caminhoImagem, (err) => {
            if (err) console.log("Erro ao excluir:", err.message);
            else console.log("🗑️ Arquivo removido");
        });
    }	
}

client.on('disconnected', (reason) => {
    console.log('❌ Cliente desconectado:', reason);
});

client.on('auth_failure', msg => {
    console.log('❌ Falha autenticação:', msg);
});

client.on('change_state', state => {
    console.log('🔄 Estado mudou:', state);
});

client.on("message_revoke_everyone", async (after, before) => {

    if (!before) return;
	
	if (before.from === "status@broadcast" || before.from.endsWith("@g.us")) {
		return;
	}

    let numeroAtendente = null;
    let numeroCliente = null;

    if (before.fromMe) {
        // Loja enviou mensagem e apagou
        numeroAtendente = before.from.split("@")[0];
        numeroCliente = before.to.split("@")[0];
    } else {
        // Cliente enviou e apagou
        numeroCliente = before.from.split("@")[0];
        numeroAtendente = before.to.split("@")[0];
    }

    try {
        await db.execute(`
            INSERT INTO mensagens_excluidas 
            (message_id, chat, body, numero_atendente, numero_cliente, data_envio, data_exclusao)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            before.id.id,
            before.from,
            before.body || "[MÍDIA]",
            numeroAtendente,
            numeroCliente,
            new Date(before.timestamp * 1000),
            new Date()
        ]);

        console.log("Mensagem excluída salva com números separados.");

    } catch (error) {
        console.error("Erro ao salvar mensagem excluída:", error.message);
    }
});

// Evento para DETECTAR mensagens enviadas pelo próprio usuário e SILENCIAR a conversa
client.on("message_create", async (message) => {
	
    // só processa mensagens enviadas pelo bot
    if (!message.fromMe) return;

    const chatId = message.to || message.from;

    // garante que body nunca seja undefined
    const body = message.body || "";

    // palavras-chave que IDENTIFICAM resposta automática
        const mensagensDoBot = [
		"📞",
		"💰",
		"⏳",
		"❌",
		"⚠",
		"⚠️",
		"🔎",
		"Olá!",
		"Digite o nome do produto",
		"Como posso te ajudar?",
		"Para fazer pedido digite 2️⃣",
		"Digite a opção",
		"Nenhum produto",
		"Para consultar",
		"tipo da peça",
		"modelo do aparelho",
		"Digite novamente sua consulta"
		];

    const ehMensagemDoBot = mensagensDoBot.some(palavra =>
        body.includes(palavra)
    );

    // 🔒 só silencia se NÃO for mensagem automática
    if (!ehMensagemDoBot) {
        silencedChats.add(chatId);
        console.log(`Chat silenciado manualmente: ${chatId}`);
        removerSilencedChats(chatId);
    }
});

	// Função pra ajeitar o downloadMedia() até sair atualização do whatsapp-web.js
	function corrigirIdMensagem(message) {
		if (!message?.id) {
			return false;
		}

		if (message.id._serialized) {
			return true;
		}

		if (message.id.$1) {
			message.id._serialized = message.id.$1;
			return true;
		}

		if (
			message.id.fromMe !== undefined &&
			message.id.remote &&
			message.id.id
		) {
			message.id._serialized =
				`${message.id.fromMe}_${message.id.remote}_${message.id.id}`;

			return true;
		}

		return false;
	}
	
function normalizarTelefoneBrasil(telefone) {
  let numero = String(telefone || '').replace(/\D/g, '');

  if (!numero) {
    throw new Error('Telefone não informado');
  }

  if (numero.startsWith('55')) {
    return numero;
  }

  return `55${numero}`;
}

function normalizarTelefoneConta(telefone) {
    let numero = String(telefone || '')
        .replace(/\D/g, '');

    if (
        numero.startsWith('55') &&
        (numero.length === 12 || numero.length === 13)
    ) {
        numero = numero.substring(2);
    }

    return numero;
}

function converterValorConta(valor) {
    if (
        valor === null ||
        valor === undefined ||
        valor === ''
    ) {
        return NaN;
    }

    if (typeof valor === 'number') {
        return valor;
    }

    let texto = String(valor)
        .replace(/R\$/gi, '')
        .trim();

    if (
        texto.includes('.') &&
        texto.includes(',')
    ) {
        texto = texto
            .replace(/\./g, '')
            .replace(',', '.');
    } else if (texto.includes(',')) {
        texto = texto.replace(',', '.');
    }

    return Number(texto);
}

function formatarValorConta(valor) {
    return Number(valor || 0).toLocaleString(
        'pt-BR',
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );
}

function escaparHtml(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatarDataBrasil(data) {
    if (!data) {
        return '';
    }

    return new Date(data).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo'
    });
}

function mensagemPainel(texto, tipo = 'sucesso') {
    const classe =
        tipo === 'erro'
            ? 'alerta erro'
            : 'alerta sucesso';

    return `
        <div class="${classe}">
            ${escaparHtml(texto)}
        </div>
    `;
}

function montarMensagemPedido(dados) {
  let mensagem =
    `Pedido nº ${dados.pedido}\n` +
    `Cliente: ${dados.cliente || 'cliente'}\n` +
    `Endereço: ${dados.endereco}\n` +
	`Cidade: ${dados.cidade}\n`;

	if (dados.produtos?.length) {
		mensagem += `*Produtos:*\n`;

	for (const produto of dados.produtos) {
		mensagem +=
		  `• ${produto.nome}\n` +
		  `  Qtd: ${produto.quantidade} |`;

		if (produto.desconto && produto.desconto !== '0,00') {

		  mensagem +=
			`  Vlr. Unit: R$ ${produto.valorUnitario}\n` +
			`  Desc. Item: R$ ${produto.desconto}\n`;

		}

		mensagem +=
		  `  Valor: R$ ${produto.valorTotal}\n\n`;
	  }
	}

  if (dados.valorProdutos) {
    mensagem +=
      `Valor dos produtos: R$ ${dados.valorProdutos}\n`;
  }

  if (
    dados.desconto &&
    dados.desconto !== '0,00'
  ) {
    mensagem +=
      `Desconto geral: R$ ${dados.desconto}\n`;
  }

  mensagem +=
    `*Total: R$ ${dados.total || '0,00'}*\n`;

  if (dados.formaPagamento) {
    mensagem +=
      `Forma de pagamento: ${dados.formaPagamento}\n`;
  }

  if (
    dados.coleta &&
    dados.coleta.toLowerCase() !== 'sem' &&
    dados.coleta.toLowerCase() !== 'sem coleta' &&
    dados.coleta.toLowerCase() !== 'sem coletas'
  ) {
    mensagem +=
      `Coletar: ${dados.coleta}\n`;
  }

  mensagem +=
    `\nAtendente: ${dados.atendente || 'Não informado'}\n` +
    `A Coutech Cell agradece a preferência!`;

  return mensagem;
}

function montarMensagemSaldo(dados) {
  return (
`💳 *ATUALIZAÇÃO DA SUA CONTA*

💰 Valor recebido:
R$ ${dados.valorPagamento}

📌 Forma de pagamento:
${dados.formaPagamento}

💳 Saldo atual:
*R$ ${dados.saldo}*

Obrigado pela preferência!
*COUTECH CELL*`
  );
}

async function enviarSaldoWhatsApp({
  telefone,
  cliente,
  valorPagamento,
  formaPagamento,
  saldo
}) {
  if (!client.info) {
    throw new Error('WhatsApp não está conectado');
  }

  const numero = normalizarTelefoneBrasil(telefone);

  const numeroWhatsApp =
    await client.getNumberId(numero);

  if (!numeroWhatsApp) {
    throw new Error(
      `O número ${telefone} não foi encontrado no WhatsApp`
    );
  }

  const mensagem = montarMensagemSaldo({
    cliente,
    valorPagamento,
    formaPagamento,
    saldo
  });

  await client.sendMessage(
    numeroWhatsApp._serialized,
    mensagem
  );

  console.log(
    `💳 Mensagem de saldo enviada para ${cliente}.`
  );

  return true;
}

// Evento de mensagem recebida
client.on("message", async (message) => {
	
	try {
		if (message.fromMe) return;
		if (message.timestamp < inicioBot - 10) return;

	if (message.from === "status@broadcast" || message.from.endsWith("@g.us")) {
		return;
	}
	
	const chatId = message.from;
	const msg = message.body.toLowerCase().trim();
	
	if (!msg && !message.hasMedia) {
		return;
	}

	let phone;

	if (chatId.endsWith("@lid")) {
		const resultado = await client.getContactLidAndPhone([chatId]);

		if (resultado && resultado.length > 0 && resultado[0].pn) {
			phone = String(resultado[0].pn).replace("@c.us", "");
		}
	} else {
		phone = chatId.replace("@c.us", "");
	}
	
	// Bloco que salva o comprovante
	if (message.hasMedia) {
		try {
			let media;

			try {
				const idCorrigido = corrigirIdMensagem(message);

				if (!idCorrigido) {
					console.error(
						"❌ Não foi possível obter o ID correto da mensagem."
					);
					console.dir(message.id, { depth: null });
					return;
				}

				media = await message.downloadMedia();
			} catch (erroDownload) {
				console.error("❌ ERRO NO DOWNLOAD DA MÍDIA");
				console.error("Mensagem:", erroDownload?.message);
				console.error("Nome:", erroDownload?.name);
				console.error("Stack:", erroDownload?.stack);
				console.dir(erroDownload, { depth: null });
				return;
			}

			if (!media) {
				console.log("❌ downloadMedia retornou null ou undefined");
				return;
			}

			if (!media.data || !media.mimetype) {
				console.log("❌ Mídia sem conteúdo ou sem mimetype");
				return;
			}

			const mimetype = String(media.mimetype)
				.split(";")[0]
				.toLowerCase()
				.trim();

			const tiposPermitidos = [
				"application/pdf",
				"image/jpeg",
				"image/jpg",
				"image/png"
			];

			if (!tiposPermitidos.includes(mimetype)) {
				console.log("Arquivo ignorado:", mimetype);
				return;
			}

			const tamanhoBytes = Buffer.byteLength(media.data, "base64");

			let ehComprovante = true;

			if (mimetype.startsWith("image/")) {
				try {

					const resultado = await Tesseract.recognize(
						`data:${mimetype};base64,${media.data}`,
						"por"
					);

					const texto = String(resultado?.data?.text || "")
						.toLowerCase();

					const palavrasChave = [
						"pix",
						"comprovante",
						"pagamento",
						"valor",
						"r$",
						"transferencia",
						"transferência",
						"enviado",
						"recebido"
					];

					ehComprovante = palavrasChave.some(palavra =>
						texto.includes(palavra)
					);

					if (!ehComprovante) {
						console.log("Imagem ignorada: não parece ser comprovante");
						return;
					}

				} catch (erroOCR) {
					console.error("❌ ERRO NO OCR");
					console.error("Mensagem:", erroOCR?.message);
					console.error("Stack:", erroOCR?.stack);
					console.dir(erroOCR, { depth: null });
					return;
				}
			}

			const agoraBrasil = DateTime.now()
				.setZone("America/Sao_Paulo");

			const agora = agoraBrasil.toFormat("dd-MM-yyyy_HH-mm-ss-SSS");
			const dataHoje = agoraBrasil.toFormat("yyyy-MM-dd");
			const nomeArquivo = `comp_${agora}_${phone}`;

			try {
				console.log("4️⃣ Enviando para o Cloudinary...");

				const resultadoCloudinary = await cloudinary.uploader.upload(
					`data:${mimetype};base64,${media.data}`,
					{
						folder: `comprovantes_sapucaia/${dataHoje}`,
						public_id: nomeArquivo,
						resource_type: "auto",
						overwrite: false
					}
				);

				console.log(
					"✅ Comprovante enviado:",
					resultadoCloudinary.secure_url
				);

			} catch (erroCloudinary) {
				console.error("❌ ERRO NO CLOUDINARY");
				console.error("Mensagem:", erroCloudinary?.message);
				console.error("Código HTTP:", erroCloudinary?.http_code);
				console.error("Stack:", erroCloudinary?.stack);
				console.dir(erroCloudinary, { depth: null });
				return;
			}

		} catch (erro) {
			console.error("❌ ERRO GERAL NO COMPROVANTE");
			console.error("Mensagem:", erro?.message);
			console.error("Nome:", erro?.name);
			console.error("Stack:", erro?.stack);
			console.dir(erro, { depth: null });
		}

		return;
	}
  
      // Se o chat estiver silenciado, ignorar a mensagem
	if (silencedChats.has(chatId) && !message.hasMedia) {
		console.log(`Chat silenciado (${phone}), ignorando mensagem.`);
		return;
	}

  // Verifica se o remetente está na lista de contatos autorizados
  if (!allowedContacts.includes(phone)) {
	console.log(`Número não autorizado (${phone}). Mensagem ignorada.`);
	return;
  }
  
// comando para disparo em massa
if (msg === "/disparo") {

    const mensagem = `Olá! 👋
Estamos passando para informar uma atualização importante.
Caso precise de atendimento basta responder esta mensagem.
Atenciosamente
*Coutech Cell*`;
    await client.sendMessage(chatId, "🚀 Iniciando envio para todos os contatos...");
    await enviarMensagemEmMassa(mensagem);
    return;
}

  	// Enviar foto para o cliente
if (msg === "3") {
    const produto = ultimoProdutoConsultado.get(chatId);

    if (!produto) {
        await client.sendMessage(chatId, "❌ Nenhum produto consultado ainda.");
        return;
    }

const caminhoImagem = `./fotos/${produto.Imagem}`;

    if (!fs.existsSync(caminhoImagem)) {
        await client.sendMessage(chatId, "❌ Foto do produto não encontrada.");
        return;
    }

    const media = MessageMedia.fromFilePath(caminhoImagem);

    await client.sendMessage(chatId, media, {
        caption: `📸 *${produto.Produto}*`
    });

    // 🔓 libera nova consulta
	clientesAtendidos.delete(chatId);

    return;
	}

    if (msg === "atendimento" || msg === "pedido") {
        if (estaDentroDoHorario()) {
        atendimentoHumano.add(chatId);
        await client.sendMessage(chatId, "📞 Você será atendido em breve. Aguarde...");
		removerAtendimentoHumano(chatId);
        removerClientesAtendidos(chatId);

      } else {
			await client.sendMessage(chatId, "⏳ No momento, não estamos atendendo. Nosso horário de atendimento é de Seg a Sex de 9h às 18h. Sábado de 9h às 17h.\nPor favor, deixe sua mensagem, e retornaremos assim que possível dentro do nosso horário de atendimento.\n\n Agradecemos pela sua compreensão! 😊\n\n Atenciosamente,\n Coutech Cell");
		}
        return;
    }

    if (msg === "consultar valor") {
        atendimentoHumano.delete(chatId);
        await client.sendMessage(chatId, `🔎 Para consultar, digite o *tipo da peça* e o *modelo do aparelho*.

Exemplos:
• tela A12
• bateria A12
• placa de carga A12
• flex A12

Digite novamente sua consulta.`);
        removerClientesAtendidos(chatId);	
		return;
    }

    // Se o usuário pediu para falar com atendente, o bot não responde mais
    if (atendimentoHumano.has(chatId)) {
        return;
    }
	
	if (["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite"].includes(msg)) {
		await client.sendMessage(chatId, "Olá! Como posso te ajudar?\n 1️⃣ - Consultar valor\n 2️⃣ - Atendimento/Pedido");
		clientesAtendidos.add(chatId);
		return;
	}
	
	if (msg === "1" || msg === "2") {
		clientesAtendidos.add(chatId); // Marca o cliente como atendidooo

	} else {
if (!clientesAtendidos.has(chatId)) {
    const respostaPossivel = await buscarPreco(msg, chatId);

    // Se buscarPreco retornou algo que não é a mensagem de erro padrão
    if (!respostaPossivel.startsWith("❌ Produto não encontrado") &&
        !respostaPossivel.startsWith("⚠ Nenhum produto")) {
        clientesAtendidos.add(chatId);
        await client.sendMessage(chatId, respostaPossivel);
        return;
    }

    // Se não parece uma tentativa de consulta válida, manda mensagem orientando
    try {
        await client.sendMessage(
            chatId,
            "Olá! Como posso te ajudar?\n 1️⃣ - Consultar valor\n 2️⃣ - Atendimento/Pedido"
        );
        clientesAtendidos.add(chatId);
    } catch (error) {
        if (error.message.includes("Could not get the quoted message")) {
            console.warn("Aviso: Não foi possível obter a mensagem citada. Enviando mensagem mesmo assim.");
        } else {
            console.error("Erro ao enviar mensagem:", error.message);
        }
    }
    return;
}
	}

		// Lógica para responderr às opções "1" e "2"
    if (msg === "2") {
        if (estaDentroDoHorario()) {
        atendimentoHumano.add(chatId);
        await client.sendMessage(chatId, "📞 Você será atendido em breve. Aguarde...");
		removerAtendimentoHumano(chatId);
        removerClientesAtendidos(chatId);
		
      } else {
            await client.sendMessage(chatId, "⏳ No momento, não estamos atendendo. Nosso horário de atendimento é de Seg a Sex de 9h às 18h. Sábado de 9h às 17h.\nPor favor, deixe sua mensagem, e retornaremos assim que possível dentro do nosso horário de atendimento.\n\n Agradecemos pela sua compreensão! 😊\n\n Atenciosamente,\n Coutech Cell");
		}
        return;
    }

	else if (msg === "1") {
    await client.sendMessage(chatId, `🔎 Para consultar, digite o *tipo da peça* e o *modelo do aparelho*.

Exemplos:
• tela A12
• bateria A12
• placa de carga A12
• flex A12`);
		   // Remove o cliente da lista de atendimento após 1 minutoo
			removerClientesAtendidos(chatId);
        return;
}		

const respostaPreco = await buscarPreco(msg, chatId);

if (respostaPreco.startsWith("❌ Produto não encontrado")) {
       if (estaDentroDoHorario()) {
       atendimentoHumano.add(chatId);
       await client.sendMessage(chatId, "❌ Produto não encontrado.\n\n📞 Vou te encaminhar para um atendente.");
	   removerAtendimentoHumano(chatId);
       removerClientesAtendidos(chatId);
     } else {
         await client.sendMessage(chatId, "❌ Produto não encontrado.\n\n⏳ Assim que nossa equipe estiver em horário de atendimento iremos lhe ajudar.");
	 }
       return;
}

await client.sendMessage(chatId, respostaPreco);

    } catch (error) {

        console.error("ERRO GERAL MESSAGE:", error);

    }
										
});

async function iniciarClienteWhatsApp() {
    try {
        console.log("🔄 Iniciando cliente do WhatsApp...");
        await client.initialize();
    } catch (erro) {
        const mensagem = String(erro?.message || erro);

        console.error(
            "❌ Erro ao iniciar o WhatsApp:",
            mensagem
        );

        if (
            mensagem.includes("Execution context was destroyed") ||
            mensagem.includes("Runtime.callFunctionOn") ||
            mensagem.includes("Cannot find context")
        ) {
            console.log(
                "♻️ A página do WhatsApp recarregou durante a inicialização."
            );

            console.log(
                "🔄 Tentando iniciar novamente em 5 segundos..."
            );

            setTimeout(() => {
                iniciarClienteWhatsApp();
            }, 5000);

            return;
        }

        console.error(erro?.stack || erro);
    }
}

iniciarClienteWhatsApp();

let falhasConsecutivasWhatsApp = 0;
let verificandoEstadoWhatsApp = false;

setInterval(async () => {
    if (verificandoEstadoWhatsApp) {
        console.log(
            "⚠ Verificação anterior do WhatsApp ainda não terminou."
        );
        return;
    }

    verificandoEstadoWhatsApp = true;

    try {
        const state = await client.getState();

        if (state === "CONNECTED") {
            falhasConsecutivasWhatsApp = 0;
            return;
        }

        falhasConsecutivasWhatsApp++;

        console.warn(
            `⚠ Estado do WhatsApp: ${state || "desconhecido"}. ` +
            `Falha ${falhasConsecutivasWhatsApp}/3.`
        );

    } catch (erro) {
        falhasConsecutivasWhatsApp++;

        console.error(
            `❌ Erro ao verificar o estado ` +
            `(${falhasConsecutivasWhatsApp}/3):`,
            erro?.message || erro
        );

    } finally {
        verificandoEstadoWhatsApp = false;
    }

    if (falhasConsecutivasWhatsApp >= 3) {
        console.error(
            "♻️ Puppeteer não está respondendo. Reiniciando o serviço."
        );

        process.exit(1);
    }
}, 60000);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.get("/painel", (req, res) => {
res.send(`
<html>
<head>
<title>Painel de Disparo</title>
<style>
body{font-family:Arial;background:#f4f6f9;padding:40px}
.container{max-width:600px;background:white;padding:30px;border-radius:8px}
textarea{width:100%;height:150px;font-size:16px}
button{padding:12px 20px;background:#27ae60;color:white;border:none;font-size:16px;margin-top:10px}
</style>
</head>
<body>
<div class="container">
<h2>📢 Disparo em Massa</h2>
<form method="POST" action="/disparo" enctype="multipart/form-data">
<textarea name="mensagem" placeholder="Digite a mensagem aqui"></textarea>
<br><br>
<input type="file" name="imagem" accept="image/*">
<br><br>
<button type="submit">Enviar para todos</button>
</form>
</div>
</body>
</html>
`);
});

app.post("/disparo", upload.single("imagem"), async (req, res) => {
    const mensagem = req.body.mensagem;

    let caminhoImagem = null;

    if (req.file) {
        caminhoImagem = req.file.path;
    }

    enviarMensagemEmMassa(mensagem, caminhoImagem);

    res.send("🚀 Disparo iniciado!");
});

app.get("/excluidas", async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT * FROM mensagens_excluidas
            ORDER BY data_exclusao DESC
        `);

        let html = `
        <html>
        <head>
            <title>Painel - Mensagens Excluídas</title>
            <style>
                body { font-family: Arial; background:#f4f6f9; padding:20px; }
                h1 { color:#333; }
                table { width:100%; border-collapse: collapse; background:#fff; }
                th, td { padding:10px; border:1px solid #ddd; font-size:14px; }
                th { background:#2c3e50; color:white; }
                tr:nth-child(even){ background:#f2f2f2; }
                .cliente { color:#2980b9; font-weight:bold; }
                .atendente { color:#27ae60; font-weight:bold; }
                .msg { max-width:400px; word-wrap:break-word; }
            </style>
        </head>
        <body>
            <h1>📋 Mensagens Excluídas</h1>
            <table>
                <tr>
                    <th>ID</th>
                    <th>Atendente</th>
                    <th>Cliente</th>
                    <th>Mensagem</th>
                    <th>Data Envio</th>
                    <th>Data Exclusão</th>
                </tr>
        `;

        rows.forEach(row => {
			const dataEnvio = new Date(row.data_envio).toLocaleString("pt-BR", {
			timeZone: "America/Sao_Paulo"
			});

			const dataExclusao = new Date(row.data_exclusao).toLocaleString("pt-BR", {
			timeZone: "America/Sao_Paulo"
			});
            html += `
            <tr>
                <td>${row.id}</td>
				<td>${row.numero_atendente}</td>
				<td>${row.numero_cliente}</td>
                <td>${row.body}</td>
				<td>${dataEnvio}</td>
				<td>${dataExclusao}</td>

            </tr>
            `;
        });

        html += `
            </table>
        </body>
        </html>
        `;

        res.send(html);
    } catch (error) {
        res.send("Erro ao carregar painel: " + error.message);
    }
});

app.post('/enviar-pedido', async (req, res) => {
  try {
    const tokenRecebido = req.headers['x-coutech-token'];
    const tokenCorreto = process.env.SEGREDO_CUPONS;

    if (!tokenCorreto || tokenRecebido !== tokenCorreto) {
      return res.status(401).json({
        sucesso: false,
        erro: 'Não autorizado'
      });
    }

    const {
      pedido,
      telefone,
      cliente,
	  atendente,
	  endereco,
	  cidade,
      produtos,
      valorProdutos,
      desconto,
      total,
      formaPagamento,
      coleta
    } = req.body;

    if (!pedido) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Número do pedido não informado'
      });
    }

    if (!telefone) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Telefone do cliente não informado'
      });
    }

    if (!client.info) {
      return res.status(503).json({
        sucesso: false,
        erro: 'WhatsApp ainda não está conectado'
      });
    }

    const numero = normalizarTelefoneBrasil(telefone);

    const numeroWhatsApp = await client.getNumberId(numero);

    if (!numeroWhatsApp) {
      return res.status(404).json({
        sucesso: false,
        erro: `O número ${telefone} não foi encontrado no WhatsApp`
      });
    }

	const mensagem = montarMensagemPedido({
	  pedido,
	  cliente,
	  atendente,
	  endereco,
	  cidade,
	  produtos,
	  valorProdutos,
	  desconto,
	  total,
	  formaPagamento,
	  coleta
	});

await client.sendMessage(
  numeroWhatsApp._serialized,
  mensagem
);

let saldoEnviado = false;

try {
  const telefoneConta =
    normalizarTelefoneConta(telefone);

  const [clientesConta] = await db.execute(
    `
    SELECT
      c.id,
      c.nome,
      c.ativo,
      COALESCE(SUM(m.valor), 0) AS saldo
    FROM clientes_conta_prazo c
    LEFT JOIN movimentacoes_conta_prazo m
      ON m.cliente_id = c.id
    WHERE c.telefone = ?
      AND c.ativo = 1
    GROUP BY
      c.id,
      c.nome,
      c.ativo
    LIMIT 1
    `,
    [telefoneConta]
  );

  /*
   * Só envia o saldo quando o cliente estiver
   * cadastrado e ativo na conta a prazo.
   */
  if (clientesConta.length > 0) {
    const clienteConta = clientesConta[0];

    const saldoAtual =
      Number(clienteConta.saldo || 0);

    const mensagemSaldo =
      `💳 *SALDO DA CONTA:*\n\n` +
      `Saldo atual: *R$ ${formatarValorConta(saldoAtual)}*`;

    await client.sendMessage(
      numeroWhatsApp._serialized,
      mensagemSaldo
    );

    saldoEnviado = true;

    console.log(
      `💳 Saldo de R$ ` +
      `${formatarValorConta(saldoAtual)} ` +
      `enviado para ${clienteConta.nome}.`
    );
  }
} catch (erroSaldo) {
  /*
   * Um erro ao consultar o saldo não desfazz
   * o envio da mensagem principal do pedido.
   */
  console.error(
    `⚠️ Pedido ${pedido} foi enviado, mas não foi ` +
    `possível enviar o saldo:`,
    erroSaldo.message
  );
}

return res.json({
  sucesso: true,
  pedido,
  telefone: numero,
  saldoEnviado
});

  } catch (erro) {
    console.error(
      '❌ Erro na rota /enviar-pedido:',
      erro
    );

    return res.status(500).json({
      sucesso: false,
      erro: erro.message
    });
  }
});

app.post('/enviar-saldo', async (req, res) => {
  try {

    const tokenRecebido =
      req.headers['x-coutech-token'];

    const tokenCorreto =
      process.env.SEGREDO_CUPONS;

    if (!tokenCorreto || tokenRecebido !== tokenCorreto) {
      return res.status(401).json({
        sucesso: false,
        erro: 'Não autorizado'
      });
    }

    const {
      telefone,
      cliente,
      valorPagamento,
      formaPagamento,
      saldo
    } = req.body;

    if (!telefone) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Telefone não informado'
      });
    }

        await enviarSaldoWhatsApp({
      telefone,
      cliente,
      valorPagamento,
      formaPagamento,
      saldo
    });

    return res.json({
      sucesso: true
    });

  } catch (erro) {

    console.error(
      '❌ Erro na rota /enviar-saldo:',
      erro
    );

    return res.status(500).json({
      sucesso: false,
      erro: erro.message
    });

  }
});

app.post('/conta-prazo/registrar-pedido', async (req, res) => {
        let conexao;

        try {
            const tokenRecebido =
                req.headers['x-coutech-token'];

            const tokenCorreto =
                process.env.SEGREDO_CUPONS;

            if (
                !tokenCorreto ||
                tokenRecebido !== tokenCorreto
            ) {
                return res.status(401).json({
                    sucesso: false,
                    erro: 'Não autorizado'
                });
            }

            const {
                pedido,
                cliente,
                telefone,
                valor,
                formaPagamento,
                operador
            } = req.body || {};

            const numeroPedido =
                String(pedido || '').trim();

            const telefoneNormalizado =
                normalizarTelefoneConta(telefone);

            const valorPedido =
                converterValorConta(valor);

            if (!numeroPedido) {
                return res.status(400).json({
                    sucesso: false,
                    erro: 'Número do pedido não informado'
                });
            }

            if (!telefoneNormalizado) {
                return res.status(400).json({
                    sucesso: false,
                    erro: 'Telefone não informado'
                });
            }

            if (
                !Number.isFinite(valorPedido) ||
                valorPedido <= 0
            ) {
                return res.status(400).json({
                    sucesso: false,
                    erro: 'Valor do pedido inválido'
                });
            }

            conexao = await db.getConnection();

            await conexao.beginTransaction();

            /*
             * Localiza o cliente e bloqueia temporariamente
             * essa linha durante a transação.
             */
            const [clientes] = await conexao.execute(
                `
                SELECT
                    id,
                    nome,
                    telefone,
                    ativo,
                    limite
                FROM clientes_conta_prazo
                WHERE telefone = ?
                LIMIT 1
                FOR UPDATE
                `,
                [telefoneNormalizado]
            );

            if (clientes.length === 0) {
                await conexao.rollback();

                return res.status(200).json({
                    sucesso: true,
                    registrado: false,
                    motivo: 'Cliente não autorizado'
                });
            }

            const clienteAutorizado = clientes[0];

            if (!clienteAutorizado.ativo) {
                await conexao.rollback();

                return res.status(200).json({
                    sucesso: true,
                    registrado: false,
                    motivo: 'Cliente desativado',
                    cliente: clienteAutorizado.nome
                });
            }

            /*
             * Verifica antecipadamente se o pedido já existe.
             * A chave UNIQUE do banco também protege contra
             * concorrência entre vários computadores.
             */
            const [pedidosExistentes] =
                await conexao.execute(
                    `
                    SELECT id
                    FROM movimentacoes_conta_prazo
                    WHERE pedido = ?
                      AND tipo = 'COMPRA'
                    LIMIT 1
                    `,
                    [numeroPedido]
                );

            if (pedidosExistentes.length > 0) {
                await conexao.rollback();

                return res.status(200).json({
                    sucesso: true,
                    registrado: false,
                    motivo: 'Pedido já registrado',
                    cliente: clienteAutorizado.nome
                });
            }

            const [resultadoSaldo] =
                await conexao.execute(
                    `
                    SELECT
                        COALESCE(SUM(valor), 0) AS saldo
                    FROM movimentacoes_conta_prazo
                    WHERE cliente_id = ?
                    `,
                    [clienteAutorizado.id]
                );

            const saldoAnterior =
                Number(resultadoSaldo[0].saldo || 0);

            const novoSaldo =
                saldoAnterior + valorPedido;

            await conexao.execute(
                `
                INSERT INTO movimentacoes_conta_prazo (
                    cliente_id,
                    tipo,
                    pedido,
                    valor,
                    forma,
                    observacao,
                    operador
                ) VALUES (
                    ?,
                    'COMPRA',
                    ?,
                    ?,
                    ?,
                    ?,
                    ?
                )
                `,
                [
                    clienteAutorizado.id,
                    numeroPedido,
                    valorPedido,
                    formaPagamento || 'Conta a prazo',
                    `Pedido do GestãoClick - ${
                        cliente || clienteAutorizado.nome
                    }`,
                    operador || null
                ]
            );

            await conexao.commit();

            console.log(
                `💳 Conta a prazo: pedido ${numeroPedido} ` +
                `registrado para ${clienteAutorizado.nome}. ` +
                `Novo saldo: R$ ${formatarValorConta(novoSaldo)}`
            );

            return res.status(200).json({
                sucesso: true,
                registrado: true,
                cliente: clienteAutorizado.nome,
                telefone: clienteAutorizado.telefone,
                pedido: numeroPedido,
                valor:
                    formatarValorConta(valorPedido),
                saldoAnterior:
                    formatarValorConta(saldoAnterior),
                saldoAtual:
                    formatarValorConta(novoSaldo)
            });

        } catch (erro) {
            if (conexao) {
                try {
                    await conexao.rollback();
                } catch {}
            }

            /*
             * A chave UNIQUE também pode detectar uma tentativa
             * simultânea de registrar o mesmo pedido.
             */
            if (erro.code === 'ER_DUP_ENTRY') {
                return res.status(200).json({
                    sucesso: true,
                    registrado: false,
                    motivo: 'Pedido já registrado'
                });
            }

            console.error(
                '❌ Erro ao registrar conta a prazo:',
                erro
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    erro.message ||
                    'Erro interno ao registrar conta a prazo'
            });

        } finally {
            if (conexao) {
                conexao.release();
            }
        }
    }
);

app.get('/conta-prazo/saldo/:telefone', async (req, res) => {
        try {
            const tokenRecebido =
                req.headers['x-coutech-token'];

            const tokenCorreto =
                process.env.SEGREDO_CUPONS;

            if (
                !tokenCorreto ||
                tokenRecebido !== tokenCorreto
            ) {
                return res.status(401).json({
                    sucesso: false,
                    erro: 'Não autorizado'
                });
            }

            const telefone =
                normalizarTelefoneConta(
                    req.params.telefone
                );

            const [resultado] = await db.execute(
                `
                SELECT
                    c.id,
                    c.nome,
                    c.telefone,
                    c.ativo,
                    c.limite,
                    COALESCE(SUM(m.valor), 0) AS saldo
                FROM clientes_conta_prazo c
                LEFT JOIN movimentacoes_conta_prazo m
                    ON m.cliente_id = c.id
                WHERE c.telefone = ?
                GROUP BY
                    c.id,
                    c.nome,
                    c.telefone,
                    c.ativo,
                    c.limite
                LIMIT 1
                `,
                [telefone]
            );

            if (resultado.length === 0) {
                return res.status(404).json({
                    sucesso: false,
                    erro: 'Cliente não encontrado'
                });
            }

            const cliente = resultado[0];

            return res.json({
                sucesso: true,
                cliente: cliente.nome,
                telefone: cliente.telefone,
                ativo: Boolean(cliente.ativo),
                saldo:
                    formatarValorConta(cliente.saldo),
                limite:
                    cliente.limite === null
                        ? null
                        : formatarValorConta(
                            cliente.limite
                        )
            });

        } catch (erro) {
            console.error(
                '❌ Erro ao consultar saldo:',
                erro
            );

            return res.status(500).json({
                sucesso: false,
                erro: erro.message
            });
        }
    }
);

app.get('/financeiro', async (req, res) => {
    try {
        const mensagem = String(req.query.mensagem || '');
        const tipo = String(req.query.tipo || 'sucesso');

        const [clientes] = await db.execute(`
            SELECT
                c.id,
                c.nome,
                c.telefone,
                c.ativo,
                c.limite,
                c.criado_em,
                COALESCE(SUM(m.valor), 0) AS saldo
            FROM clientes_conta_prazo c
            LEFT JOIN movimentacoes_conta_prazo m
                ON m.cliente_id = c.id
            GROUP BY
                c.id,
                c.nome,
                c.telefone,
                c.ativo,
                c.limite,
                c.criado_em
            ORDER BY c.nome
        `);

        let linhasClientes = '';
		let montanteTotal = 0;

        for (const cliente of clientes) {
            const saldo = Number(cliente.saldo || 0);
			montanteTotal += saldo;

            const classeSaldo =
                saldo > 0
                    ? 'saldo-devedor'
                    : 'saldo-zerado';

            linhasClientes += `
                <tr>
                    <td>
                        ${escaparHtml(cliente.nome)}
                    </td>

                    <td>
                        ${escaparHtml(cliente.telefone)}
                    </td>

                    <td class="${classeSaldo}">
                        R$ ${formatarValorConta(saldo)}
                    </td>

                    <td>
                        ${
                            cliente.ativo
                                ? '<span class="status ativo">Ativo</span>'
                                : '<span class="status inativo">Inativo</span>'
                        }
                    </td>

                    <td class="acoes">
                        <a
                            class="botao azul"
                            href="/financeiro/extrato/${cliente.id}"
                        >
                            Ver extrato
                        </a>

                        ${
                            saldo > 0 && cliente.ativo
                                ? `
                                    <a
                                        class="botao verde"
                                        href="/financeiro/pagamento/${cliente.id}"
                                    >
                                        Registrar pagamento
                                    </a>
                                `
                                : ''
                        }
                    </td>
                </tr>
            `;
        }

        res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>Contas a Prazo</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 30px;
            font-family: Arial, sans-serif;
            background: #f2f4f7;
            color: #222;
        }

        .container {
            max-width: 1250px;
            margin: auto;
        }

        .topo {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 15px;
            margin-bottom: 25px;
        }

        h1, h2 {
            margin-top: 0;
        }

        .card {
            background: white;
            border-radius: 10px;
            padding: 24px;
            margin-bottom: 25px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, .08);
        }

        .grade {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr;
            gap: 15px;
        }

        label {
            display: block;
            margin-bottom: 6px;
            font-weight: bold;
        }

        input, select, textarea {
            width: 100%;
            padding: 11px;
            border: 1px solid #ccd1d7;
            border-radius: 6px;
            font-size: 15px;
        }

        button, .botao {
            display: inline-block;
            border: none;
            border-radius: 6px;
            padding: 10px 14px;
            text-decoration: none;
            cursor: pointer;
            font-size: 14px;
            color: white;
        }

        .verde {
            background: #198754;
        }

        .azul {
            background: #0d6efd;
        }

        .vermelho {
            background: #dc3545;
        }

        .cinza {
            background: #6c757d;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 12px 9px;
            border-bottom: 1px solid #e1e5e9;
            text-align: left;
            vertical-align: middle;
        }

        th {
            background: #263544;
            color: white;
        }

        .acoes {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .form-inline {
            display: inline;
            margin: 0;
        }

        .status {
            padding: 5px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
        }

        .status.ativo {
            background: #d1e7dd;
            color: #0f5132;
        }

        .status.inativo {
            background: #f8d7da;
            color: #842029;
        }

        .saldo-devedor {
            color: #dc3545;
            font-weight: bold;
        }

        .saldo-zerado {
            color: #198754;
            font-weight: bold;
        }

        .alerta {
            padding: 14px;
            border-radius: 6px;
            margin-bottom: 20px;
            font-weight: bold;
        }

        .alerta.sucesso {
            background: #d1e7dd;
            color: #0f5132;
        }

        .alerta.erro {
            background: #f8d7da;
            color: #842029;
        }

        @media (max-width: 800px) {
            body {
                padding: 15px;
            }

            .grade {
                grid-template-columns: 1fr;
            }

            table {
                display: block;
                overflow-x: auto;
            }

            .topo {
                align-items: flex-start;
                flex-direction: column;
            }
        }
		
		.montante-total {
			display: flex;
			justify-content: flex-end;
			align-items: center;
			gap: 15px;
			margin-top: 22px;
			padding: 18px;
			border-radius: 8px;
			background: #263544;
			color: white;
			font-size: 20px;
		}

		.montante-total strong {
			color: #5ee89c;
			font-size: 25px;
		}
    </style>
</head>

<body>
    <div class="container">
        <div class="topo">
            <div>
                <h1>💳 Contas a Prazo</h1>
                <div>
                    Cadastro, saldos, extratos e pagamentos.
                </div>
            </div>
        </div>

        ${
            mensagem
                ? mensagemPainel(mensagem, tipo)
                : ''
        }

        <div class="card">
            <h2>Clientes cadastrados</h2>

            <table>
                <thead>
                    <tr>
                        <th>Cliente</th>
                        <th>Telefone</th>
                        <th>Saldo</th>
                        <th>Situação</th>
                        <th>Ações</th>
                    </tr>
                </thead>

                <tbody>
                    ${
                        linhasClientes ||
                        `
                            <tr>
                                <td colspan="6">
                                    Nenhum cliente cadastrado.
                                </td>
                            </tr>
                        `
                    }
                </tbody>
            </table>
			<div class="montante-total">
				<span>Montante total a receber:</span>

				<strong>
					R$ ${formatarValorConta(montanteTotal)}
				</strong>
			</div>
        </div>
    </div>
</body>
</html>
        `);

    } catch (erro) {
        console.error(
            '❌ Erro ao abrir painel de contas:',
            erro
        );

        res.status(500).send(
            `Erro ao abrir painel: ${escaparHtml(erro.message)}`
        );
    }
});

app.post('/financeiro/clientes', async (req, res) => {
    try {
        const nome =
            String(req.body.nome || '').trim();

        const telefone =
            normalizarTelefoneConta(req.body.telefone);

        if (!nome) {
            return res.redirect(
                '/financeiro?tipo=erro&mensagem=' +
                encodeURIComponent('Informe o nome do cliente.')
            );
        }

        if (!telefone) {
            return res.redirect(
                '/financeiro?tipo=erro&mensagem=' +
                encodeURIComponent('Informe um telefone válido.')
            );
        }

        return res.redirect(
            '/financeiro?mensagem=' +
            encodeURIComponent(
                'Cliente cadastrado com sucesso.'
            )
        );

    } catch (erro) {
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.redirect(
                '/financeiro?tipo=erro&mensagem=' +
                encodeURIComponent(
                    'Já existe um cliente cadastrado com esse telefone.'
                )
            );
        }

        console.error(
            '❌ Erro ao cadastrar cliente:',
            erro
        );

        return res.redirect(
            '/financeiro?tipo=erro&mensagem=' +
            encodeURIComponent(erro.message)
        );
    }
});

app.post('/financeiro/clientes/:id/status', async (req, res) => {
        try {
            const id = Number(req.params.id);
            const ativo =
                Number(req.body.ativo) === 1 ? 1 : 0;

            if (!Number.isInteger(id) || id <= 0) {
                throw new Error('Cliente inválido.');
            }

            const [resultado] = await db.execute(
                `
                UPDATE clientes_conta_prazo
                SET ativo = ?
                WHERE id = ?
                `,
                [ativo, id]
            );

            if (resultado.affectedRows === 0) {
                throw new Error('Cliente não encontrado.');
            }

            return res.redirect(
                '/financeiro?mensagem=' +
                encodeURIComponent(
                    ativo
                        ? 'Cliente ativado com sucesso.'
                        : 'Cliente desativado com sucesso.'
                )
            );

        } catch (erro) {
            return res.redirect(
                '/financeiro?tipo=erro&mensagem=' +
                encodeURIComponent(erro.message)
            );
        }
    }
);

app.get('/financeiro/pagamento/:id', async (req, res) => {
        try {
            const id = Number(req.params.id);
			if (!Number.isInteger(id) || id <= 0) {
				return res.status(400).send(
					'Identificador do cliente inválido.'
				);
			}			

            const [clientes] = await db.execute(
                `
                SELECT
                    c.id,
                    c.nome,
                    c.telefone,
                    c.ativo,
                    COALESCE(SUM(m.valor), 0) AS saldo
                FROM clientes_conta_prazo c
                LEFT JOIN movimentacoes_conta_prazo m
                    ON m.cliente_id = c.id
                WHERE c.id = ?
                GROUP BY
                    c.id,
                    c.nome,
                    c.telefone,
                    c.ativo
                LIMIT 1
                `,
                [id]
            );

            if (clientes.length === 0) {
                return res.status(404).send(
                    'Cliente não encontrado.'
                );
            }

            const cliente = clientes[0];
            const saldo = Number(cliente.saldo || 0);

            res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>Registrar pagamento</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            font-family: Arial, sans-serif;
            background: #f2f4f7;
            padding: 30px;
        }

        .card {
            max-width: 600px;
            margin: auto;
            background: white;
            padding: 28px;
            border-radius: 10px;
            box-shadow: 0 2px 8px rgba(0,0,0,.08);
        }

        input, select, textarea {
            width: 100%;
            padding: 11px;
            margin-top: 6px;
            margin-bottom: 16px;
            border: 1px solid #ccd1d7;
            border-radius: 6px;
            font-size: 15px;
        }

        label {
            font-weight: bold;
        }

        button, a {
            display: inline-block;
            padding: 11px 16px;
            border: none;
            border-radius: 6px;
            text-decoration: none;
            color: white;
            cursor: pointer;
        }

        button {
            background: #198754;
        }

        a {
            background: #6c757d;
        }

        .saldo {
            padding: 15px;
            background: #fff3cd;
            border-radius: 6px;
            margin-bottom: 20px;
            font-size: 18px;
            font-weight: bold;
        }
    </style>
</head>

<body>
    <div class="card">
        <h1>Registrar pagamento</h1>

        <p>
            <strong>Cliente:</strong>
            ${escaparHtml(cliente.nome)}
        </p>

        <p>
            <strong>Telefone:</strong>
            ${escaparHtml(cliente.telefone)}
        </p>

        <div class="saldo">
            Saldo atual:
            R$ ${formatarValorConta(saldo)}
        </div>

        <form
            method="POST"
            action="/financeiro/pagamentos"
        >
            <input
                type="hidden"
                name="cliente_id"
                value="${cliente.id}"
            >

            <label>Valor pago</label>

            <input
                type="text"
                name="valor"
                placeholder="Ex.: 100,00"
                required
            >

            <label>Forma de pagamento</label>

            <select name="forma" required>
                <option value="Pix">Pix</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Devolução de Mercadorias">Devolução de Mercadorias</option>
            </select>

            <label>Observação</label>

            <textarea
                name="observacao"
                rows="3"
                placeholder="Ex.: Pagamento parcial"
            ></textarea>

            <button type="submit">
                Confirmar pagamento
            </button>

            <a href="/financeiro">
                Cancelar
            </a>
        </form>
    </div>
</body>
</html>
            `);

        } catch (erro) {
            res.status(500).send(
                `Erro: ${escaparHtml(erro.message)}`
            );
        }
    }
);

app.post('/financeiro/pagamentos', async (req, res) => {
    let conexao;

    try {
        const clienteId =
            Number(req.body.cliente_id);

        const valorPagamento =
            converterValorConta(req.body.valor);

        const forma =
            String(req.body.forma || '').trim();

        const observacao =
            String(
                req.body.observacao ||
                'Pagamento parcial'
            ).trim();

        if (
            !Number.isInteger(clienteId) ||
            clienteId <= 0
        ) {
            throw new Error('Cliente inválido.');
        }

        if (
            !Number.isFinite(valorPagamento) ||
            valorPagamento <= 0
        ) {
            throw new Error(
                'Informe um valor de pagamento válido.'
            );
        }

        if (!forma) {
            throw new Error(
                'Informe a forma de pagamento.'
            );
        }

        conexao = await db.getConnection();

        await conexao.beginTransaction();

        const [clientes] = await conexao.execute(
            `
            SELECT
                id,
                nome,
                telefone,
                ativo
            FROM clientes_conta_prazo
            WHERE id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [clienteId]
        );

        if (clientes.length === 0) {
            throw new Error('Cliente não encontrado.');
        }

        const cliente = clientes[0];

        const [resultadoSaldo] =
            await conexao.execute(
                `
                SELECT
                    COALESCE(SUM(valor), 0) AS saldo
                FROM movimentacoes_conta_prazo
                WHERE cliente_id = ?
                `,
                [clienteId]
            );

        const saldoAtual =
            Number(resultadoSaldo[0].saldo || 0);

        if (saldoAtual <= 0) {
            throw new Error(
                'Este cliente não possui saldo em aberto.'
            );
        }

        if (valorPagamento > saldoAtual) {
            throw new Error(
                `O pagamento é maior que o saldo atual de ` +
                `R$ ${formatarValorConta(saldoAtual)}.`
            );
        }

        await conexao.execute(
            `
            INSERT INTO movimentacoes_conta_prazo (
                cliente_id,
                tipo,
                pedido,
                valor,
                forma,
                observacao,
                operador
            ) VALUES (
                ?,
                'PAGAMENTO',
                NULL,
                ?,
                ?,
                ?,
                ?
            )
            `,
            [
                clienteId,
                -valorPagamento,
                forma,
                observacao || 'Pagamento parcial',
                'Painel Railway'
            ]
        );

        await conexao.commit();

        const novoSaldo =
            saldoAtual - valorPagamento;

        console.log(
            `💵 Pagamento de R$ ` +
            `${formatarValorConta(valorPagamento)} ` +
            `registrado para ${cliente.nome}.`
        );
		
				try {
		  await enviarSaldoWhatsApp({
			telefone: cliente.telefone,
			cliente: cliente.nome,
			valorPagamento:
			  formatarValorConta(valorPagamento),
			formaPagamento: forma,
			saldo: formatarValorConta(novoSaldo)
		  });

		} catch (erroWhatsApp) {
		  /*
		   * O pagamento já foi registrado no banco.
		   * Uma falha no WhatsApp não deve desfazer a baixa.
		   */
		  console.error(
			`⚠️ Pagamento registrado para ${cliente.nome}, ` +
			`mas a mensagem não foi enviada:`,
			erroWhatsApp.message
		  );
		}

        return res.redirect(
            `/financeiro/extrato/${clienteId}` +
            `?mensagem=` +
            encodeURIComponent(
                `Pagamento de R$ ` +
                `${formatarValorConta(valorPagamento)} ` +
                `registrado. Novo saldo: R$ ` +
                `${formatarValorConta(novoSaldo)}.`
            )
        );

    } catch (erro) {
        if (conexao) {
            try {
                await conexao.rollback();
            } catch {}
        }

        console.error(
            '❌ Erro ao registrar pagamento:',
            erro
        );

        const clienteId =
            Number(req.body.cliente_id);

        return res.redirect(
            `/financeiro/extrato/${clienteId}` +
            `?tipo=erro&mensagem=` +
            encodeURIComponent(erro.message)
        );

    } finally {
        if (conexao) {
            conexao.release();
        }
    }
});

app.get('/financeiro/extrato/:id', async (req, res) => {
        try {
            const id = Number(req.params.id);
			if (!Number.isInteger(id) || id <= 0) {
				return res.status(400).send(
					'Identificador do cliente inválido.'
				);
			}

            const mensagem =
                String(req.query.mensagem || '');

            const tipo =
                String(req.query.tipo || 'sucesso');

            const [clientes] = await db.execute(
                `
                SELECT
                    c.id,
                    c.nome,
                    c.telefone,
                    c.ativo,
                    c.limite,
                    COALESCE(SUM(m.valor), 0) AS saldo
                FROM clientes_conta_prazo c
                LEFT JOIN movimentacoes_conta_prazo m
                    ON m.cliente_id = c.id
                WHERE c.id = ?
                GROUP BY
                    c.id,
                    c.nome,
                    c.telefone,
                    c.ativo,
                    c.limite
                LIMIT 1
                `,
                [id]
            );

            if (clientes.length === 0) {
                return res.status(404).send(
                    'Cliente não encontrado.'
                );
            }

            const cliente = clientes[0];

            const [movimentacoes] = await db.execute(
                `
                SELECT
                    id,
                    tipo,
                    pedido,
                    valor,
                    forma,
                    observacao,
                    operador,
                    criado_em
                FROM movimentacoes_conta_prazo
                WHERE cliente_id = ?
                ORDER BY criado_em DESC, id DESC
                `,
                [id]
            );

            let linhas = '';

            for (const movimentacao of movimentacoes) {
                const valor =
                    Number(movimentacao.valor || 0);

                const classeValor =
                    valor >= 0
                        ? 'compra'
                        : 'pagamento';

                linhas += `
                    <tr>
                        <td>
                            ${formatarDataBrasil(
                                movimentacao.criado_em
                            )}
                        </td>

                        <td>
                            ${escaparHtml(movimentacao.tipo)}
                        </td>

                        <td>
                            ${
                                movimentacao.pedido
                                    ? escaparHtml(
                                        movimentacao.pedido
                                    )
                                    : '—'
                            }
                        </td>

                        <td class="${classeValor}">
                            ${
                                valor >= 0
                                    ? '+'
                                    : '-'
                            }
                            R$ ${formatarValorConta(
                                Math.abs(valor)
                            )}
                        </td>

                        <td>
                            ${escaparHtml(
                                movimentacao.forma || ''
                            )}
                        </td>

                        <td>
                            ${escaparHtml(
                                movimentacao.observacao || ''
                            )}
                        </td>

                        <td>
                            ${escaparHtml(
                                movimentacao.operador || ''
                            )}
                        </td>
                    </tr>
                `;
            }

            res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>Extrato</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            font-family: Arial, sans-serif;
            background: #f2f4f7;
            padding: 30px;
        }

        .container {
            max-width: 1200px;
            margin: auto;
        }

        .card {
            background: white;
            border-radius: 10px;
            padding: 24px;
            margin-bottom: 22px;
            box-shadow: 0 2px 8px rgba(0,0,0,.08);
        }

        .saldo {
            font-size: 26px;
            font-weight: bold;
            color: #dc3545;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 11px;
            border-bottom: 1px solid #e1e5e9;
            text-align: left;
        }

        th {
            background: #263544;
            color: white;
        }

        .compra {
            color: #dc3545;
            font-weight: bold;
        }

        .pagamento {
            color: #198754;
            font-weight: bold;
        }

        .botao {
            display: inline-block;
            padding: 11px 15px;
            border-radius: 6px;
            text-decoration: none;
            color: white;
            margin-right: 6px;
        }

        .verde {
            background: #198754;
        }

        .cinza {
            background: #6c757d;
        }

        .alerta {
            padding: 14px;
            border-radius: 6px;
            margin-bottom: 20px;
            font-weight: bold;
        }

        .alerta.sucesso {
            background: #d1e7dd;
            color: #0f5132;
        }

        .alerta.erro {
            background: #f8d7da;
            color: #842029;
        }

        @media (max-width: 800px) {
            body {
                padding: 15px;
            }

            table {
                display: block;
                overflow-x: auto;
            }
        }
    </style>
</head>

<body>
    <div class="container">
        ${
            mensagem
                ? mensagemPainel(mensagem, tipo)
                : ''
        }

        <div class="card">
            <h1>
                Extrato — ${escaparHtml(cliente.nome)}
            </h1>

            <p>
                Telefone:
                ${escaparHtml(cliente.telefone)}
            </p>

            <p class="saldo">
                Saldo atual:
                R$ ${formatarValorConta(cliente.saldo)}
            </p>

            ${
                Number(cliente.saldo) > 0 &&
                cliente.ativo
                    ? `
                        <a
                            class="botao verde"
                            href="/financeiro/pagamento/${cliente.id}"
                        >
                            Registrar pagamento
                        </a>
                    `
                    : ''
            }

            <a
                class="botao cinza"
                href="/financeiro"
            >
                Voltar
            </a>
        </div>

        <div class="card">
            <h2>Movimentações</h2>

            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Pedido</th>
                        <th>Valor</th>
                        <th>Forma</th>
                        <th>Observação</th>
                        <th>Operador</th>
                    </tr>
                </thead>

                <tbody>
                    ${
                        linhas ||
                        `
                            <tr>
                                <td colspan="7">
                                    Nenhuma movimentação registrada.
                                </td>
                            </tr>
                        `
                    }
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>
            `);

        } catch (erro) {
            console.error(
                '❌ Erro ao consultar extrato:',
                erro
            );

            res.status(500).send(
                `Erro: ${escaparHtml(erro.message)}`
            );
        }
    }
);

// ======================================================
// ROTAS DE ENTREGA — COUTECH CELL
// ======================================================

const HORARIOS_ENTREGA = [
    '09:30',
    '11:00',
    '14:00',
    '16:30'
];

// Proteção dos formulários.
// Após reiniciar o bot, recarregue páginas que estavam abertas.
const csrfEntregas =
    cryptoEntregas.randomBytes(32).toString('hex');

// ======================================================
// BANCO DE DADOS
// ======================================================

let tabelaEntregasPronta = null;

function prepararTabelaEntregas() {
    if (!tabelaEntregasPronta) {
        tabelaEntregasPronta = db.execute(`
            CREATE TABLE IF NOT EXISTS entregas_motoboy (
                id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                data_rota DATE NOT NULL,
                horario_rota VARCHAR(5) NOT NULL,
                motoboy VARCHAR(100) NOT NULL,
                codigo_acesso CHAR(36) NOT NULL,
                pedido VARCHAR(50) NULL,
                cliente VARCHAR(150) NOT NULL,
                telefone VARCHAR(30) NULL,
                endereco VARCHAR(255) NOT NULL,
                cidade VARCHAR(100) NULL,
                total DECIMAL(10,2) NOT NULL DEFAULT 0,

                status_entrega ENUM(
                    'pendente',
                    'entregue',
                    'nao_entregue'
                ) NOT NULL DEFAULT 'pendente',

                forma_pagamento ENUM(
                    'pendente',
                    'pix',
                    'dinheiro'
                ) NOT NULL DEFAULT 'pendente',

                atualizado_em DATETIME NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,

                criado_em DATETIME NOT NULL
                    DEFAULT CURRENT_TIMESTAMP,

                INDEX idx_entregas_rota (
                    data_rota,
                    horario_rota,
                    motoboy
                ),

                INDEX idx_entregas_codigo (
                    codigo_acesso
                )
            )
        `).catch(erro => {
            tabelaEntregasPronta = null;
            throw erro;
        });
    }

    return tabelaEntregasPronta;
}

// Prepara a tabela antes de atender às páginas de entregas.
app.use('/entregas', async (req, res, next) => {
    res.set({
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY'
    });

    try {
        await prepararTabelaEntregas();
		await prepararColunaDinheiro();
		next();
    } catch (erro) {
        console.error(
            'Erro ao preparar tabela de entregas:',
            erro
        );

        res.status(503).send(
            'Não foi possível acessar as entregas. Tente novamente.'
        );
    }
});

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================

function hojeEntregas() {
    return DateTime.now()
        .setZone('America/Sao_Paulo')
        .toFormat('yyyy-LL-dd');
}

function dataValidaEntregas(valor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) {
        return false;
    }

    return DateTime.fromISO(valor).isValid;
}

function moedaEntregas(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function centavosEntregas(valor) {
    const texto = String(valor ?? '').trim();

    // Aceita: 55, 55,90, 55.90 e 1.255,90.
    if (
        !/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(texto) &&
        !/^\d+\.\d{1,2}$/.test(texto)
    ) {
        return null;
    }

    const normalizado = texto.includes(',')
        ? texto.replace(/\./g, '').replace(',', '.')
        : texto;

    const centavos = Math.round(Number(normalizado) * 100);

    if (
        !Number.isSafeInteger(centavos) ||
        centavos < 0 ||
        centavos > 9999999999
    ) {
        return null;
    }

    return centavos;
}

function textoEntrega(valor, limite) {
    return String(valor ?? '').trim().slice(0, limite);
}

function statusEntregaTexto(status) {
    return {
        pendente: 'Pendente',
        entregue: 'Entregue',
        nao_entregue: 'Não entregue'
    }[status] || status;
}

function pagamentoEntregaTexto(pagamento) {
    return {
        pendente: 'Não informado',
        pix: 'PIX informado',
        dinheiro: 'Dinheiro'
    }[pagamento] || pagamento;
}

function csrfEntregaCampo() {
    return `
        <input
            type="hidden"
            name="csrf"
            value="${csrfEntregas}"
        >
    `;
}

function validarFormularioEntrega(req, res, next) {
    if (req.body?.csrf !== csrfEntregas) {
        return res.status(403).send(
            'Página expirada. Volte, atualize a página e tente novamente.'
        );
    }

    next();
}

// Login do administrador.
// Não coloca sua senha no endereço da página.
function autenticarEntregas(req, res, next) {
    const senhaConfigurada = process.env.SENHA_EXCLUSAO_ENTREGAS;

    if (!senhaConfigurada) {
        return res.status(503).send(
            'Configure SENHA_ENTREGAS no Railway e reinicie o bot.'
        );
    }

    const autorizacao = req.headers.authorization || '';
    let usuario = '';
    let senha = '';

    if (autorizacao.startsWith('Basic ')) {
        const dados = Buffer.from(
            autorizacao.slice(6),
            'base64'
        ).toString('utf8');

        const separador = dados.indexOf(':');

        if (separador >= 0) {
            usuario = dados.slice(0, separador);
            senha = dados.slice(separador + 1);
        }
    }

    const recebida = cryptoEntregas
        .createHash('sha256')
        .update(senha)
        .digest();

    const correta = cryptoEntregas
        .createHash('sha256')
        .update(senhaConfigurada)
        .digest();

    if (
        usuario !== 'admin' ||
        !cryptoEntregas.timingSafeEqual(recebida, correta)
    ) {
        res.set(
            'WWW-Authenticate',
            'Basic realm="Entregas Coutech", charset="UTF-8"'
        );

        return res.status(401).send('Acesso restrito.');
    }

    next();
}

// ======================================================
// APARÊNCIA DAS PÁGINAS
// ======================================================

function paginaEntregas(titulo, conteudo) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
    >

    <title>${escaparHtml(titulo)}</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 16px;
            background: #111;
            color: #eee;
            font-family: Arial, sans-serif;
        }

        main {
            max-width: 1100px;
            margin: auto;
        }

        h1, h2 {
            margin-top: 0;
        }

        section, article {
            background: #222;
            padding: 18px;
            border-radius: 12px;
            margin-bottom: 16px;
        }

        label {
            display: block;
            margin-bottom: 5px;
        }

        input, select, button {
            width: 100%;
            padding: 12px;
            border-radius: 8px;
            font-size: 16px;
        }

        input, select {
            border: 1px solid #555;
            background: #303030;
            color: white;
        }

        button {
            border: 0;
            background: #e5b700;
            color: #111;
            font-weight: bold;
            cursor: pointer;
        }

        button:hover {
            filter: brightness(1.1);
        }

        form.grade {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
        }

        .inteira {
            grid-column: 1 / -1;
        }

        .tabela {
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #444;
        }

        a {
            color: #f1c40f;
        }

        .pix {
            background: #21c7a5;
        }

        .dinheiro {
            background: #e5b700;
        }

        .cinza {
            background: #555;
            color: white;
        }

        .botoes {
            display: grid;
            gap: 10px;
        }

        article {
            border-left: 5px solid #777;
        }

        article.entregue {
            border-color: #2ecc71;
        }

        article.nao_entregue {
            border-color: #e74c3c;
        }

        .aviso {
            color: #ccc;
            line-height: 1.5;
        }

        @media (max-width: 700px) {
            form.grade {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <main>
        <h1>${escaparHtml(titulo)}</h1>
        ${conteudo}
    </main>
</body>
</html>
    `;
}

// ======================================================
// PAINEL DA LOJA
// ======================================================

app.get(
    '/entregas/painel',
    autenticarEntregas,
    async (req, res) => {
        try {
            const data = String(req.query.data || hojeEntregas());

            if (!dataValidaEntregas(data)) {
                return res.status(400).send('Data inválida.');
            }

            const [entregas] = await db.execute(`
                SELECT *
                FROM entregas_motoboy
                WHERE data_rota = ?
                ORDER BY horario_rota, motoboy, id
            `, [data]);

            const linhas = entregas.map(e => `
                <tr>
                    <td>${escaparHtml(e.horario_rota)}</td>
                    <td>${escaparHtml(e.motoboy)}</td>
                    <td>${escaparHtml(e.pedido || '—')}</td>
                    <td>${escaparHtml(e.cliente)}</td>
                    <td>${moedaEntregas(e.total)}</td>
                    <td>
                        ${escaparHtml(
                            statusEntregaTexto(e.status_entrega)
                        )}
                    </td>
                    <td>
                        ${escaparHtml(
                            pagamentoEntregaTexto(e.forma_pagamento)
                        )}
                    </td>
                    <td>
                        <a
                            target="_blank"
                            rel="noopener noreferrer"
                            href="/entregas/motoboy/${encodeURIComponent(e.codigo_acesso)}"
                        >
                            Abrir rota
                        </a>
                    </td>
                </tr>
            `).join('');

            const opcoesHorarios = HORARIOS_ENTREGA.map(h => `
                <option value="${h}">${h}</option>
            `).join('');
			
			const gruposMotoboys = new Map();

			for (const entrega of entregas) {
				const codigo = entrega.codigo_acesso;

				if (!gruposMotoboys.has(codigo)) {
					gruposMotoboys.set(codigo, {
						nome: entrega.motoboy,
						horario: entrega.horario_rota,
						codigo,
						quantidade: 0
					});
				}

				gruposMotoboys.get(codigo).quantidade++;
			}

			const rotasPorMotoboy = new Map();

			for (const rota of gruposMotoboys.values()) {
				if (!rotasPorMotoboy.has(rota.nome)) {
					rotasPorMotoboy.set(rota.nome, []);
				}

				rotasPorMotoboy.get(rota.nome).push(rota);
			}

			const resumoMotoboys = Array.from(rotasPorMotoboy.entries())
				.map(([nome, rotas]) => `
					<div style="margin-bottom: 24px;">
						<h2>${escaparHtml(nome)}</h2>

						<div style="
							display: grid;
							grid-template-columns:
								repeat(auto-fit, minmax(min(100%, 210px), 1fr));
							gap: 14px;
						">
							${rotas
								.sort((a, b) => a.horario.localeCompare(b.horario))
								.map(rota => `
									<article style="margin: 0; min-width: 0;">
										<h3 style="margin-top: 0;">
											Rota ${escaparHtml(rota.horario)}
										</h3>

										<p>
											<strong>${rota.quantidade}</strong>
											${
												rota.quantidade === 1
													? 'entrega'
													: 'entregas'
											}
										</p>

										<div class="botoes">
											<a
												href="/entregas/motoboy/${encodeURIComponent(rota.codigo)}"
												target="_blank"
												rel="noopener noreferrer"
											>
												Abrir rota
											</a>

											<button
												type="button"
												class="copiar-link-motoboy"
												data-caminho="/entregas/motoboy/${encodeURIComponent(rota.codigo)}"
											>
												Copiar link para enviar
											</button>
										</div>
									</article>
								`)
								.join('')}
						</div>
					</div>
				`)
				.join('');

            res.send(paginaEntregas('Rotas de entrega', `
                <section>
                    <form method="get">
                        <label>Data das entregas</label>
                        <input
                            type="date"
                            name="data"
                            value="${data}"
                            required
                        >
                        <br><br>
                        <button>Consultar data</button>
                    </form>
                </section>

                <section>
                    <h2>Adicionar entrega</h2>
					
					<div style="margin-bottom: 20px;">
						<label for="textoPedidoWord">
							Colar pedido do Word
						</label>

						<textarea
							id="textoPedidoWord"
							rows="3"
							placeholder="Cole aqui o pedido completo copiado do Word..."
							style="
								width: 100%;
								padding: 12px;
								border: 1px solid #555;
								border-radius: 8px;
								background: #303030;
								color: white;
								font-family: Arial, sans-serif;
								font-size: 16px;
								resize: vertical;
							"
						></textarea>

						<button
							type="button"
							id="preencherPedidoWord"
							style="margin-top: 10px;"
						>
							Preencher dados do pedido
						</button>

						<p
							id="resultadoLeituraWord"
							class="aviso"
							role="status"
						></p>
					</div>

                    <form
						id="formAdicionarEntrega"
						class="grade"
						method="post"
						action="/entregas/painel"
					>
                        ${csrfEntregaCampo()}

                        <input
                            type="hidden"
                            name="data_rota"
                            value="${data}"
                        >

                        <div>
                            <label>Horário</label>
                            <select name="horario_rota">
                                ${opcoesHorarios}
                            </select>
                        </div>

                        <div>
							<label>Motoboy</label>
							<select name="motoboy" required>
								<option value="Kaue">Kaue</option>
								<option value="Fabricio">Fabricio</option>
							</select>
						</div>

                        <div>
                            <label>Número do pedido</label>
                            <input name="pedido" maxlength="50">
                        </div>

                        <div>
                            <label>Cliente</label>
                            <input
                                name="cliente"
                                maxlength="150"
                                required
                            >
                        </div>

                        <div>
                            <label>Telefone</label>
                            <input
                                name="telefone"
                                maxlength="30"
                            >
                        </div>

                        <div>
                            <label>Valor a cobrar</label>
                            <input
                                name="total"
                                inputmode="decimal"
                                placeholder="Ex.: 55,90"
                                required
                            >
                        </div>

                        <div class="inteira">
                            <label>Endereço completo</label>
                            <input
                                name="endereco"
                                maxlength="255"
                                required
                            >
                        </div>

                        <div>
                            <label>Cidade</label>
                            <input name="cidade" maxlength="100">
                        </div>

                        <div class="inteira">
                            <button>Adicionar à rota</button>
                        </div>
                    </form>
                </section>

                <section>
					<h2>Rotas dos motoboys</h2>

					<p class="aviso">
						Entregas da data selecionada, separadas por motoboy e horário.
					</p>

					${resumoMotoboys || `
						<p>Nenhuma entrega cadastrada nesta data.</p>
					`}
				</section>
				
				<script>
				(function () {
					const botoes = document.querySelectorAll(
						'.copiar-link-motoboy'
					);

					botoes.forEach(function (botao) {
						botao.addEventListener('click', async function () {
							const link = new URL(
								botao.dataset.caminho,
								window.location.origin
							).href;

							try {
								await navigator.clipboard.writeText(link);

								botao.textContent = 'Link copiado! Cole no WhatsApp.';

								setTimeout(function () {
									botao.textContent = 'Copiar link para enviar';
								}, 3000);
							} catch (erro) {
								window.prompt(
									'Copie este link e envie ao motoboy:',
									link
								);
							}
						});
					});
				})();
				</script>

                <p>
                    <a href="/entregas/conferencia?data=${data}">
                        Abrir conferência desta data
                    </a>
                </p>
				<script>
				(function () {
					const textoPedido = document.getElementById('textoPedidoWord');
					const resultado = document.getElementById('resultadoLeituraWord');
					const formulario = document.getElementById('formAdicionarEntrega');
					const botaoPreencher = document.getElementById('preencherPedidoWord');

					if (!textoPedido || !resultado || !formulario) {
						return;
					}

					const horario = formulario.elements.namedItem('horario_rota');
					const motoboy = formulario.elements.namedItem('motoboy');

					// Mantém visíveis apenas horário e motoboy.
					// Os demais campos continuam no formulário para envio ao servidor.
					Array.from(formulario.children).forEach(function (elemento) {
						if (
							elemento.tagName === 'DIV' &&
							!elemento.contains(horario) &&
							!elemento.contains(motoboy)
						) {
							elemento.hidden = true;
						}
					});

					if (botaoPreencher) {
						botaoPreencher.hidden = true;
					}

					// Coloca horário e motoboy antes do campo de colagem.
					const areaColagem = textoPedido.parentElement;

					areaColagem.parentElement.insertBefore(
						formulario,
						areaColagem
					);

					formulario.style.marginBottom = '20px';

					textoPedido.placeholder =
						'Selecione horário e motoboy acima e cole um pedido aqui. ' +
						'Ele será cadastrado automaticamente.';

					resultado.textContent =
						'Selecione horário e motoboy antes de colar. ' +
						'Cole apenas um pedido por vez.';

					// Preserva a seleção nesta aba depois do cadastro.
					const chaveSelecao = 'coutech_selecao_entregas';

					try {
						const selecao = JSON.parse(
							sessionStorage.getItem(chaveSelecao) || 'null'
						);

						if (selecao) {
							const horarioExiste = Array.from(horario.options).some(
								function (opcao) {
									return opcao.value === selecao.horario;
								}
							);

							if (horarioExiste) {
								horario.value = selecao.horario;
							}

							motoboy.value = selecao.motoboy || '';
						}
					} catch (erro) {
						// O cadastro continua funcionando sem armazenamento local.
					}

					function guardarSelecao() {
						try {
							sessionStorage.setItem(
								chaveSelecao,
								JSON.stringify({
									horario: horario.value,
									motoboy: motoboy.value.trim()
								})
							);
						} catch (erro) {
							// O cadastro continua funcionando normalmente.
						}
					}

					horario.addEventListener('change', guardarSelecao);
					motoboy.addEventListener('input', guardarSelecao);

					function normalizarRotulo(texto) {
						return texto
							.normalize('NFD')
							.replace(/[\\u0300-\\u036f]/g, '')
							.toLowerCase()
							.replace(/[^a-z0-9]/g, '');
					}

					function valorValido(texto) {
						return (
							/^(?:\\d+|\\d{1,3}(?:\\.\\d{3})+)(?:,\\d{1,2})?$/.test(texto) ||
							/^\\d+\\.\\d{1,2}$/.test(texto)
						);
					}

					let enviando = false;

					// Evita envio acidental ao apertar Enter no campo motoboy.
					formulario.addEventListener('submit', function (evento) {
						evento.preventDefault();
					});

					textoPedido.addEventListener('paste', function (evento) {
						evento.preventDefault();

						if (enviando) {
							return;
						}

						const texto = evento.clipboardData
							?.getData('text/plain')
							.replace(/\\u00a0/g, ' ')
							.trim() || '';

						textoPedido.value = texto;

						if (!horario.value || !motoboy.value.trim()) {
							resultado.textContent =
								'Selecione o horário e informe o motoboy. ' +
								'Depois cole o pedido novamente.';

							motoboy.focus();
							return;
						}

						if (!texto) {
							resultado.textContent = 'Nenhum texto encontrado para colar.';
							return;
						}

						const linhas = texto.split(/\\r\\n|\\n|\\r/);
						const dados = {};
						let numeroPedido = '';
						let quantidadePedidos = 0;

						for (const linhaOriginal of linhas) {
							const linha = linhaOriginal.trim();

							const pedidoEncontrado = linha.match(
								/^Pedido\\s*(?:N[º°o.]*)?\\s*[:#-]?\\s*(\\d+)\\s*$/i
							);

							if (pedidoEncontrado) {
								numeroPedido = pedidoEncontrado[1];
								quantidadePedidos++;
								continue;
							}

							const separador = linha.indexOf(':');

							if (separador < 0) {
								continue;
							}

							const rotulo = normalizarRotulo(
								linha.slice(0, separador)
							);

							dados[rotulo] = linha.slice(separador + 1).trim();
						}

						if (quantidadePedidos !== 1) {
							resultado.textContent =
								'Não cadastrei: cole um único pedido completo, ' +
								'incluindo a linha Pedido Nº.';
							return;
						}

						const campos = {
							pedido: numeroPedido,
							cliente: dados.cliente || '',
							telefone: dados.telefone || '',
							endereco: dados.endereco || '',
							cidade: dados.cidade || '',
							total: (dados.total || '')
								.replace(/^R\\$\\s*/i, '')
								.trim()
						};

						const faltantes = [];

						if (!campos.cliente) faltantes.push('cliente');
						if (!campos.endereco) faltantes.push('endereço');
						if (!campos.total) faltantes.push('total');

						if (faltantes.length) {
							resultado.textContent =
								'Não cadastrei: faltam ' +
								faltantes.join(', ') +
								'. Corrija o texto e cole novamente.';
							return;
						}

						if (!valorValido(campos.total)) {
							resultado.textContent =
								'Não cadastrei: o total está inválido. ' +
								'Use, por exemplo, Total: R$ 100,00.';
							return;
						}

						const situacaoPagamento = normalizarRotulo(
							dados.estapago || ''
						);

						if (situacaoPagamento === 'sim') {
							resultado.textContent =
								'Não cadastrei: este pedido já está pago. ' +
								'Precisamos adicionar a opção Já pago ao sistema ' +
								'para evitar uma nova cobrança.';
							return;
						}

						Object.entries(campos).forEach(function (entrada) {
							formulario.elements.namedItem(entrada[0]).value =
								entrada[1];
						});

						// Verifica os dados antes de enviar, inclusive os campos ocultos.
						const campoInvalido = Array.from(formulario.elements).find(
							function (campo) {
								return campo.willValidate && !campo.validity.valid;
							}
						);

						if (campoInvalido) {
							resultado.textContent =
								'Não cadastrei: confira o campo ' +
								campoInvalido.name +
								' no texto e cole novamente.';
							return;
						}

						guardarSelecao();

						enviando = true;
						textoPedido.readOnly = true;

						resultado.textContent =
							'Cadastrando pedido ' + numeroPedido + '...';

						// Envia para a rota de cadastro que já existe.
						// O servidor salva e retorna ao painel atualizado.
						HTMLFormElement.prototype.submit.call(formulario);
					});
				})();
				</script>
            `));
        } catch (erro) {
            console.error('Erro no painel de entregas:', erro);
            res.status(500).send('Erro ao abrir painel de entregas.');
        }
    }
);

// ======================================================
// CADASTRAR ENTREGA
// ======================================================

app.post(
    '/entregas/painel',
    autenticarEntregas,
    validarFormularioEntrega,
    async (req, res) => {
        const data = String(req.body.data_rota || '');
        const horario = String(req.body.horario_rota || '');
        const motoboy = textoEntrega(req.body.motoboy, 100);
        const cliente = textoEntrega(req.body.cliente, 150);
        const endereco = textoEntrega(req.body.endereco, 255);
        const centavos = centavosEntregas(req.body.total);

        if (
            !dataValidaEntregas(data) ||
            !HORARIOS_ENTREGA.includes(horario) ||
            !motoboy ||
            !cliente ||
            !endereco ||
            centavos === null
        ) {
            return res.status(400).send(
                'Dados inválidos. Confira data, horário, motoboy, ' +
                'cliente, endereço e valor.'
            );
        }

        // O código é derivado da data, horário e motoboy.
        // Assim, cadastros simultâneos da mesma rota usam o mesmo link.
        const nomeNormalizado = motoboy
            .normalize('NFC')
            .toLocaleLowerCase('pt-BR');

        const codigoGerado = cryptoEntregas
            .createHmac('sha256', process.env.SENHA_ENTREGAS)
            .update(JSON.stringify([data, horario, nomeNormalizado]))
            .digest('hex')
            .slice(0, 36);

        try {
            // Reutiliza também links que já tenham sido cadastrados.
            const [existentes] = await db.execute(`
                SELECT codigo_acesso
                FROM entregas_motoboy
                WHERE data_rota = ?
                  AND horario_rota = ?
                  AND motoboy = ?
                LIMIT 1
            `, [data, horario, motoboy]);

            const codigo =
                existentes[0]?.codigo_acesso || codigoGerado;

            await db.execute(`
                INSERT INTO entregas_motoboy (
                    data_rota,
                    horario_rota,
                    motoboy,
                    codigo_acesso,
                    pedido,
                    cliente,
                    telefone,
                    endereco,
                    cidade,
                    total
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data,
                horario,
                motoboy,
                codigo,
                textoEntrega(req.body.pedido, 50) || null,
                cliente,
                textoEntrega(req.body.telefone, 30) || null,
                endereco,
                textoEntrega(req.body.cidade, 100) || null,
                (centavos / 100).toFixed(2)
            ]);

            res.redirect(303, `/entregas/painel?data=${data}`);
        } catch (erro) {
            console.error('Erro ao cadastrar entrega:', erro);
            res.status(500).send('Não foi possível cadastrar a entrega.');
        }
    }
);

// ======================================================
// PÁGINA DO MOTOBOY
// ======================================================

app.get('/entregas/motoboy/:codigo', async (req, res) => {
    const codigo = String(req.params.codigo || '');

    if (!/^[a-f0-9-]{36}$/.test(codigo)) {
        return res.status(404).send('Rota não encontrada.');
    }

    try {
        const [entregas] = await db.execute(`
            SELECT *,
                DATE_FORMAT(data_rota, '%d/%m/%Y') AS data_formatada
            FROM entregas_motoboy
            WHERE codigo_acesso = ?
            ORDER BY id
        `, [codigo]);

        if (!entregas.length) {
            return res.status(404).send('Rota não encontrada.');
        }

        const rota = entregas[0];

        const cards = entregas.map(e => `
            <article class="${escaparHtml(e.status_entrega)}">
                <h2>${escaparHtml(e.cliente)}</h2>

                <p>
                    ${escaparHtml(e.endereco)}
                    <br>
                    ${escaparHtml(e.cidade || '')}
                </p>

                <p>
                    Pedido: ${escaparHtml(e.pedido || '—')}
                    <br>
                    Telefone: ${escaparHtml(e.telefone || '—')}
                </p>

                <h2>Valor do pedido: ${moedaEntregas(e.total)}</h2>

				${e.forma_pagamento === 'dinheiro' ? `
					<p style="color: #4ade80; font-weight: bold;">
						Recebido em dinheiro:
						${moedaEntregas(
							e.valor_recebido_dinheiro ?? e.total
						)}
					</p>
				` : ''}

                <p>
                    Entrega:
                    <strong>
                        ${escaparHtml(
                            statusEntregaTexto(e.status_entrega)
                        )}
                    </strong>
                    <br>
                    Pagamento:
                    <strong>
                        ${escaparHtml(
                            pagamentoEntregaTexto(e.forma_pagamento)
                        )}
                    </strong>
                </p>

                <form
                    method="post"
                    action="/entregas/${e.id}/confirmar"
                    class="botoes"
                    onsubmit="return confirm('Confirma esta alteração?')"
                >
                    ${csrfEntregaCampo()}

                    <input
                        type="hidden"
                        name="codigo"
                        value="${escaparHtml(codigo)}"
                    >

                    <button
                        name="acao"
                        value="pix"
                        class="pix"
                    >
                        Entregue — cliente pagou no PIX
                    </button>

                    <button
                        name="acao"
                        value="dinheiro"
                        class="dinheiro"
                    >
                        Entregue — recebi em dinheiro
                    </button>
					
					<div style="
						padding: 12px;
						border: 1px solid #666;
						border-radius: 8px;
					">
						<label for="valor-dinheiro-${e.id}">
							Valor recebido em dinheiro
						</label>

						<input
							id="valor-dinheiro-${e.id}"
							name="valor_dinheiro"
							type="text"
							inputmode="decimal"
							placeholder="Ex.: 120,00"
							autocomplete="off"
						>

						<p class="aviso" style="font-size: 13px;">
							Informe o valor que ficou com você,
							descontando o troco devolvido.
						</p>

						<button
							name="acao"
							value="dinheiro_personalizado"
							class="dinheiro"
						>
							Entregue — salvar valor informado
						</button>
					</div>

                    <button
                        name="acao"
                        value="nao_entregue"
                        class="cinza"
                    >
                        Não entregue
                    </button>

                    <button
                        name="acao"
                        value="pendente"
                        class="cinza"
                    >
                        Desfazer marcação
                    </button>
                </form>
            </article>
        `).join('');

        res.send(paginaEntregas(
            `Rota das ${rota.horario_rota}`,
            `
                <p>
                    ${escaparHtml(rota.motoboy)}
                    · ${escaparHtml(rota.data_formatada)}
                </p>

                <p class="aviso">
                    É necessário ter internet para salvar.
                    A marcação de PIX é uma informação do entregador:
                    a loja ainda precisa conferir o recebimento.
                </p>

                ${cards}
            `
        ));
    } catch (erro) {
        console.error('Erro ao abrir rota do motoboy:', erro);
        res.status(500).send('Não foi possível abrir a rota.');
    }
});

// ======================================================
// SALVAR CONFIRMAÇÃO DO MOTOBOY
// ======================================================

app.post(
    '/entregas/:id/confirmar',
    validarFormularioEntrega,
    async (req, res) => {
        const id = String(req.params.id || '');
        const codigo = String(req.body.codigo || '');
        const acao = String(req.body.acao || '');

        const acoes = {
            pix: ['entregue', 'pix'],
            dinheiro: ['entregue', 'dinheiro'],
            dinheiro_personalizado: ['entregue', 'dinheiro'],
            nao_entregue: ['nao_entregue', 'pendente'],
            pendente: ['pendente', 'pendente']
        };

        if (
            !/^\d+$/.test(id) ||
            !/^[a-f0-9-]{36}$/.test(codigo) ||
            !Object.prototype.hasOwnProperty.call(acoes, acao)
        ) {
            return res.status(400).send('Confirmação inválida.');
        }

        let conexao;

        try {
            conexao = await db.getConnection();
            await conexao.beginTransaction();

            const [entregas] = await conexao.execute(`
                SELECT total
                FROM entregas_motoboy
                WHERE id = ?
                  AND codigo_acesso = ?
                FOR UPDATE
            `, [id, codigo]);

            if (!entregas.length) {
                await conexao.rollback();

                return res.status(404).send(
                    'Entrega não encontrada.'
                );
            }

            const totalCentavos = Math.round(
                Number(entregas[0].total) * 100
            );

            let valorRecebido = null;

            if (acao === 'dinheiro') {
                // Botão original: recebe o valor exato do pedido.
                valorRecebido = (totalCentavos / 100).toFixed(2);
            }

            if (acao === 'dinheiro_personalizado') {
                const informado = centavosEntregas(
                    req.body.valor_dinheiro
                );

                if (
                    informado === null ||
                    informado < totalCentavos
                ) {
                    await conexao.rollback();

                    return res.status(400).send(
                        paginaEntregas('Confira o valor recebido', `
                            <section>
                                <p>
                                    Informe um valor válido, igual
                                    ou maior que o valor do pedido:
                                    ${moedaEntregas(entregas[0].total)}.
                                </p>

                                <a href="/entregas/motoboy/${encodeURIComponent(codigo)}">
                                    Voltar à rota
                                </a>
                            </section>
                        `)
                    );
                }

                valorRecebido = (informado / 100).toFixed(2);
            }

            const [status, pagamento] = acoes[acao];

            await conexao.execute(`
                UPDATE entregas_motoboy
                SET status_entrega = ?,
                    forma_pagamento = ?,
                    valor_recebido_dinheiro = ?
                WHERE id = ?
                  AND codigo_acesso = ?
            `, [
                status,
                pagamento,
                valorRecebido,
                id,
                codigo
            ]);

            await conexao.commit();

            res.redirect(
                303,
                '/entregas/motoboy/' + encodeURIComponent(codigo)
            );
        } catch (erro) {
            if (conexao) {
                try {
                    await conexao.rollback();
                } catch (erroRollback) {
                    console.error(
                        'Erro ao desfazer confirmação:',
                        erroRollback
                    );
                }
            }

            console.error('Erro ao confirmar entrega:', erro);

            res.status(500).send(
                'Não foi possível salvar. Atualize a rota ' +
                'para conferir a situação antes de tentar novamente.'
            );
        } finally {
            if (conexao) {
                conexao.release();
            }
        }
    }
);

// ======================================================
// CONFERÊNCIA DA LOJA
// ======================================================

app.get(
    '/entregas/conferencia',
    autenticarEntregas,
    async (req, res) => {
        const data = String(req.query.data || hojeEntregas());

        if (!dataValidaEntregas(data)) {
            return res.status(400).send('Data inválida.');
        }

        try {
            const [resumo] = await db.execute(`
                SELECT
                    horario_rota,
                    motoboy,
                    COUNT(*) AS quantidade,

                    SUM(
                        CASE WHEN forma_pagamento = 'pix'
                        THEN total ELSE 0 END
                    ) AS pix,

                    SUM(
						CASE WHEN forma_pagamento = 'dinheiro'
						THEN COALESCE(valor_recebido_dinheiro, total)
						ELSE 0 END
					) AS dinheiro,

                    SUM(
                        CASE WHEN status_entrega = 'pendente'
                        THEN total ELSE 0 END
                    ) AS pendente,

                    SUM(
                        CASE WHEN status_entrega = 'nao_entregue'
                        THEN total ELSE 0 END
                    ) AS nao_entregue

                FROM entregas_motoboy
                WHERE data_rota = ?
                GROUP BY horario_rota, motoboy
                ORDER BY horario_rota, motoboy
            `, [data]);
			
			await prepararTabelaConferencia();

			const [conferenciasSalvas] = await db.execute(`
				SELECT horario_rota, motoboy, resultado
				FROM conferencias_motoboy
				WHERE data_rota = ?
			`, [data]);

			function chaveConferencia(horario, motoboy) {
				return JSON.stringify([horario, motoboy]);
			}

			const resultadosConferencia = new Map(
				conferenciasSalvas.map(c => [
					chaveConferencia(c.horario_rota, c.motoboy),
					c.resultado
				])
			);

			function botoesConferencia(rota) {
				const resultado = resultadosConferencia.get(
					chaveConferencia(rota.horario_rota, rota.motoboy)
				);

				const texto = resultado === 'correta'
					? '✓ Conferência correta'
					: resultado === 'incorreta'
						? '✕ Conferência incorreta'
						: 'Ainda não conferida';

				const cor = resultado === 'correta'
					? '#4ade80'
					: resultado === 'incorreta'
						? '#ff4d4f'
						: '#ccc';

				return `
					<div style="min-width: 190px;">
						<p style="
							margin: 0 0 8px;
							color: ${cor};
							font-weight: bold;
						">
							${texto}
						</p>

						<form
							method="post"
							action="/entregas/conferencia/resultado"
							style="display: flex; gap: 6px; margin: 0;"
						>
							${csrfEntregaCampo()}

							<input type="hidden" name="data" value="${data}">

							<input
								type="hidden"
								name="horario"
								value="${escaparHtml(rota.horario_rota)}"
							>

							<input
								type="hidden"
								name="motoboy"
								value="${escaparHtml(rota.motoboy)}"
							>

							<button
								type="submit"
								name="resultado"
								value="correta"
								aria-pressed="${resultado === 'correta'}"
								style="
									width: auto;
									padding: 6px 10px;
									font-size: 13px;
									background: #166534;
									color: white;
									border: 2px solid ${
										resultado === 'correta'
											? '#4ade80'
											: 'transparent'
									};
								"
							>
								Correta
							</button>

							<button
								type="submit"
								name="resultado"
								value="incorreta"
								aria-pressed="${resultado === 'incorreta'}"
								style="
									width: auto;
									padding: 6px 10px;
									font-size: 13px;
									background: #991b1b;
									color: white;
									border: 2px solid ${
										resultado === 'incorreta'
											? '#ff4d4f'
											: 'transparent'
									};
								"
							>
								Incorreta
							</button>
						</form>
					</div>
				`;
			}

            const linhas = resumo.map(r => `
                <tr>
                    <td>${escaparHtml(r.horario_rota)}</td>
                    <td>${escaparHtml(r.motoboy)}</td>
                    <td>${Number(r.quantidade)}</td>
                    <td>${moedaEntregas(r.pix)}</td>
                    <td>
                        <strong>${moedaEntregas(r.dinheiro)}</strong>
                    </td>
                    <td style="${
						Number(r.pendente) > 0
							? 'color: #ff4d4f; font-weight: bold;'
							: ''
					}">
						${moedaEntregas(r.pendente)}
					</td>
                    <td>${moedaEntregas(r.nao_entregue)}</td>
					<td>${botoesConferencia(r)}</td>
                </tr>
            `).join('');
			
			const [pedidosConferencia] = await db.execute(`
				SELECT
					id,
					horario_rota,
					motoboy,
					pedido,
					cliente,
					total
				FROM entregas_motoboy
				WHERE data_rota = ?
				ORDER BY horario_rota, motoboy, id
			`, [data]);

			const linhasPedidosConferencia = pedidosConferencia.map(e => `
				<tr>
					<td>${escaparHtml(e.horario_rota)}</td>
					<td>${escaparHtml(e.motoboy)}</td>
					<td>${escaparHtml(e.pedido || '—')}</td>
					<td>${escaparHtml(e.cliente)}</td>
					<td>${moedaEntregas(e.total)}</td>
					<td>
						<form
							method="post"
							action="/entregas/${e.id}/excluir"
							onsubmit="return confirm('Excluir esta entrega definitivamente? Ela também será removida dos totais da conferência.');"
						>
							${csrfEntregaCampo()}

							<input
								type="hidden"
								name="data"
								value="${data}"
							>

							<button
								type="submit"
								style="background: #c62828; color: white;"
							>
								Excluir entrega
							</button>
						</form>
					</td>
				</tr>
			`).join('');

            res.send(paginaEntregas('Conferência de entregas', `
                <section>
                    <form method="get">
                        <label>Data</label>
                        <input
                            type="date"
                            name="data"
                            value="${data}"
                            required
                        >
                        <br><br>
                        <button>Atualizar conferência</button>
                    </form>
                </section>

                <section>
                    <div class="tabela">
                        <table>
                            <thead>
                                <tr>
                                    <th>Rota</th>
                                    <th>Motoboy</th>
                                    <th>Entregas</th>
                                    <th>PIX informado</th>
                                    <th>Dinheiro a trazer</th>
                                    <th>Sem marcação</th>
                                    <th>Não entregue</th>
									<th>Conferência</th>
                                </tr>
                            </thead>

                            <tbody>
                                ${linhas || `
                                    <tr>
                                        <td colspan="8">
                                            Nenhuma entrega nesta data.
                                        </td>
                                    </tr>
                                `}
                            </tbody>
                        </table>
                    </div>

                    <p class="aviso">
                        Os valores refletem as marcações dos motoboys.
                        Confira os PIX no banco.
                        O dinheiro é o total registrado como recebido,
                        sem descontar despesas ou fundo de troco.
                    </p>
                </section>
				
				<section>
					<h2>Gerenciar entregas</h2>

					<style>
						.tabela-gerenciar-entregas th,
						.tabela-gerenciar-entregas td {
							padding: 5px 8px;
							font-size: 14px;
						}

						.tabela-gerenciar-entregas form {
							margin: 0;
						}

						.tabela-gerenciar-entregas button {
							width: auto;
							padding: 5px 10px;
							font-size: 13px;
							border-radius: 5px;
						}
					</style>

					<div class="tabela tabela-gerenciar-entregas">
						<table>
							<thead>
								<tr>
									<th>Rota</th>
									<th>Motoboy</th>
									<th>Pedido</th>
									<th>Cliente</th>
									<th>Valor</th>
									<th>Ação</th>
								</tr>
							</thead>

							<tbody>
								${linhasPedidosConferencia || `
									<tr>
										<td colspan="6">
											Nenhuma entrega nesta data.
										</td>
									</tr>
								`}
							</tbody>
						</table>
					</div>
				</section>

                <p>
                    <a href="/entregas/painel?data=${data}">
                        Voltar ao painel
                    </a>
                </p>
            `));
        } catch (erro) {
            console.error('Erro na conferência de entregas:', erro);
            res.status(500).send('Não foi possível abrir a conferência.');
        }
    }
);

// ======================================================
// EXCLUIR ENTREGA — SOMENTE ADMINISTRADOR
// ======================================================

app.post(
    '/entregas/:id/excluir',
    autenticarEntregas,
    validarFormularioEntrega,
    async (req, res) => {
        const id = String(req.params.id || '');
        const data = String(req.body.data || '');

        if (!/^\d+$/.test(id) || !dataValidaEntregas(data)) {
            return res.status(400).send('Dados inválidos.');
        }

        try {
            const [resultado] = await db.execute(`
                DELETE FROM entregas_motoboy
                WHERE id = ?
                  AND data_rota = ?
            `, [id, data]);

            if (!resultado.affectedRows) {
                return res.status(404).send(
                    'Entrega não encontrada ou já excluída.'
                );
            }

            res.redirect(
                303,
                '/entregas/conferencia?data=' + encodeURIComponent(data)
            );
        } catch (erro) {
            console.error('Erro ao excluir entrega:', erro);

            res.status(500).send(
                'Não foi possível excluir a entrega.'
            );
        }
    }
);

// ======================================================
// RESULTADO DA CONFERÊNCIA POR ROTA
// ======================================================

let tabelaConferenciaPronta = null;

function prepararTabelaConferencia() {
    if (!tabelaConferenciaPronta) {
        tabelaConferenciaPronta = db.execute(`
            CREATE TABLE IF NOT EXISTS conferencias_motoboy (
                data_rota DATE NOT NULL,
                horario_rota VARCHAR(5) NOT NULL,
                motoboy VARCHAR(100) NOT NULL,

                resultado ENUM(
                    'correta',
                    'incorreta'
                ) NOT NULL,

                atualizado_em DATETIME NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,

                PRIMARY KEY (
                    data_rota,
                    horario_rota,
                    motoboy
                )
            )
        `).catch(erro => {
            tabelaConferenciaPronta = null;
            throw erro;
        });
    }

    return tabelaConferenciaPronta;
}

app.post(
    '/entregas/conferencia/resultado',
    autenticarEntregas,
    validarFormularioEntrega,
    async (req, res) => {
        const data = String(req.body.data || '');
        const horario = String(req.body.horario || '');
        const motoboy = textoEntrega(req.body.motoboy, 100);
        const resultado = String(req.body.resultado || '');

        if (
            !dataValidaEntregas(data) ||
            !HORARIOS_ENTREGA.includes(horario) ||
            !motoboy ||
            !['correta', 'incorreta'].includes(resultado)
        ) {
            return res.status(400).send('Dados inválidos.');
        }

        try {
            await prepararTabelaConferencia();

            const [rotas] = await db.execute(`
                SELECT id
                FROM entregas_motoboy
                WHERE data_rota = ?
                  AND horario_rota = ?
                  AND motoboy = ?
                LIMIT 1
            `, [data, horario, motoboy]);

            if (!rotas.length) {
                return res.status(404).send('Rota não encontrada.');
            }

            await db.execute(`
                INSERT INTO conferencias_motoboy (
                    data_rota,
                    horario_rota,
                    motoboy,
                    resultado
                )
                VALUES (?, ?, ?, ?)

                ON DUPLICATE KEY UPDATE
                    resultado = ?,
                    atualizado_em = CURRENT_TIMESTAMP
            `, [
                data,
                horario,
                motoboy,
                resultado,
                resultado
            ]);

            res.redirect(
                303,
                '/entregas/conferencia?data=' + encodeURIComponent(data)
            );
        } catch (erro) {
            console.error('Erro ao salvar conferência:', erro);

            res.status(500).send(
                'Não foi possível salvar a conferência.'
            );
        }
    }
);

// ======================================================
// VALOR EFETIVAMENTE RECEBIDO EM DINHEIRO
// ======================================================

let colunaDinheiroPronta = null;

function prepararColunaDinheiro() {
    if (!colunaDinheiroPronta) {
        colunaDinheiroPronta = (async () => {
            await prepararTabelaEntregas();

            const [colunas] = await db.execute(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'entregas_motoboy'
                  AND COLUMN_NAME = 'valor_recebido_dinheiro'
            `);

            if (!colunas.length) {
                try {
                    await db.execute(`
                        ALTER TABLE entregas_motoboy
                        ADD COLUMN valor_recebido_dinheiro
                            DECIMAL(10,2) NULL DEFAULT NULL
                    `);
                } catch (erro) {
                    // Outra instância pode ter criado a coluna.
                    if (erro.code !== 'ER_DUP_FIELDNAME') {
                        throw erro;
                    }
                }
            }
        })().catch(erro => {
            colunaDinheiroPronta = null;
            throw erro;
        });
    }

    return colunaDinheiroPronta;
}

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 API de cupons ativa na porta ${PORT}`);
});