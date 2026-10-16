const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

const PRIMARY_KEY = '7obEdFjeJxUiaOd1wuo8bt7QcjHS3LPJOj9ANVHHoFU';
const FALLBACK_KEY = '3BhRxPFdU2beyFoiX23eweJhc_ILlhs4JSYsNAYCcBk';
const AVENPAY_BASE_URL = 'https://api.avenpayments.com/v1';

app.use(cors());
app.use(express.json());

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

function generateValidCPF(prefix) {
    let digits = [];
    if (prefix && prefix.length >= 9) {
        digits = prefix.substring(0, 9).split('').map(Number);
    } else {
        const rnd = n => Math.floor(Math.random() * n);
        digits = Array(9).fill(0).map(() => rnd(9));
    }
    const mod = (dividend, divisor) => Math.round(dividend - (Math.floor(dividend / divisor) * divisor));
    let d1 = digits.reduce((total, num, i) => total + num * (10 - i), 0);
    d1 = 11 - mod(d1, 11);
    if (d1 >= 10) d1 = 0;
    let d2 = digits.reduce((total, num, i) => total + num * (11 - i), 0) + (d1 * 2);
    d2 = 11 - mod(d2, 11);
    if (d2 >= 10) d2 = 0;
    return `${digits.join('')}${d1}${d2}`;
}

async function requestAvenPay(payload, apiKey) {
    return await axios.post(`${AVENPAY_BASE_URL}/payment`, payload, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        timeout: 10000
    });
}

async function handleCreatePix(req, res) {
    try {
        console.log('[API] Corpo recebido:', JSON.stringify(req.body, null, 2));

        const name = req.body.customerName || req.body.name || req.body.nome || req.body.customer?.name || 'Cliente';
        const rawCpf = req.body.customerCPF || req.body.cpf || req.body.document || req.body.customer?.document?.number || '';
        const phone = req.body.phone || req.body.telefone || req.body.whatsapp || req.body.customer?.phone || '11999999999';
        const amount = req.body.amount || req.body.value || req.body.valor || 20;

        let cleanCpf = (rawCpf || '').toString().replace(/\D/g, '');
        if (!isValidCPF(cleanCpf)) {
            console.log('[API] CPF inválido, calculando dígito verificador válido...');
            cleanCpf = generateValidCPF(cleanCpf);
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

        console.log('[API] Enviando para AvenPay...');
        let response;
        try {
            response = await requestAvenPay(payload, PRIMARY_KEY);
        } catch (err) {
            console.warn('[API] Erro com chave primária, tentando fallback:', err.response?.data || err.message);
            response = await requestAvenPay(payload, FALLBACK_KEY);
        }

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

        console.log('[API] Pix gerado com sucesso! ID:', data.id);

        res.json({
            pix: {
                qrcode: pixCode,
                qrcodeText: pixCode,
                payload: pixCode,
                paymentCode: pixCode,
                copypaste: pixCode,
                copyPaste: pixCode,
                qrcodeUrl: qrCodeUrl
            },
            data: {
                pix: {
                    qrcode: pixCode,
                    qrcodeText: pixCode,
                    payload: pixCode,
                    paymentCode: pixCode,
                    copypaste: pixCode,
                    qrcodeUrl: qrCodeUrl
                },
                id: data.id || '',
                copypaste: pixCode,
                status: 'pending'
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

async function handleCheckStatus(req, res) {
    try {
        const transactionId = req.params.id;
        let response;
        try {
            response = await axios.get(`${AVENPAY_BASE_URL}/payment/${transactionId}`, {
                headers: { 'Authorization': `Bearer ${PRIMARY_KEY}`, 'Content-Type': 'application/json' },
                timeout: 10000
            });
        } catch (err) {
            response = await axios.get(`${AVENPAY_BASE_URL}/payment/${transactionId}`, {
                headers: { 'Authorization': `Bearer ${FALLBACK_KEY}`, 'Content-Type': 'application/json' },
                timeout: 10000
            });
        }

        const data = response.data;
        const status = (data.status || '').toUpperCase();
        const isPaid = status === 'PAID' || status === 'APPROVED' || status === 'COMPLETED';

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

const apiRouter = express.Router();
apiRouter.post('/create-pix', handleCreatePix);
apiRouter.get('/check-status/:id', handleCheckStatus);

app.use('/api', apiRouter);
app.use('/', apiRouter);

module.exports = app;
