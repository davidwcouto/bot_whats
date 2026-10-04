const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pacote = require.resolve('whatsapp-web.js/package.json');
const versao = require(pacote).version;

if (versao !== '1.34.7') {
    throw new Error(
        'A correção de mídia foi preparada para whatsapp-web.js 1.34.7. ' +
        'Versão encontrada: ' + versao
    );
}

const arquivo = path.join(
    path.dirname(pacote),
    'src',
    'util',
    'Injected',
    'Utils.js'
);

const marcador = '// COUTECH_FIX_MEDIA_ID_1347';

const original = fs.readFileSync(arquivo, 'utf8');

if (original.includes(marcador)) {
    console.log('✅ Correção de mídia já aplicada.');
} else {
    const ponto =
        "        // Bot's won't reply if canonicalUrl is set (linking)";

    if (original.split(ponto).length !== 2) {
        throw new Error(
            'Não foi encontrado um ponto único para aplicar ' +
            'a correção de mídia. Nenhum arquivo foi alterado.'
        );
    }

    const corrigido = original.replace(
        ponto,
        '        ' + marcador + '\n' +
        '        delete message.__x_id;\n\n' +
        ponto
    );

    // Verifica a sintaxe antes de gravar.
    new vm.Script(corrigido, { filename: arquivo });

    fs.writeFileSync(arquivo, corrigido, 'utf8');

    console.log('✅ Correção de mídia aplicada ao whatsapp-web.js.');
}

// Correção do download de fotos no whatsapp-web.js 1.34.7
{
    const arquivoDownload = path.join(
        path.dirname(pacote),
        'src',
        'structures',
        'Message.js'
    );

    const marcadorDownload =
        '// COUTECH_FIX_DOWNLOAD_MIMETYPE_1347';

    const originalDownload = fs.readFileSync(
        arquivoDownload,
        'utf8'
    );

    if (originalDownload.includes(marcadorDownload)) {
        console.log('✅ Correção do download de fotos já aplicada.');
    } else {
        const pontoDownload =
            /(\.downloadManager\.downloadAndMaybeDecrypt\(\{\r?\n)([ \t]*)directPath: msg\.directPath,/g;

        const ocorrencias = [
            ...originalDownload.matchAll(pontoDownload)
        ];

        if (ocorrencias.length !== 1) {
            throw new Error(
                'Não foi encontrado um ponto único para corrigir ' +
                'o download de fotos. Message.js não foi alterado.'
            );
        }

        const corrigidoDownload = originalDownload.replace(
            pontoDownload,
            (_, inicio, espacos) =>
                inicio +
                espacos + marcadorDownload + '\n' +
                espacos + 'mimetype: msg.mimetype,\n' +
                espacos + 'directPath: msg.directPath,'
        );

        new vm.Script(corrigidoDownload, {
            filename: arquivoDownload
        });

        fs.writeFileSync(
            arquivoDownload,
            corrigidoDownload,
            'utf8'
        );

        console.log('✅ Correção do download de fotos aplicada.');
    }
}