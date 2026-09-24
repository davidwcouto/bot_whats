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