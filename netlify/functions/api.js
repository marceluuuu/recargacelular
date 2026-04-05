const axios = require('axios');

// Funções auxiliares
const generateEmail = (name) => {
    const cleanName = name ? name.toLowerCase().replace(/\s+/g, '') : 'usuario';
    const domains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com'];
    const randomDomain = domains[Math.floor(Math.random() * domains.length)];
    const randomNum = Math.floor(Math.random() * 9000) + 1000;
    return `${cleanName}${randomNum}@${randomDomain}`;
};

exports.handler = async (event, context) => {
    // Configurações (Preferencialmente via Variáveis de Ambiente na Netlify)
    const SECRET_KEY = process.env.GHOSTSPAY_SECRET_KEY || 'sk_live_YflKFvyFkCZFRfLnyBSPeaIg0dACygEcQXUDcmW3W2t5UjNE';
    const COMPANY_ID = process.env.GHOSTSPAY_COMPANY_ID || '6ef93785-724c-4569-b78f-f97a24a25c13';
    
    // Auth Basic Auth (Base64)
    const authHeader = `Basic ${Buffer.from(SECRET_KEY + ':').toString('base64')}`;

    const { path, httpMethod, body } = event;

    // ROTA: Criar Pix
    if (path.includes('create-pix') && httpMethod === 'POST') {
        try {
            const data = JSON.parse(body);
            console.log('[Netlify] Criando Pix para:', data.customerName || 'Cliente');

            // Normalização dos campos
            const finalAmount = parseFloat(data.amount || data.value || 50) * 100; // Centavos
            const customerName = data.customerName || data.name || 'Cliente Pix';
            const customerCPF = (data.customerCPF || data.cpf || '12900580404').replace(/\D/g, '');
            const customerEmail = generateEmail(customerName);

            const payload = {
                amount: finalAmount,
                payment_method: 'pix',
                company_id: COMPANY_ID,
                customer: {
                    name: customerName,
                    cpf: customerCPF,
                    email: customerEmail
                },
                items: [{
                    title: 'Recarga Celular Online',
                    unitPrice: finalAmount,
                    quantity: 1,
                    tangible: false
                }]
            };

            const response = await axios.post('https://api.ghostspay.com/v2/transactions', payload, {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            });

            const pixData = response.data.pix || response.data;
            const pixCode = pixData.qrcode || pixData.qrcode_text || pixData.emv || pixData.payload || pixData.brcode || pixData.copy_paste || '';

            return {
                statusCode: 200,
                body: JSON.stringify({
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
                })
            };

        } catch (error) {
            console.error('[Netlify] Erro API:', error.response ? error.response.data : error.message);
            return {
                statusCode: 500,
                body: JSON.stringify({ success: false, error: 'Erro ao gerar Pix.' })
            };
        }
    }

    // ROTA: Checar Status
    if (path.includes('check-status') && httpMethod === 'GET') {
        const transactionId = path.split('/').pop();
        try {
            const response = await axios.get(`https://api.ghostspay.com/v2/transactions/${transactionId}`, {
                headers: { 'Authorization': authHeader }
            });
            
            return {
                statusCode: 200,
                body: JSON.stringify({
                    status: response.data.status, // 'paid', 'pending', 'refused'
                    success: true,
                    data: response.data
                })
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ success: false, error: 'Erro ao consultar status.' })
            };
        }
    }

    return {
        statusCode: 404,
        body: JSON.stringify({ message: "Rota não encontrada" })
    };
};
