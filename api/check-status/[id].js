const axios = require('axios');

const PRIMARY_KEY = '7obEdFjeJxUiaOd1wuo8bt7QcjHS3LPJOj9ANVHHoFU';
const FALLBACK_KEY = '3BhRxPFdU2beyFoiX23eweJhc_ILlhs4JSYsNAYCcBk';
const AVENPAY_BASE_URL = 'https://api.avenpayments.com/v1';

async function checkStatus(transactionId, apiKey) {
    return await axios.get(`${AVENPAY_BASE_URL}/payment/${transactionId}`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        timeout: 10000
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const transactionId = req.query.id;
        let response;
        try {
            response = await checkStatus(transactionId, PRIMARY_KEY);
        } catch (err) {
            response = await checkStatus(transactionId, FALLBACK_KEY);
        }

        const data = response.data;
        const status = (data.status || '').toUpperCase();
        const isPaid = status === 'PAID' || status === 'APPROVED' || status === 'COMPLETED';

        return res.status(200).json({
            success: true,
            status: isPaid ? 'paid' : 'pending',
            rawStatus: status,
            data: data
        });
    } catch (error) {
        console.error('[API] Erro ao verificar status:', error.response?.data || error.message);
        return res.status(500).json({ success: false, message: 'Erro ao verificar status' });
    }
};
