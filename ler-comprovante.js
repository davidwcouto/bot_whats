// Executado em processo separado para limitar o tempo da leitura.

function identificarValor(texto) {
    const normalizado = String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    // Não soma automaticamente documentos com sinais de pagamento
    // agendado, cancelado ou não concluído.
    if (
        /\b(agendad[oa]|agendamento|cancelad[oa]|estornad[oa]|pendente)\b/.test(
            normalizado
        ) ||
        /nao (realizad|concluid|efetuad)/.test(normalizado)
    ) {
        return null;
    }

    const linhas = normalizado.split(/\r?\n/);
    const candidatos = new Set();

    function valoresDaLinha(linha) {
        const encontrados = [];

        const expressao =
            /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?!\d)/g;

        for (const match of linha.matchAll(expressao)) {
            const valor =
                Number(match[1].replace(/\./g, '')) * 100 +
                Number(match[2]);

            if (
                Number.isSafeInteger(valor) &&
                valor > 0 &&
                valor <= 999999999
            ) {
                encontrados.push(valor);
            }
        }

        return encontrados;
    }

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];

        // Evita usar saldo bancário, tarifa, limite ou desconto.
        if (/\b(saldo|tarifa|taxa|limite|desconto|juros)\b/.test(linha)) {
            continue;
        }

        const rotulo =
            /\bvalor(?:\s+(?:total|pago|enviado|recebido|transferido))?\b/;

        if (!rotulo.test(linha)) continue;

        let valores = valoresDaLinha(linha);

        // Alguns comprovantes mostram "Valor" e o número abaixo.
        if (!valores.length) {
            for (let j = i + 1; j <= Math.min(i + 2, linhas.length - 1); j++) {
                const proxima = linhas[j].trim();

                if (!proxima) continue;

                if (
                    /^(?:r\$\s*)?[\d.,]+\s*$/.test(proxima)
                ) {
                    valores = valoresDaLinha(proxima);
                }

                break;
            }
        }

        for (const valor of valores) candidatos.add(valor);
    }

    // Não escolhe arbitrariamente entre dois valores diferentes.
    return candidatos.size === 1 ? [...candidatos][0] : null;
}

async function lerImagem(buffer) {
    const sharp = require('sharp');

    const imagem = await sharp(buffer, {
        limitInputPixels: 20000000
    })
        .rotate()
        .resize({
            width: 1800,
            height: 3000,
            fit: 'inside',
            withoutEnlargement: true
        })
        .flatten({ background: '#ffffff' })
        .grayscale()
        .normalise()
        .png()
        .toBuffer();

    const resultado = await require('tesseract.js').recognize(
        imagem,
        'por'
    );

    const confianca = Number(resultado.data?.confidence || 0);
	const valor = identificarValor(resultado.data?.text);

	console.error('[OCR comprovante]', JSON.stringify({
		confianca,
		valorIdentificadoCentavos: valor,
		motivo: confianca < 65
			? 'confianca_baixa'
			: valor === null
				? 'valor_nao_identificado'
				: 'identificado'
	}));

	return confianca >= 65 ? valor : null;
}

async function executar(buffer, tipo) {
    if (tipo !== 'application/pdf') {
        return lerImagem(buffer);
    }

    const { PDFParse } = require('pdf-conferencia');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
        const info = await parser.getInfo();

        // Nesta versão, PDFs com várias páginas exigem valor manual.
        // Isso evita somar páginas repetidas ou ignorar outros comprovantes.
        if (info.total !== 1) return null;

        const resultado = await parser.getText();
        const texto = String(resultado.text || '');

        if (texto.replace(/\s/g, '').length >= 40) {
            return identificarValor(texto);
        }

        const imagens = await parser.getScreenshot({
            partial: [1],
            desiredWidth: 1600,
            imageDataUrl: false,
            imageBuffer: true
        });

        if (!imagens.pages?.[0]?.data) return null;

        return lerImagem(Buffer.from(imagens.pages[0].data));
    } finally {
        await parser.destroy();
    }
}

if (require.main === module) {
    const partes = [];

    process.stdin.on('data', parte => partes.push(parte));

    process.stdin.on('end', async () => {
        try {
            const valor = await executar(
                Buffer.concat(partes),
                process.argv[2]
            );

            process.stdout.write(JSON.stringify({ valor }));
            process.exit(0);
        } catch {
            // Não imprime o conteúdo do comprovante no log.
            process.stdout.write(JSON.stringify({ valor: null }));
            process.exit(0);
        }
    });
}

module.exports = { identificarValor };