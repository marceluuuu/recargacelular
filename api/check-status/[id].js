const axios = require('axios');

const AVENPAY_API_KEY = '1ABcTMX2IN0JtveSRPqfbJFz0NH2XGZ9LmQg7Lr_NEE';
const AVENPAY_BASE_URL = 'https://api.avenpayments.com/v1';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const transactionId = req.query.id;
        const response = await axios.get(`${AVENPAY_BASE_URL}/payment/${transactionId}`, {
            headers: {
                'Authorization': `Bearer ${AVENPAY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

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
