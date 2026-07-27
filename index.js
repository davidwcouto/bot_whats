const mysql = require('mysql2/promise');
require('dotenv').config();

process.on('unhandledRejection', err => {
    console.error('UNHANDLED REJECTION:', err);
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
const cloudinary = require("cloudinary").v2;
const path = require("path");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const express = require('express');
const qrcode = require("qrcode-terminal");
const xlsx = require("xlsx");
const puppeteer = require('puppeteer');
const app = express();
const port = process.env.PORT || 3000;
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

// Carrega a planilha
let data = [];
try {
    const workbook = xlsx.readFile("precos.xlsx");
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    data = xlsx.utils.sheet_to_json(sheet);
    console.log("📂 Planilha carregada com sucesso!");
} catch (error) {
    console.error("⚠ Erro ao carregar a planilha:", error.message);
}

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
const buscarPreco = (produto, chatId) => {
    if (!produto) return "⚠ Nenhum produto foi informado. Digite o nome corretamente.";

    // Se a mensagem for apenas "tela", "incell", "original" ou "nacional", retorna erro
    const termosInvalidos = ["preta", "tela", "incell", "incel", "original", "orig", "nacional", "nac", "com aro"];
    const preposicoes = ["do", "da", "de", "tela", "samsung", "motorola", "display", "combo", "frontal", "xiaomi"];
    const normalizar = (str) =>
        str
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
            .replace(/\s+/g, ' ') // múltiplos espaços => 1 espaço
            .trim();

    const removerEspacos = (str) => str.replace(/\s+/g, '');

const removerPreposicoes = (str) => {
    return str
        .split(' ')
        .filter(palavra => !preposicoes.includes(palavra))
        .join(' ')
        .trim();
};

    const nomeNormalizado = removerPreposicoes(normalizar(produto));
    const nomeSemEspacos = removerEspacos(nomeNormalizado);

    if (termosInvalidos.includes(nomeNormalizado)) {
        return "❌ Digite o nome completo do produto.";
    }

    const item = data.find(row => {
        if (!row.Produto) return false;

        const nomeProduto = normalizar(row.Produto);
        const nomeProdutoSemEspacos = removerEspacos(nomeProduto);

        return (
            nomeProduto === nomeNormalizado ||
            nomeProdutoSemEspacos === nomeSemEspacos ||
            nomeProduto.includes(nomeNormalizado) ||
            nomeProdutoSemEspacos.includes(nomeSemEspacos)
        );
    });

    if (!item) {
        return "❌ Produto não encontrado.\n\nPara atendimento digite 2️⃣";
	}
	ultimoProdutoConsultado.set(chatId, item);
	
	setTimeout(() => {
    ultimoProdutoConsultado.delete(chatId);
	}, 30 * 60 * 1000);

    return `💰 O preço de *${item.Produto}* é *R$ ${item.Preco}* \n\nPara fazer pedido digite 2️⃣\nVisualizar foto do produto digite 3️⃣`;
};

const horarioAtendimento = {
    inicio: 8,        // 09:00
    fim: 8,          // 18:00
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
            "📞", "💰", "⏳", "❌", "Olá!", "Digite o nome do produto",
            "Como posso te ajudar?", "Para fazer pedido digite 2️⃣", "Digite a opção", "⚠ Nenhum produto"
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
			await client.sendMessage(chatId, "⏳ Prezados clientes, informamos no dia de hoje 27/07 nossa loja não abrirá devido à mudança de endereço. Retomaremos o atendimento normalmente no novo endereço terça-feira dia 28/07.\n\n Agradecemos pela sua compreensão! 😊\n\n Atenciosamente,\n Coutech Cell");
		}
        return;
    }

    if (msg === "consultar valor") {
        atendimentoHumano.delete(chatId);
        await client.sendMessage(chatId, "Digite o nome do produto para consultar o valor.\nExemplos:\n A12 com aro\n G20 sem aro\n k41s com aro\n iPhone 8 plus\n iPhone 12 incell\n iPhone 12 original\n Redmi 12c com aro\n Redmi Note 8 sem aro");
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
    const respostaPossivel = buscarPreco(msg, chatId);

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

		// Lógica para responder às opções "1" e "2"
    if (msg === "2") {
        if (estaDentroDoHorario()) {
        atendimentoHumano.add(chatId);
        await client.sendMessage(chatId, "📞 Você será atendido em breve. Aguarde...");
		removerAtendimentoHumano(chatId);
        removerClientesAtendidos(chatId);
		
      } else {
        await client.sendMessage(chatId, "⏳ Prezados clientes, informamos no dia de hoje 27/07 nossa loja não abrirá devido à mudança de endereço. Retomaremos o atendimento normalmente no novo endereço terça-feira dia 28/07.\n\n Agradecemos pela sua compreensão! 😊\n\n Atenciosamente,\n Coutech Cell");
		}
        return;
    }

	else if (msg === "1") {
    await client.sendMessage(chatId, "Digite o nome do produto para consultar o valor.\nExemplos:\n A12 com aro\n G20 sem aro\n k41s com aro\n iPhone 8 plus\n iPhone 12 incell\n iPhone 12 original\n Redmi 12c com aro\n Redmi Note 8 sem aro");
		   // Remove o cliente da lista de atendimento após 1 minutoo
			removerClientesAtendidos(chatId);
        return;
}		

const respostaPreco = buscarPreco(msg, chatId);

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

client.initialize();

setInterval(async () => {

    try {

        const state = await client.getState();

        if (state !== "CONNECTED") {

            console.log("❌ Estado inválido:", state);
            process.exit(1);

        }

    } catch (err) {

        console.log("Erro ao verificar estado:", err);
        process.exit(1);

    }

}, 60000);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.get("/", (req,res)=>{
res.redirect("/painel")
});
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

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
});