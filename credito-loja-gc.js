'use strict';
// Integração de conta a prazo. Não inicia conexão nem envia mensagens ao importar.
const { randomUUID, createHash } = require('node:crypto');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const clone = value => JSON.parse(JSON.stringify(value));
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const br = cents => (cents / 100).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
function cents(value) {
    const s = String(value ?? '').trim();
    assert(/^\d{1,10}(?:[.,]\d{1,2})?$/.test(s), 'Informe um valor sem separador de milhar. Ex.: 1000,50.');
    const [a, b = ''] = s.replace(',', '.').split('.');
    const n = Number(a) * 100 + Number(b.padEnd(2, '0'));
    assert(Number.isSafeInteger(n), 'Valor inválido.');
    return n;
}
function allocate(rows, amount) {
    assert(Number.isSafeInteger(amount) && amount > 0, 'Informe um pagamento positivo.');
    const sorted = [...rows].sort((a,b) => a.due.localeCompare(b.due) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    assert(sorted.reduce((s,r) => s+r.total, 0) >= amount, 'O pagamento supera os recebimentos elegíveis no período consultado.');
    let left = amount;
    return sorted.flatMap(r => {
        if (!left) return [];
        const paid = Math.min(left, r.total); left -= paid;
        return [{...r, paid, remaining:r.total-paid, phase:'prepared'}];
    });
}
function iso(date) {
    const m = String(date || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    assert(m, 'Vencimento inesperado no GestãoClick.');
    const s = `${m[3]}-${m[2]}-${m[1]}`;
    assert(!Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s, 'Data inválida.');
    return s;
}
const signature = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const saleNumber = text => String(text || '').trim().match(/^Venda de n[º°o]\s*(\d+)(?:\s*\(\d+\/\d+\))?$/i)?.[1];
function snapshot(m) {
    const keys = ['id','nome','loja_id','cliente_id','pedido_id','pedido_parcela_id','valor','valor_total','juros','desconto','situacao_id','baixado','forma_pagamento_id','conta_bancaria_id','categoria_id','data_vencimento','data_emissao','tipo','observacoes'];
    return Object.fromEntries(keys.map(k => [k,String(m[k] ?? '')]));
}
function createController(d) {
    const {db, gcApiTela, gcListar, gcValorTelaCentavos:screenCents, gcValorTela:screenValue} = d;
    let ready;
    async function schema() {
        if (!ready) ready = (async () => {
            await db.execute(`CREATE TABLE IF NOT EXISTS conta_gc_operacoes (
                id CHAR(36) PRIMARY KEY, cliente_local BIGINT NOT NULL, loja VARCHAR(40) NOT NULL,
                ativo_cliente VARCHAR(100) NULL UNIQUE, status VARCHAR(30) NOT NULL,
                dados LONGTEXT NOT NULL, erro TEXT NULL, whatsapp VARCHAR(30) NOT NULL DEFAULT 'pendente',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB`);
			
			await db.execute(`
				CREATE TABLE IF NOT EXISTS conta_gc_clientes (
					loja_id VARCHAR(40) NOT NULL,
					cliente_local BIGINT NOT NULL,
					cliente_gc VARCHAR(40) NOT NULL,
					nome_gc VARCHAR(255) NOT NULL,
					venda_referencia VARCHAR(40) NOT NULL,
					criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

					PRIMARY KEY (loja_id, cliente_local),

					UNIQUE KEY cliente_gc_unico (
						loja_id,
						cliente_gc
					)
				) ENGINE=InnoDB
			`);
        })().catch(e => {ready = null; throw e;});
        return ready;	
    }
    async function config(local) {
        const e = process.env;
        const names = ['GESTAOCLICK_LOJA_ID','GESTAOCLICK_FORMA_PIX_ID','GESTAOCLICK_FORMA_DINHEIRO_ID',
            'GESTAOCLICK_CONTA_BANCARIA_ID','GESTAOCLICK_SITUACAO_CREDITO_LOJA_ID',
            'GESTAOCLICK_FORMA_CREDITO_LOJA_ID',
			'GESTAOCLICK_SITUACAO_CONFIRMADO_ID',
			'GESTAOCLICK_SITUACAO_ABERTO_ID',
			'GESTAOCLICK_FORMA_DINHEIRO_PIX_ID'];
        const cfg = {};
        for (const name of names) {
            assert(/^\d+$/.test(e[name] || ''), 'Configure '+name+'.');
            cfg[name.replace('GESTAOCLICK_','')] = e[name];
        }
        assert(cfg.SITUACAO_CREDITO_LOJA_ID !== cfg.SITUACAO_CONFIRMADO_ID, 'As situações de crédito e confirmado devem ser diferentes.');
        await schema();

		const [vinculos] = await db.execute(`
			SELECT cliente_gc
			FROM conta_gc_clientes
			WHERE loja_id = ?
			  AND cliente_local = ?
		`, [cfg.LOJA_ID, local]);

		cfg.client = String(vinculos[0]?.cliente_gc || '');

		assert(
			/^\d+$/.test(cfg.client),
			'Cliente sem vínculo. Volte ao extrato e clique em Registrar pagamento para vinculá-lo.'
		);
        cfg.from = e.GESTAOCLICK_CREDITO_DATA_INICIO;
        assert(/^\d{4}-\d{2}-\d{2}$/.test(cfg.from || ''), 'Configure GESTAOCLICK_CREDITO_DATA_INICIO (AAAA-MM-DD).');
        cfg.to = `${Number(d.todayISO().slice(0,4)) + 1}-12-31`;
        assert(cfg.from <= cfg.to, 'Período de consulta inválido.');
        return cfg;
    }
    async function localInfo(id, connection = db, lock = false) {
        const [rows] = await connection.execute('SELECT id,nome,telefone,ativo FROM clientes_conta_prazo WHERE id = ?' + (lock ? ' FOR UPDATE' : ''), [id]);
        assert(rows.length === 1 && Number(rows[0].ativo) === 1, 'Cliente inexistente ou inativo.');
        const [s] = await connection.execute('SELECT COALESCE(SUM(valor),0) saldo FROM movimentacoes_conta_prazo WHERE cliente_id = ?', [id]);
        return {...rows[0], balance:Math.round(Number(s[0].saldo)*100)};
    }
    async function list(cfg) {
        const rows = await gcListar('/recebimentos', {loja_id:cfg.LOJA_ID, cliente_id:cfg.client, data_inicio:cfg.from, data_fim:cfg.to});
        // Nunca confiar apenas no filtro aplicado pelo serviço.
        assert(Array.isArray(rows), 'Listagem inválida.');
        return rows.filter(r => String(r.loja_id) === cfg.LOJA_ID && String(r.cliente_id) === cfg.client);
    }
    async function read(id) {
        const response = await gcApiTela('GET', String(id));
        let record = response.data?.['request.data'];
        if (typeof record === 'string') record = JSON.parse(record);
        assert(record?.MovimentacoesFinanceira && String(record.MovimentacoesFinanceira.id) === String(id), 'Dados de edição inválidos.');
        return clone(record);
    }
    function validateIdentity(m, cfg, original) {
        assert(String(m.loja_id) === cfg.LOJA_ID && String(m.cliente_id) === cfg.client && String(m.tipo) === 'C', 'Cliente, loja ou tipo divergente.');
        assert(String(m.conta_bancaria_id) === cfg.CONTA_BANCARIA_ID, 'Conta bancária divergente.');
        assert(screenCents(m.juros) === 0 && screenCents(m.desconto) === 0 && screenCents(m.valor) === screenCents(m.valor_total), 'Lançamento com ajustes exige conferência manual.');
        if (original) {
            for (const k of ['pedido_id','categoria_id','data_emissao']) assert(String(m[k]) === String(original[k]), 'Vínculo alterado: '+k+'.');
            assert(saleNumber(m.nome) === saleNumber(original.nome), 'Referência da venda alterada.');
        }
    }
    const publicSnapshot = r => [String(r.id),String(r.valor),String(r.valor_total),String(r.liquidado),String(r.forma_pagamento_id),String(r.conta_bancaria_id),String(r.data_vencimento)];
    async function plan(local, amount, form, note) {
        const cfg = await config(local.id);
		const formas = {
    Pix: cfg.FORMA_PIX_ID,
    Dinheiro: cfg.FORMA_DINHEIRO_ID,
    'Devolução de Mercadorias': String(
        process.env.GESTAOCLICK_FORMA_DEVOLUCAO_ID || ''
    ).trim()
};

assert(
    Object.prototype.hasOwnProperty.call(formas, form),
    'Forma de pagamento inválida.'
);

const formId = formas[form];

assert(
    /^\d+$/.test(formId || ''),
    'Configure GESTAOCLICK_FORMA_DEVOLUCAO_ID no Railway com o ID desta loja.'
);

if (form === 'Devolução de Mercadorias') {
    assert(
        String(note || '').trim().length > 0,
        'Informe as peças devolvidas e o motivo na observação.'
    );
}
        assert(amount > 0 && amount <= local.balance, 'Valor maior que o saldo local ou inválido.');
        const all = await list(cfg), eligible = [];
        for (const r of all) {
			// Considera somente recebimentos ainda não baixados.
			if (String(r.liquidado) !== '0') {
				continue;
			}

			// Formas que podem participar do abatimento.
			const formasPermitidas = [
				cfg.FORMA_CREDITO_LOJA_ID,
				cfg.FORMA_DINHEIRO_PIX_ID
			];

			if (
				!formasPermitidas.includes(
					String(r.forma_pagamento_id)
				)
			) {
				continue;
			}

			// Confere os dados atuais na edição do recebimento.
			const record = await read(r.id);
			const m = record.MovimentacoesFinanceira;

			validateIdentity(m, cfg);

			const formaAtual = String(m.forma_pagamento_id);
			const situacaoAtual = String(m.situacao_id);

			// Crédito Loja: aceita Crédito Loja ou Em aberto.
			const creditoLoja =
				formaAtual === cfg.FORMA_CREDITO_LOJA_ID &&
				[
					cfg.SITUACAO_CREDITO_LOJA_ID,
					cfg.SITUACAO_ABERTO_ID
				].includes(situacaoAtual);

			// Dinheiro/Pix: aceita Em aberto ou Crédito Loja.
			const dinheiroPixAberto =
				formaAtual === cfg.FORMA_DINHEIRO_PIX_ID &&
				[
					cfg.SITUACAO_ABERTO_ID,
					cfg.SITUACAO_CREDITO_LOJA_ID
				].includes(situacaoAtual);

			if (!creditoLoja && !dinheiroPixAberto) {
				continue;
			}

			assert(
				String(m.baixado) === '0',
				'A listagem mudou durante a consulta. Atualize.'
			);
			const code = saleNumber(m.nome);
            assert(code && /^\d+$/.test(String(m.pedido_id)), 'Recebimento sem vínculo de venda reconhecido.');
            const parts = record.MovimentacoesFinanceirasParcela;
            assert(parts == null || (Array.isArray(parts) && !parts.filter(Boolean).length), 'Há parcelamento dentro da edição do recebimento. Confira manualmente.');
            const total = screenCents(m.valor_total);
            assert(total === cents(r.valor_total), 'Valor mudou durante a consulta.');
            if (total <= 0) continue;
            eligible.push({id:String(r.id), code, total, due:iso(m.data_vencimento), original:snapshot(m),
                fingerprint:signature(snapshot(m)), backup:record,
                before:all.filter(x=>saleNumber(x.descricao)===code).map(publicSnapshot)});
        }
        const steps = allocate(eligible,amount);
        assert(new Set(steps.map(x=>x.code)).size === steps.length, 'Esta prévia contém dois recebimentos abertos da mesma venda. Confira manualmente antes de prosseguir.');
        return {cfg,local:{id:String(local.id),name:local.nome,balance:local.balance},amount,form,note,
            formId,
            eligibleTotal:eligible.reduce((s,r)=>s+r.total,0), steps, date:d.todayISO().split('-').reverse().join('/')};
    }
    async function load(id) {
        assert(/^[a-f0-9-]{36}$/.test(String(id)), 'Operação inválida.');
        const [rows] = await db.execute('SELECT * FROM conta_gc_operacoes WHERE id = ?', [id]);
        assert(rows.length === 1, 'Operação não encontrada.');
        return {...rows[0],plan:typeof rows[0].dados === 'string' ? JSON.parse(rows[0].dados) : rows[0].dados};
    }
    async function save(op, status) {
        await db.execute('UPDATE conta_gc_operacoes SET dados = ?, status = ? WHERE id = ?', [JSON.stringify(op.plan),status,op.id]);
        op.status = status;
    }
    function page(res,title,body,status=200) {
        return res.status(status).send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><style>body{font:17px Arial;background:#f2f4f7;margin:0;padding:24px}main{max-width:1000px;margin:auto;background:white;padding:24px;border-radius:12px}table{border-collapse:collapse;width:100%}td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd}button,a{display:inline-block;margin:10px 10px 0 0}button{padding:12px;background:#15803d;color:white;border:0;border-radius:5px;cursor:pointer}.warn{background:#fff3cd;padding:15px}.scroll{overflow:auto}</style><main><h1>${html(title)}</h1>${body}</main></html>`);
    }
    function render(res,op) {
        const p=op.plan;
        if(op.status==='completed') return page(res,'Pagamento registrado',`<p>R$ ${br(p.amount)} em ${html(p.form)} registrado na pagina Financeiro e também no GestãoClick.</p><p>WhatsApp: ${html(op.whatsapp)}.</p><a href="/financeiro/extrato/${Number(p.local.id)}">Voltar ao extrato</a>`);
        const started=op.status!=='preview';
        return page(res,started?'Conferir operação em andamento':'Conferir pagamento',`<p>Cliente: <b>${html(p.local.name)}</b> · Loja: ${html(p.cfg.LOJA_ID)}</p><p>Pagamento: <b>R$ ${br(p.amount)} em ${html(p.form)}</b></p><p>Saldo na pagina Financeiro: R$ ${br(p.local.balance)}. Saldo em aberto no GestãoClick: R$ ${br(p.eligibleTotal)}.</p>${p.local.balance!==p.eligibleTotal?'<p class="warn">Os saldos dos dois sistemas são diferentes. Confira os pedidos abaixo antes de confirmar. Os registros antigos não serão ajustados automaticamente.</p>':''}<div class="scroll"><table><tr><th>Venda</th><th>Recebimento</th><th>Total</th><th>Baixar</th><th>Saldo Crédito Loja</th></tr>${p.steps.map(s=>`<tr><td>${html(s.code)}</td><td>${html(s.id)}</td><td>${br(s.total)}</td><td>${br(s.paid)}</td><td>${br(s.remaining)}</td></tr>`).join('')}</table></div>${op.erro?`<p class="warn">${html(op.erro)}. Pode haver baixas já concluídas. Não registre outro pagamento para substituir esta operação.</p>`:''}<form method="post" action="/financeiro/credito-gc/${op.id}/confirmar">${d.csrfEntregaCampo()}<label><input type="checkbox" name="conferido" value="1" required> Conferi cliente, loja, pedidos e valor.</label><br><button>${started?'Verificar e continuar esta operação':'Confirmar pagamento nos dois sistemas'}</button></form><a href="/financeiro/extrato/${Number(p.local.id)}">Voltar ao extrato</a><p> ${started?'Uma solicitação com resultado incerto será consultada, sem repetir a baixa.': ''}</p>`);
    }
    function makeBody(p,s,record) {
        const body=clone(record), m=body.MovimentacoesFinanceira;
if (!s.remaining) Object.assign(m, {
    forma_pagamento_id: p.formId,
    nome_forma_pagamento: p.form,
    situacao_id: p.cfg.SITUACAO_CONFIRMADO_ID,
    baixado: '1',
    data_baixa: p.date,
    conta_bancaria_id: p.cfg.CONTA_BANCARIA_ID,
    observacoes: [
        String(m.observacoes || '').trim(),
        String(p.note || '').trim()
    ].filter(Boolean).join('\n')
});
        else {
            Object.assign(m,{ocorrencia:'P',tipo_parcela:'D',repeticao:'M',quantidade:'2',data_primeira_parcela:p.date,intervalo_dias:''});
            body.MovimentacoesFinanceirasParcela=[true,false].map((paid,i)=>({
                chave:0.731231+i/1000000,data_vencimento:paid?p.date:m.data_vencimento,
                valor:screenValue(paid?s.paid:s.remaining),forma_pagamento_id:paid?p.formId:p.cfg.FORMA_CREDITO_LOJA_ID,
                nome_forma_pagamento:paid?p.form:'Crédito Loja',conta_bancaria_id:p.cfg.CONTA_BANCARIA_ID,
                nome_conta_bancaria:m.nome_conta_bancaria,situacao_id:paid?p.cfg.SITUACAO_CONFIRMADO_ID:p.cfg.SITUACAO_CREDITO_LOJA_ID,
                baixado:paid?1:0,observacoes:paid?p.note:'Saldo restante. Ainda não recebido.'}));
        }
        return {data:body};
    }
    async function verify(p,s) {
        let records;
        if (!s.remaining) records=[await read(s.id)];
        else {
            const rows=(await list(p.cfg)).filter(r=>saleNumber(r.descricao)===s.code);
            const oldOthers=s.before.filter(r=>r[0]!==s.id);
            for(const old of oldOthers) {
                const now=rows.find(r=>String(r.id)===old[0]);
                assert(now && signature(publicSnapshot(now))===signature(old), 'Outro recebimento desta venda mudou. Confira manualmente.');
            }
            const others=new Set(oldOthers.map(x=>x[0]));
            const targets=rows.filter(r=>!others.has(String(r.id)));
            assert(targets.length===2, 'Não foi possível identificar exatamente as duas parcelas. Apenas consulte novamente; a baixa não será repetida.');
            records=[];
            for(const r of targets) records.push(await read(r.id));
        }
        for(const record of records) validateIdentity(record.MovimentacoesFinanceira,p.cfg,s.original);
        const paid=records.filter(r=>{
            const m=r.MovimentacoesFinanceira;
            return String(m.baixado)==='1' && String(m.situacao_id)===p.cfg.SITUACAO_CONFIRMADO_ID &&
                String(m.forma_pagamento_id)===p.formId && screenCents(m.valor_total)===s.paid;
        });
        assert(paid.length===1, 'Baixa ainda não comprovada. Nenhuma repetição automática será feita.');
        if(!s.remaining) return {paidId:String(paid[0].MovimentacoesFinanceira.id)};
        const balances=records.filter(r=>{
            const m=r.MovimentacoesFinanceira;
            return String(m.baixado)==='0' && String(m.forma_pagamento_id)===p.cfg.FORMA_CREDITO_LOJA_ID &&
                screenCents(m.valor_total)===s.remaining && m.data_vencimento===s.original.data_vencimento;
        });
        assert(balances.length===1, 'Saldo restante não corresponde ao esperado.');
        return {paidId:String(paid[0].MovimentacoesFinanceira.id), balance:balances[0]};
    }
    async function execute(op,conn) {
        const p=op.plan;
		const configuracaoAtual = await config(p.local.id);

		assert(
			signature(configuracaoAtual) === signature(p.cfg),
			'Configuração mudou desde a prévia. Confira esta operação antes de continuar.'
		);        if(op.status==='preview') {
            const current=await localInfo(p.local.id,conn);
            assert(current.balance===p.local.balance, 'Saldo local mudou. Faça uma nova prévia.');
            // Reserva persistente: mesmo após reiniciar o bot só esta operação pode continuar.
            await conn.execute('UPDATE conta_gc_operacoes SET ativo_cliente = ?, status = ? WHERE id = ?', [`${p.cfg.LOJA_ID}:${p.local.id}`,'executing',op.id]);
            op.status='executing';
        }
        for(const s of p.steps) {
            if(s.phase==='verified') continue;
            if(s.phase==='prepared') {
                const record=await read(s.id);
                assert(signature(snapshot(record.MovimentacoesFinanceira))===s.fingerprint, 'Recebimento mudou desde a prévia. Confira manualmente.');
                // Backup e fase gravados ANTES do POST. Uma queda depois daqui não permite reenviar.
                s.phase='sending'; await save(op,'executing');
                await gcApiTela('POST',s.id,makeBody(p,s,record));
            }
            const result=await verify(p,s);
            s.paidId=result.paidId;
            if(result.balance) {
                const m=result.balance.MovimentacoesFinanceira;
                s.balanceId=String(m.id);
                if(String(m.situacao_id)!==p.cfg.SITUACAO_CREDITO_LOJA_ID) {
                    assert(s.phase!=='correcting','A correção do saldo está sem confirmação. Confira a situação no GestãoClick; não será reenviada.');
                    s.phase='correcting'; await save(op,'executing');
                    m.situacao_id=p.cfg.SITUACAO_CREDITO_LOJA_ID;
                    await gcApiTela('POST',s.balanceId,{data:result.balance});
                }
                const check=await verify(p,s);
                assert(String(check.balance.MovimentacoesFinanceira.situacao_id)===p.cfg.SITUACAO_CREDITO_LOJA_ID,'Saldo restante ainda não está como Crédito Loja.');
            }
            s.phase='verified'; await save(op,'executing');
        }
        // Reconfere todas as baixas antes do único lançamento local.
        for(const s of p.steps) {
            const result=await verify(p,s);
            if(result.balance) assert(String(result.balance.MovimentacoesFinanceira.situacao_id)===p.cfg.SITUACAO_CREDITO_LOJA_ID,'Situação do saldo restante mudou.');
        }
        await conn.beginTransaction();
        try {
            const [rows]=await conn.execute('SELECT status FROM conta_gc_operacoes WHERE id = ? FOR UPDATE',[op.id]);
            if(rows[0].status==='completed') {await conn.commit();return;}
            const local=await localInfo(p.local.id,conn,true);
            assert(local.balance>=p.amount,'Saldo local insuficiente após as baixas externas. Requer conciliação; não repita o pagamento.');
            const [insert]=await conn.execute(`INSERT INTO movimentacoes_conta_prazo
                (cliente_id,tipo,pedido,valor,forma,observacao,operador)
                VALUES (?,'PAGAMENTO',NULL,?,?,?,?)`,[p.local.id,(-p.amount/100).toFixed(2),p.form,p.note,'Painel Railway']);
            p.movementId=String(insert.insertId); p.newBalance=local.balance-p.amount;
            await conn.execute("UPDATE conta_gc_operacoes SET status='completed',ativo_cliente=NULL,dados=?,erro=NULL WHERE id=?",[JSON.stringify(p),op.id]);
            await conn.commit(); op.status='completed';
        } catch(e) {await conn.rollback();throw e;}
    }
    async function notify(op) {
        const [result]=await db.execute("UPDATE conta_gc_operacoes SET whatsapp='enviando' WHERE id=? AND status='completed' AND whatsapp='pendente'",[op.id]);
        if(!result.affectedRows) return;
        try {
            const l=await localInfo(op.plan.local.id);
            await d.enviarSaldoWhatsApp({telefone:l.telefone,cliente:l.nome,valorPagamento:br(op.plan.amount),formaPagamento:op.plan.form,saldo:br(op.plan.newBalance),observacao:op.plan.note});
            await db.execute("UPDATE conta_gc_operacoes SET whatsapp='Enviado' WHERE id=?",[op.id]);
        } catch {
            await db.execute("UPDATE conta_gc_operacoes SET whatsapp='Falhou; conferir' WHERE id=?",[op.id]);
        }
    }
	
	function lojaDoVinculo() {
    const loja = String(
        process.env.GESTAOCLICK_LOJA_ID || ''
    ).trim();

    assert(
        /^\d+$/.test(loja),
        'Configure GESTAOCLICK_LOJA_ID.'
    );

    return loja;
}

async function consultarVendaParaVinculo(codigo, loja) {
    assert(
        /^\d+$/.test(codigo),
        'Informe somente o número da venda.'
    );

    const vendas = (
        await gcListar('/vendas', {
            codigo,
            loja_id: loja,
            tipo: 'vendas_balcao'
        })
    ).filter(venda =>
        String(venda.codigo) === codigo
    );

    assert(
        vendas.length === 1,
        'Venda não encontrada ou resultado ambíguo.'
    );

    const venda = vendas[0];

    assert(
        /^\d+$/.test(String(venda.id || '')) &&
        /^\d+$/.test(String(venda.cliente_id || '')) &&
        String(venda.nome_cliente || '').trim(),
        'A venda não retornou um cliente válido.'
    );

    if (venda.loja_id) {
        assert(
            String(venda.loja_id) === loja,
            'Essa venda pertence a outra loja.'
        );
    } else {
        // Algumas consultas de venda não retornam loja_id.
        // Nesse caso, confirmamos a loja pelo recebimento.
        const dataVenda = String(venda.data || '').slice(0, 10);

        assert(
            /^\d{4}-\d{2}-\d{2}$/.test(dataVenda),
            'Não foi possível identificar a data da venda.'
        );

        const ano = Number(dataVenda.slice(0, 4));
        const anoAtual = Number(d.todayISO().slice(0, 4));

        const recebimentos = await gcListar('/recebimentos', {
            loja_id: loja,
            cliente_id: String(venda.cliente_id),
            data_inicio: `${Math.min(ano, anoAtual)}-01-01`,
            data_fim: `${Math.max(ano, anoAtual) + 1}-12-31`
        });

        const candidatos = recebimentos.filter(r =>
            String(r.loja_id) === loja &&
            String(r.cliente_id) === String(venda.cliente_id) &&
            saleNumber(r.descricao) === codigo
        );

        let lojaConfirmada = false;

        for (const recebimento of candidatos) {
            const registro = await read(String(recebimento.id));
            const m = registro.MovimentacoesFinanceira;

            if (
                String(m.loja_id) === loja &&
                String(m.cliente_id) === String(venda.cliente_id) &&
                String(m.pedido_id) === String(venda.id) &&
                String(m.tipo) === 'C'
            ) {
                lojaConfirmada = true;
                break;
            }
        }

        assert(
            lojaConfirmada,
            'Não foi possível confirmar a loja dessa venda. Tente outra venda do mesmo cliente.'
        );
    }

    return venda;
}

async function exigirVinculo(req, res, next) {
    try {
        await schema();

        const clienteId = String(req.params.id || '');

        assert(
            /^\d+$/.test(clienteId),
            'Cliente inválido.'
        );

        await localInfo(clienteId);

        const loja = lojaDoVinculo();

        const [vinculos] = await db.execute(`
            SELECT cliente_gc
            FROM conta_gc_clientes
            WHERE loja_id = ?
              AND cliente_local = ?
        `, [loja, clienteId]);

        if (vinculos.length) {
            return next();
        }

        return res.redirect(
            303,
            '/financeiro/vinculo-gc/' + clienteId
        );
    } catch (erro) {
        return failure(res, erro);
    }
}

async function vincularCliente(req, res) {
    try {
        await schema();

        const clienteId = String(req.params.id || '');

        assert(
            /^\d+$/.test(clienteId),
            'Cliente inválido.'
        );

        const cliente = await localInfo(clienteId);
        const loja = lojaDoVinculo();

        const [existentes] = await db.execute(`
            SELECT cliente_gc
            FROM conta_gc_clientes
            WHERE loja_id = ?
              AND cliente_local = ?
        `, [loja, clienteId]);

        if (existentes.length) {
            return res.redirect(
                303,
                '/financeiro/pagamento/' + clienteId
            );
        }

        const acao = req.method === 'POST'
            ? String(req.body.acao || '')
            : '';

        const codigo = String(
            req.body?.pedido || ''
        ).trim();

        let venda = null;

        if (acao) {
            assert(
                ['consultar', 'salvar'].includes(acao),
                'Ação inválida.'
            );

            // Consulta novamente ao salvar: não confia no ID
            // de cliente enviado pelo navegador.
            venda = await consultarVendaParaVinculo(
                codigo,
                loja
            );
        }

        if (acao === 'salvar') {
            assert(
                req.body.conferido === '1',
                'Confirme que os dois cadastros são da mesma pessoa ou empresa.'
            );

            assert(
                String(req.body.cliente_gc) ===
                    String(venda.cliente_id) &&
                String(req.body.venda_id) ===
                    String(venda.id),
                'Os dados da venda mudaram. Consulte novamente.'
            );

            const [operacoes] = await db.execute(`
                SELECT id
                FROM conta_gc_operacoes
                WHERE cliente_local = ?
                  AND ativo_cliente IS NOT NULL
                LIMIT 1
            `, [clienteId]);

            assert(
                operacoes.length === 0,
                'Existe uma operação de pagamento pendente para este cliente. Confira-a antes de criar o vínculo.'
            );

            try {
                await db.execute(`
                    INSERT INTO conta_gc_clientes (
                        loja_id,
                        cliente_local,
                        cliente_gc,
                        nome_gc,
                        venda_referencia
                    )
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    loja,
                    clienteId,
                    String(venda.cliente_id),
                    String(venda.nome_cliente),
                    codigo
                ]);
            } catch (erro) {
                if (erro.code !== 'ER_DUP_ENTRY') {
                    throw erro;
                }

                // Trata também dois cliques simultâneos.
                const [atual] = await db.execute(`
                    SELECT cliente_gc
                    FROM conta_gc_clientes
                    WHERE loja_id = ?
                      AND cliente_local = ?
                `, [loja, clienteId]);

                assert(
                    atual.length === 1 &&
                    String(atual[0].cliente_gc) ===
                        String(venda.cliente_id),
                    'Este cadastro já possui outro vínculo ou o cliente do GestãoClick já está vinculado a outro cadastro local.'
                );
            }

            return res.redirect(
                303,
                '/financeiro/pagamento/' + clienteId
            );
        }

        return page(
            res,
            'Vincular cliente ao GestãoClick',
            `
                <p>
                    Cliente no bot:
                    <strong>${html(cliente.nome)}</strong>
                </p>

                <p>
                    Telefone:
                    ${html(cliente.telefone)}
                </p>

                <p>
                    Informe uma venda desse cliente
                    na loja ${html(loja)}.
                </p>

                <form
                    method="post"
                    action="/financeiro/vinculo-gc/${clienteId}"
                >
                    ${d.csrfEntregaCampo()}

                    <input
                        type="hidden"
                        name="acao"
                        value="consultar"
                    >

                    <label>Número da venda</label>

                    <input
                        type="text"
                        name="pedido"
                        inputmode="numeric"
                        pattern="[0-9]+"
                        value="${html(codigo)}"
                        required
                    >

                    <button type="submit">
                        Consultar venda
                    </button>
                </form>

                ${venda ? `
                    <hr>

                    <h2>Confira o cliente encontrado</h2>

                    <p>
                        Venda:
                        <strong>${html(venda.codigo)}</strong>
                    </p>

                    <p>
                        Cliente no GestãoClick:
                        <strong>
                            ${html(venda.nome_cliente)}
                        </strong>
                    </p>

                    <p>
                        Loja:
                        ${html(venda.nome_loja || loja)}
                    </p>

                    <form
                        method="post"
                        action="/financeiro/vinculo-gc/${clienteId}"
                    >
                        ${d.csrfEntregaCampo()}

                        <input
                            type="hidden"
                            name="acao"
                            value="salvar"
                        >

                        <input
                            type="hidden"
                            name="pedido"
                            value="${html(codigo)}"
                        >

                        <input
                            type="hidden"
                            name="cliente_gc"
                            value="${html(venda.cliente_id)}"
                        >

                        <input
                            type="hidden"
                            name="venda_id"
                            value="${html(venda.id)}"
                        >

                        <label>
                            <input
                                type="checkbox"
                                name="conferido"
                                value="1"
                                required
                            >
                            Conferi: os dois cadastros são
                            da mesma pessoa ou empresa.
                        </label>

                        <br>

                        <button type="submit">
                            Confirmar vínculo
                        </button>
                    </form>
                ` : ''}

                <p>
                    Esta etapa apenas vincula os cadastros.
                    Nenhum pagamento será registrado.
                </p>

                <a href="/financeiro/extrato/${clienteId}">
                    Voltar ao extrato
                </a>
            `
        );
    } catch (erro) {
        return failure(res, erro);
    }
}
    const failure=(res,e)=>page(res,'Pagamento não concluído',`<p>${html(e.message)}</p><a href="/financeiro">Voltar ao financeiro</a>`,409);
    return {
		exigirVinculo,
		vincularCliente,

		async preview(req,res,next) {
            try {
                await schema();
                const id=String(req.body.cliente_id || '');
                assert(/^\d+$/.test(id),'Cliente inválido.');
                const [active]=await db.execute("SELECT id FROM conta_gc_operacoes WHERE cliente_local=? AND ativo_cliente IS NOT NULL",[id]);
                if(active.length) return res.redirect(303,'/financeiro/credito-gc/'+active[0].id);
				const forma = String(req.body.forma || '').trim();
				const observacao = String(req.body.observacao || '').trim();

				assert(
					['Pix', 'Dinheiro', 'Devolução de Mercadorias'].includes(forma),
					'Forma de pagamento inválida.'
				);

				if (forma === 'Devolução de Mercadorias') {
					assert(
						observacao.length > 0,
						'Informe as peças devolvidas e o motivo na observação.'
					);
				}

				const local = await localInfo(id);

				const p = await plan(
					local,
					cents(req.body.valor),
					forma,
					observacao || 'Pagamento parcial'
				);
                const opId=randomUUID();
                await db.execute("INSERT INTO conta_gc_operacoes (id,cliente_local,loja,status,dados) VALUES (?,?,?,'preview',?)",[opId,id,p.cfg.LOJA_ID,JSON.stringify(p)]);
                return res.redirect(303,'/financeiro/credito-gc/'+opId);
            }catch(e){return failure(res,e);}
        },
        async view(req,res) {
            try {await schema();const op=await load(req.params.id);return render(res,op);}catch(e){return failure(res,e);}
        },
        async confirm(req,res) {
            let conn,lock,op,locked=false;
            try {
                await schema();
                assert(req.body.conferido==='1','Confira os dados antes de confirmar.');
                op=await load(req.params.id);
                conn=await db.getConnection();
                lock='conta_gc_'+signature(`${op.loja}:${op.cliente_local}`).slice(0,40);
                const [rows]=await conn.execute('SELECT GET_LOCK(?,0) acquired',[lock]);
                assert(Number(rows[0].acquired)===1,'Este cliente já está sendo processado. Aguarde e consulte esta operação.');
                locked=true;
                op=await load(op.id);
                if(op.status!=='completed') await execute(op,conn);
                await notify(op);
                return res.redirect(303,'/financeiro/credito-gc/'+op.id);
            }catch(e){
                if(locked && op && op.status!=='preview' && op.status!=='completed') {
                    await db.execute("UPDATE conta_gc_operacoes SET status='review',erro=? WHERE id=? AND status<>'completed'",[e.message,op.id]);
                    return res.redirect(303,'/financeiro/credito-gc/'+op.id);
                }
                return failure(res,e);
            }finally{
                if(conn){if(lock)try{await conn.execute('SELECT RELEASE_LOCK(?)',[lock]);}catch{}conn.release();}
            }
        }
    };
}
module.exports={createController,allocate,cents,iso,snapshot};
