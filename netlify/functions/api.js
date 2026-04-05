const https = require('https');

// CHAVES EXPOSTAS NO CÓDIGO (CONFORME SOLICITADO)
const SECRET_KEY = 'sk_live_YflKFvyFkCZFRfLnyBSPeaIg0dACygEcQXUDcmW3W2t5UjNE';
const COMPANY_ID = '6ef93785-724c-4569-b78f-f97a24a25c13';

exports.handler = async (event, context) => {
    const authHeader = `Basic ${Buffer.from(SECRET_KEY + ':').toString('base64')}`;
    const { path, httpMethod, body } = event;

    // A URL CORRETA (Baseada no server.js que funcionou localmente)
    const EXTERNAL_API_URL = 'https://api.ghostspaysv2.com/functions/v1/transactions';

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const makeRequest = (url, method, auth, data = null) => {
        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(url);
                const options = {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname + urlObj.search,
                    method: method,
                    headers: {
                        'Authorization': auth,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
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
            } catch (e) {
                reject(e);
            }
        });
    };

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

            const result = await makeRequest(EXTERNAL_API_URL, 'POST', authHeader, payload);

            if (result.status >= 400) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: false, error: 'GhostsPay API Error (HTTP ' + result.status + ')', details: result.data })
                };
            }

            const resData = result.data.data ? result.data.data : result.data;
            const pixData = (resData && resData.pix) ? resData.pix : resData;
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
                    id: resData.id || (result.data.data && result.data.data.id) || '',
                    status: 'pending',
                    success: true
                })
            };

        } catch (error) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: false, error: 'Internal Error: ' + error.message })
            };
        }
    }

    if (path.includes('check-status') && httpMethod === 'GET') {
        const parts = path.split('/');
        const transactionId = parts[parts.length - 1];
        try {
            const result = await makeRequest(`${EXTERNAL_API_URL}/${transactionId}`, 'GET', authHeader);
            const resData = result.data.data ? result.data.data : result.data;
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    status: resData.status,
                    success: true,
                    data: resData
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

    return { statusCode: 404, headers, body: JSON.stringify({ message: "Not Found" }) };
};
