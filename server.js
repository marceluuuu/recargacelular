const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

// Configurações da AvenPay
const AVENPAY_API_KEY = '1ABcTMX2IN0JtveSRPqfbJFz0NH2XGZ9LmQg7Lr_NEE';   // Chave de pagamento
const AVENPAY_TRANSFER_KEY = '7obEdFjeJxUiaOd1wuo8bt7QcjHS3LPJOj9ANVHHoFU'; // Chave de saque/transferência
const AVENPAY_BASE_URL = 'https://api.avenpayments.com/v1';

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
        const cpf = req.body.customerCPF || req.body.cpf || req.body.document || req.body.customer?.document?.number || '00000000000';
        const phone = req.body.phone || req.body.telefone || req.body.whatsapp || req.body.customer?.phone || '00000000000';
        const amount = req.body.amount || req.body.value || req.body.valor || 20;

        console.log(`[API] Processando Pix: ${name} | Valor: ${amount}`);

        // Limpeza dos dados
        const cleanCpf = (cpf || '').toString().replace(/\D/g, '');
        let cleanPhone = (phone || '').toString().replace(/\D/g, '');
        if (cleanPhone.length <= 11 && cleanPhone.length > 0) cleanPhone = '+55' + cleanPhone;
        else if (!cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;

        const email = generateEmail(name);

        // Conversão de valor para centavos
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
            amountInCents = 2000; // Valor padrão R$20,00
        }

        // Payload no formato AvenPay
        const payload = {
            amount: amountInCents,
            currency: 'BRL',
            method: 'PIX',
            description: 'Recarga Celular Online',
            externalRef: `recarga_${Date.now()}`,
            payer: {
                name: name,
                taxId: cleanCpf,
                email: email,
                phone: cleanPhone
            },
            items: [
                {
                    quantity: 1,
                    name: 'Recarga Celular Online',
                    price: amountInCents,
                    type: 'DIGITAL'
                }
            ]
        };

        console.log('[API] Enviando para AvenPay...');
        console.log('[API] Payload:', JSON.stringify(payload, null, 2));

        const response = await axios.post(`${AVENPAY_BASE_URL}/payment`, payload, {
            headers: {
                'Authorization': `Bearer ${AVENPAY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('[API] Resposta AvenPay completa:', JSON.stringify(response.data, null, 2));

        // Extração do código PIX (AvenPay retorna em data.data.copypaste)
        const data = response.data;
        const pixCode =
            data?.data?.copypaste ||
            data?.data?.qrcode ||
            data?.data?.emv ||
            data?.data?.brcode ||
            data?.pix?.qrcode ||
            data?.pix?.emv ||
            data?.pix?.payload ||
            data?.pix?.brcode ||
            data?.qrcode ||
            data?.emv ||
            data?.payload ||
            data?.brcode ||
            data?.copyPaste ||
            data?.copy_paste ||
            '';

        const qrCodeUrl = pixCode
            ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixCode)}`
            : '';

        console.log('[API] Código PIX extraído (primeiros 20 chars):', pixCode.substring(0, 20));

        res.json({
            pix: {
                qrcode: pixCode,
                qrcodeText: pixCode,
                payload: pixCode,
                paymentCode: pixCode,
                qrcodeUrl: qrCodeUrl
            },
            gatewayTransactionId: data.id || '',
            id: data.id || '',
            status: 'pending',
            success: true
        });

    } catch (error) {
        console.error('[API] Erro ao criar transação:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
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
        console.log(`[API] Verificando status da transação: ${transactionId}`);

        const response = await axios.get(`${AVENPAY_BASE_URL}/payment/${transactionId}`, {
            headers: {
                'Authorization': `Bearer ${AVENPAY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const data = response.data;
        // AvenPay usa status como: PENDING, PAID, CANCELLED, EXPIRED, etc.
        const status = (data.status || '').toUpperCase();
        const isPaid = status === 'PAID' || status === 'APPROVED' || status === 'COMPLETED';

        console.log(`[API] Status da transação ${transactionId}: ${status}`);

        res.json({
            success: true,
            status: isPaid ? 'paid' : 'pending',
            rawStatus: status,
            data: data
        });

    } catch (error) {
        console.error('[API] Erro ao verificar status:', error.message);
        res.status(500).json({ success: false, message: 'Erro ao verificar status' });
    }
});

app.listen(port, () => {
    console.log(`\n=================================================`);
    console.log(`Servidor rodando em: http://localhost:${port}`);
    console.log(`Gateway: AvenPay`);
    console.log(`Endpoints ativos: /api/create-pix e /api/check-status/:id`);
    console.log(`=================================================\n`);
});
