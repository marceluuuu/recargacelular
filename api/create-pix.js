const axios = require('axios');

const AVENPAY_API_KEY = '1ABcTMX2IN0JtveSRPqfbJFz0NH2XGZ9LmQg7Lr_NEE';
const AVENPAY_BASE_URL = 'https://api.avenpayments.com/v1';

function generateEmail(name) {
    const cleanName = (name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const domains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${cleanName}${randomNum}@${domain}`;
}

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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch(e) {}
        }
        body = body || {};

        const name = body.customerName || body.name || body.nome || body.customer?.name || 'Cliente';
        const rawCpf = body.customerCPF || body.cpf || body.document || body.customer?.document?.number || '';
        const phone = body.phone || body.telefone || body.whatsapp || body.customer?.phone || '11999999999';
        const amount = body.amount || body.value || body.valor || 20;

        let cleanCpf = (rawCpf || '').toString().replace(/\D/g, '');
        if (!isValidCPF(cleanCpf)) {
            cleanCpf = generateValidCPF();
        }

        let cleanPhone = (phone || '').toString().replace(/\D/g, '');
        if (cleanPhone.length <= 11 && cleanPhone.length > 0) cleanPhone = '+55' + cleanPhone;
        else if (!cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;

        const email = generateEmail(name);

        let amountInCents = 0;
        if (typeof amount === 'string') {
            const match = amount.match(/\d+([.,]\d+)?/);
            if (match) amountInCents = Math.round(parseFloat(match[0].replace(',', '.')) * 100);
        } else {
            amountInCents = Math.round((amount || 0) * 100);
        }
        if (!amountInCents || amountInCents < 100) amountInCents = 2000;

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
            items: [{
                quantity: 1,
                name: 'Recarga Celular Online',
                price: amountInCents,
                type: 'DIGITAL'
            }]
        };

        const response = await axios.post(`${AVENPAY_BASE_URL}/payment`, payload, {
            headers: {
                'Authorization': `Bearer ${AVENPAY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const data = response.data;
        const pixCode = data?.data?.copypaste || data?.data?.qrcode || data?.pix?.qrcode || data?.qrcode || data?.payload || '';
        const qrCodeUrl = pixCode ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixCode)}` : '';

        return res.status(200).json({
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
        console.error('[API] Erro ao criar transação:', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: 'Erro ao gerar Pix.',
            error: error.response?.data || error.message
        });
    }
};
