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
		puppeteer:{
		headless:true,
		    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
			args:[
				'--no-sandbox',
				'--disable-setuid-sandbox'
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
		console.log(`Chat reativado automaticamente: ${chatId}`);
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

    // Tela
    pesquisa = pesquisa.replace(/\bdisplay\b/g, "tela");
    pesquisa = pesquisa.replace(/\bfrontal\b/g, "tela");
    pesquisa = pesquisa.replace(/\bcombo\b/g, "tela");

    // Placa de carga
    pesquisa = pesquisa.replace(/\bdock\b/g, "placa de carga");
    pesquisa = pesquisa.replace(/\bcarga\b/g, "placa de carga");

    // Se não informou o tipo da peça, assume tela
    const tipos = [
        "tela",
        "bateria",
        "placa de carga",
        "flex",
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
        console.log(`🔎 Consultando GestãoClick: ${pesquisa}`);

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

            /*
             * Exige que todas as palavras pesquisadas apareçam.
             * Assim "tela A12" encontra:
             * "Tela Samsung A12 com aro"
             */
            return palavrasPesquisa.every(palavra =>
                nomeProduto.includes(palavra)
            );
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
            `🔎 Encontrei estas opções para ` +
            `*${produto.toUpperCase()}*:\n\n`;

        encontradosLimitados.forEach((item, index) => {
            mensagem += `${index + 1}️⃣ *${item.nome}*\n`;
            mensagem +=
                `💰 R$ ${formatarPreco(item.valor_venda)}\n`;

            if (
                item.estoque !== undefined &&
                item.estoque !== null &&
                item.estoque !== ""
            ) {
                mensagem += `📦 Estoque: ${item.estoque}\n`;
            }

            mensagem += "\n";
        });

        mensagem += "Para fazer pedido digite 2️⃣";

        console.log(
            `✅ GestãoClick retornou ${encontrados.length} produto(s)`
        );

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
        `  Qtd: ${produto.quantidade} | Valor: R$ ${produto.valorTotal}\n`;
    }

    mensagem += '\n';
  }

  if (dados.valorProdutos) {
    mensagem += `Valor dos produtos: R$ ${dados.valorProdutos}\n`;
  }

  if (dados.desconto && dados.desconto !== '0,00') {
    mensagem += `Desconto: R$ ${dados.desconto}\n`;
  }

  mensagem += `*Total: R$ ${dados.total || '0,00'}*\n`;

  if (dados.formaPagamento) {
    mensagem += `Forma de pagamento: ${dados.formaPagamento}\n`;
  }

  if (
    dados.coleta &&
    dados.coleta.toLowerCase() !== 'sem' &&
    dados.coleta.toLowerCase() !== 'sem coleta'
  ) {
    mensagem += `Coletar: ${dados.coleta}\n`;
  }

  mensagem +=
	`\nAtendente: ${dados.atendente || 'Não informado'}\n` +
    `A Coutech Cell agradece a preferência!`;

  return mensagem;
}

function montarMensagemSaldo(dados) {
  return (
`💳 *ATUALIZAÇÃO DA SUA CONTA*

Olá, ${dados.cliente || 'cliente'}!

Recebemos um pagamento em sua conta.

💰 Valor recebido:
R$ ${dados.valorPagamento}

📌 Forma de pagamento:
${dados.formaPagamento}

━━━━━━━━━━━━━━━━━━

💳 Saldo atual:
*R$ ${dados.saldo}*

Obrigado pela preferência!

*COUTECH CELL*`
  );
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

setInterval(async () => {
    try {
        const state = await client.getState();

        if (!state) {
            console.log("⚠ WhatsApp ainda está inicializando.");
            return;
        }

        if (state !== "CONNECTED") {
            console.log(`⚠ Estado atual do WhatsApp: ${state}`);
        }
    } catch (erro) {
        console.error(
            "Erro ao verificar o estado:",
            erro.message || erro
        );
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
   * Um erro ao consultar o saldo não desfaz
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

    if (!client.info) {
      return res.status(503).json({
        sucesso: false,
        erro: 'WhatsApp não conectado'
      });
    }

    const numero =
      normalizarTelefoneBrasil(telefone);

    const numeroWhatsApp =
      await client.getNumberId(numero);

    if (!numeroWhatsApp) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Número não possui WhatsApp'
      });
    }

    const mensagem =
      montarMensagemSaldo({
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
      `💳 Saldo enviado para ${cliente}`
    );

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

        for (const cliente of clientes) {
            const saldo = Number(cliente.saldo || 0);

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

        await db.execute(
            `
            INSERT INTO clientes_conta_prazo (
                nome,
                telefone,
                ativo
            ) VALUES (?, ?, 1, ?)
            `,
            [
                nome,
                telefone
            ]
        );

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

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 API de cupons ativa na porta ${PORT}`);
});