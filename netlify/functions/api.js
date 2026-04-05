// Usando fetch nativo (Node.js 18+) para evitar dependências externas na Netlify
exports.handler = async (event, context) => {
    // Configurações (Via Variáveis de Ambiente ou Hardcoded)
    const SECRET_KEY = process.env.GHOSTSPAY_SECRET_KEY || 'sk_live_YflKFvyFkCZFRfLnyBSPeaIg0dACygEcQXUDcmW3W2t5UjNE';
    const COMPANY_ID = process.env.GHOSTSPAY_COMPANY_ID || '6ef93785-724c-4569-b78f-f97a24a25c13';
    
    const authHeader = `Basic ${Buffer.from(SECRET_KEY + ':').toString('base64')}`;
    const { path, httpMethod, body } = event;

    // CORS Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // ROTA: Criar Pix
    if (path.includes('create-pix') && httpMethod === 'POST') {
        try {
            const data = JSON.parse(body || '{}');
            
            // Normalização
            const amountVal = data.amount || data.value || 50;
            const finalAmount = Math.round(parseFloat(amountVal) * 100); 
            const customerName = data.customerName || data.name || 'Cliente Pix';
            const customerCPF = (data.customerCPF || data.cpf || '12900580404').replace(/\D/g, '');
            
            // Helper Email
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

            const response = await fetch('https://api.ghostspay.com/v2/transactions', {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const resData = await response.json();

            if (!response.ok) {
                return {
                    statusCode: response.status,
                    headers,
                    body: JSON.stringify({ success: false, error: 'Erro na GhostsPay', details: resData })
                };
            }

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
            return {
                statusCode: 200, // Retornamos 200 pro site não travar, mas com erro no corpo
                headers,
                body: JSON.stringify({ success: false, error: error.message })
            };
        }
    }

    // ROTA: Checar Status
    if (path.includes('check-status') && httpMethod === 'GET') {
        const parts = path.split('/');
        const transactionId = parts[parts.length - 1];
        try {
            const response = await fetch(`https://api.ghostspay.com/v2/transactions/${transactionId}`, {
                method: 'GET',
                headers: { 'Authorization': authHeader }
            });
            const resData = await response.json();
            
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

    return { statusCode: 404, headers, body: JSON.stringify({ message: "Rota não encontrada" }) };
};
