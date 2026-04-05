const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

// Configurações da GhostsPay do usuário
const SECRET_KEY = 'sk_live_YflKFvyFkCZFRfLnyBSPeaIg0dACygEcQXUDcmW3W2t5UjNE';
const COMPANY_ID = '6ef93785-724c-4569-b78f-f97a24a25c13';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Gerador de e-mail aleatório "válido"
function generateEmail(name) {
    const cleanName = (name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const domains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${cleanName}${randomNum}@${domain}`;
}

app.post('/api/create-pix', async (req, res) => {
    try {
        console.log('[API] Corpo recebido:', JSON.stringify(req.body, null, 2));

        // Normalização dos campos (o frontend pode enviar nomes diferentes)
        const name = req.body.customerName || req.body.name || req.body.nome || req.body.customer?.name || 'Cliente';
        const cpf = req.body.customerCPF || req.body.cpf || req.body.document || req.body.customer?.document?.number || '000.000.000-00';
        const phone = req.body.phone || req.body.telefone || req.body.whatsapp || req.body.customer?.phone || '00000000000';
        const amount = req.body.amount || req.body.value || req.body.valor || 20;
        
        console.log(`[API] Processando Pix: ${name} | Valor: ${amount}`);

        // Formatação dos dados para a GhostsPay
        const cleanCpf = (cpf || '').toString().replace(/\D/g, '');
        let cleanPhone = (phone || '').toString().replace(/\D/g, '');
        if (cleanPhone.length <= 11 && cleanPhone.length > 0) cleanPhone = '55' + cleanPhone; 

        const email = generateEmail(name);
        
        // Conversão de valor para centavos (GhostsPay V2 usa centavos)
        let amountInCents = 0;
        if (typeof amount === 'string') {
            const match = amount.match(/\d+([.,]\d+)?/);
            if (match) {
                amountInCents = Math.round(parseFloat(match[0].replace(',', '.')) * 100);
            }
        } else {
            amountInCents = Math.round((amount || 0) * 100);
        }

        if (!amountInCents || amountInCents < 100) {
            amountInCents = 2000; // Valor padrão 20,00 se falhar
        }

        // NOVO TENTATIVA DE AUTH: Basic Auth com a chave SK e senha vazia
        // Formato: Basic base64(SECRET_KEY:)
        const authHeader = Buffer.from(`${SECRET_KEY}:`).toString('base64');

        const payload = {
            amount: amountInCents,
            paymentMethod: 'PIX',
            customer: {
                name: name,
                email: email,
                phone: cleanPhone,
                document: {
                    number: cleanCpf,
                    type: 'CPF'
                }
            },
            items: [
                {
                    title: 'Recarga Celular Online',
                    quantity: 1,
                    unitPrice: amountInCents,
                    tangible: false
                }
            ]
        };

        console.log('[API] Enviando para GhostsPay V2 (Basic Auth SK:)...');

        const response = await axios.post('https://api.ghostspaysv2.com/functions/v1/transactions', payload, {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/json',
                'x-company-id': COMPANY_ID
            }
        });


        console.log('[API] Conteúdo COMPLETO da resposta GhostsPay:', JSON.stringify(response.data, null, 2));

        // Extração do código PIX (Tentando todos os nomes possíveis de campos)
        const pixData = response.data.pix || response.data;
        const pixCode = pixData.qrcode || pixData.qrcode_text || pixData.emv || pixData.payload || pixData.brcode || pixData.copy_paste || '';
        
        const qrCodeUrl = pixCode ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixCode)}` : '';

        console.log('[API] Código PIX extraído com sucesso (Primeiros 20 caracteres):', pixCode.substring(0, 20));

        // Retornamos exatamente o objeto que o Supabase retornaria
        // Isso evita o erro de "dupla camada" no interceptor
        res.json({
            pix: {
                qrcode: pixCode,
                qrcodeText: pixCode,
                payload: pixCode,
                paymentCode: pixCode
            },
            gatewayTransactionId: response.data.id || '',
            id: response.data.id || '',
            status: 'pending',
            success: true
        });

    } catch (error) {
        console.error('[API] Erro ao criar transação:', error.response ? error.response.data : error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar Pix.',
            error: error.response ? error.response.data : error.message
        });
    }
});


// Endpoint para verificar status do pagamento (Polling do Frontend)
app.get('/api/check-status/:id', async (req, res) => {
    try {
        const transactionId = req.params.id;
        const authHeader = Buffer.from(`${COMPANY_ID}:${SECRET_KEY}`).toString('base64');

        const response = await axios.get(`https://api.ghostspaysv2.com/functions/v1/transactions/${transactionId}`, {
            headers: {
                'Authorization': `Basic ${authHeader}`
            }
        });

        const status = response.data.status; // 'paid', 'pending', etc.
        console.log(`[API] Status da transação ${transactionId}: ${status}`);

        res.json({
            success: true,
            status: status === 'paid' ? 'paid' : 'pending',
            data: response.data
        });

    } catch (error) {
        console.error('[API] Erro ao verificar status:', error.message);
        res.status(500).json({ success: false, message: 'Erro ao verificar status' });
    }
});

app.listen(port, () => {
    console.log(`\n=================================================`);
    console.log(`Servidor rodando em: http://localhost:${port}`);
    console.log(`Endpoints ativos: /api/create-pix e /api/check-status`);
    console.log(`=================================================\n`);
});

