const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// Configurações da AvenPay
const AVENPAY_API_KEY = '1ABcTMX2IN0JtveSRPqfbJFz0NH2XGZ9LmQg7Lr_NEE';   // Chave de pagamento
const AVENPAY_TRANSFER_KEY = '7obEdFjeJxUiaOd1wuo8bt7QcjHS3LPJOj9ANVHHoFU'; // Chave de saque/transferência
const AVENPAY_BASE_URL = 'https://api.avenpayments.com/v1';

app.use(cors());
app.use(express.json());

// Gerador de e-mail aleatório "válido"
function generateEmail(name) {
    const cleanName = (name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const domains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${cleanName}${randomNum}@${domain}`;
}

// Validador e gerador de CPF válido
function isValidCPF(cpf) {
    if (!cpf || typeof cpf !== 'string') return false;
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
    let soma = 0, resto;
    for (let i = 1; i <= 9; i++) soma += parseInt(clean.substring(i - 1, i)) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(clean.substring(9, 10))) return false;
    soma = 0;
    for (let i = 1; i <= 10; i++) soma += parseInt(clean.substring(i - 1, i)) * (12 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(clean.substring(10, 11))) return false;
    return true;
}

function generateValidCPF() {
    const rnd = n => Math.floor(Math.random() * n);
    const mod = (dividend, divisor) => Math.round(dividend - (Math.floor(dividend / divisor) * divisor));
    const n = Array(9).fill(0).map(() => rnd(9));
    let d1 = n.reduce((total, num, i) => total + num * (10 - i), 0);
    d1 = 11 - mod(d1, 11);
    if (d1 >= 10) d1 = 0;
    let d2 = n.reduce((total, num, i) => total + num * (11 - i), 0) + (d1 * 2);
    d2 = 11 - mod(d2, 11);
    if (d2 >= 10) d2 = 0;
    return `${n.join('')}${d1}${d2}`;
}

// Handler de criação do Pix
async function handleCreatePix(req, res) {
    try {
        console.log('[API] Corpo recebido:', JSON.stringify(req.body, null, 2));

        const name = req.body.customerName || req.body.name || req.body.nome || req.body.customer?.name || 'Cliente';
        const rawCpf = req.body.customerCPF || req.body.cpf || req.body.document || req.body.customer?.document?.number || '';
        const phone = req.body.phone || req.body.telefone || req.body.whatsapp || req.body.customer?.phone || '11999999999';
        const amount = req.body.amount || req.body.value || req.body.valor || 20;

        console.log(`[API] Processando Pix: ${name} | Valor: ${amount}`);

        let cleanCpf = (rawCpf || '').toString().replace(/\D/g, '');
        if (!isValidCPF(cleanCpf)) {
            console.log('[API] CPF inválido ou ausente, gerando CPF válido para o gateway...');
            cleanCpf = generateValidCPF();
        }

        let cleanPhone = (phone || '').toString().replace(/\D/g, '');
        if (cleanPhone.length <= 11 && cleanPhone.length > 0) cleanPhone = '+55' + cleanPhone;
        else if (!cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;

        const email = generateEmail(name);

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
            amountInCents = 2000;
        }

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
        const response = await axios.post(`${AVENPAY_BASE_URL}/payment`, payload, {
            headers: {
                'Authorization': `Bearer ${AVENPAY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('[API] Resposta AvenPay completa:', JSON.stringify(response.data, null, 2));

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
}

// Handler de verificação de status
async function handleCheckStatus(req, res) {
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
}

// Roteador para suportar tanto /api/* quanto /* (caso o Vercel remova o prefixo no rewrite)
const apiRouter = express.Router();
apiRouter.post('/create-pix', handleCreatePix);
apiRouter.get('/check-status/:id', handleCheckStatus);

app.use('/api', apiRouter);
app.use('/', apiRouter);

// Fallback de segurança para rota raiz
app.get('/', (req, res) => {
    const possiblePaths = [
        path.join(process.cwd(), 'index.html'),
        path.join(__dirname, '..', 'index.html'),
        path.join(__dirname, 'index.html')
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return res.sendFile(p);
        }
    }
    res.send('API AvenPay Online');
});

module.exports = app;
