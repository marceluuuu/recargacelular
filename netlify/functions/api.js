const https = require('https');

exports.handler = async (event, context) => {
    // Configurações
    const SECRET_KEY = process.env.GHOSTSPAY_SECRET_KEY || 'sk_live_YflKFvyFkCZFRfLnyBSPeaIg0dACygEcQXUDcmW3W2t5UjNE';
    const COMPANY_ID = process.env.GHOSTSPAY_COMPANY_ID || '6ef93785-724c-4569-b78f-f97a24a25c13';
    
    const authHeader = `Basic ${Buffer.from(SECRET_KEY + ':').toString('base64')}`;
    const { path, httpMethod, body } = event;

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Helper para fazer requisições HTTPS sem dependências (mais estável na Netlify)
    const makeRequest = (url, method, auth, data = null) => {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname,
                method: method,
                headers: {
                    'Authorization': auth,
                    'Content-Type': 'application/json',
                    'User-Agent': 'NetlifyFunction/1.0'
                }
            };

            const req = https.request(options, (res) => {
                let chunks = '';
                res.on('data', (chunk) => chunks += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(chunks);
                        resolve({ status: res.statusCode, data: parsed });
                    } catch (e) {
                        resolve({ status: res.statusCode, data: chunks });
                    }
                });
            });

            req.on('error', (e) => reject(e));
            if (data) req.write(JSON.stringify(data));
            req.end();
        });
    };

    // ROTA: Criar Pix
    if (path.includes('create-pix') && httpMethod === 'POST') {
        try {
            const data = JSON.parse(body || '{}');
            const amountVal = data.amount || data.value || 50;
            const finalAmount = Math.round(parseFloat(amountVal) * 100); 
            const customerName = data.customerName || data.name || 'Cliente Pix';
            const customerCPF = (data.customerCPF || data.cpf || '12900580404').replace(/\D/g, '');
            const cleanName = customerName.toLowerCase().replace(/\s+/g, '');
            const customerEmail = `${cleanName}${Math.floor(Math.random() * 9000) + 1000}@gmail.com`;

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

            console.log('[Netlify] Enviando payload para GhostsPay...');
            const result = await makeRequest('https://api.ghostspay.com/v2/transactions', 'POST', authHeader, payload);

            if (result.status >= 400) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Erro API GhostsPay', details: result.data })
                };
            }

            const resData = result.data;
            const pixData = resData.pix || resData;
            const pixCode = pixData.qrcode || pixData.qrcode_text || pixData.emv || pixData.payload || pixData.brcode || pixData.copy_paste || '';

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    pix: {
                        qrcode: pixCode,
                        qrcodeText: pixCode,
                        payload: pixCode
                    },
                    gatewayTransactionId: resData.id || '',
                    id: resData.id || '',
                    status: 'pending',
                    success: true
                })
            };

        } catch (error) {
            console.error('[Netlify] Erro Crítico:', error.message);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: false, error: 'Erro Interno: ' + error.message })
            };
        }
    }

    // ROTA: Checar Status
    if (path.includes('check-status') && httpMethod === 'GET') {
        const parts = path.split('/');
        const transactionId = parts[parts.length - 1];
        try {
            const result = await makeRequest(`https://api.ghostspay.com/v2/transactions/${transactionId}`, 'GET', authHeader);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    status: result.data.status,
                    success: true,
                    data: result.data
                })
            };
        } catch (error) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: false, error: error.message })
            };
        }
    }

    return { statusCode: 404, headers, body: JSON.stringify({ message: "Rota não encontrada" }) };
};
