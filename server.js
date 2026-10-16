const app = require('./api/index');
const express = require('express');
const path = require('path');

const port = process.env.PORT || 3000;

// Servir arquivos estáticos da pasta raiz para desenvolvimento local
app.use(express.static(__dirname));

// Rota explícita para o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicia servidor apenas se executado diretamente
if (require.main === module || (!process.env.VERCEL && !process.env.NETLIFY)) {
    app.listen(port, () => {
        console.log(`\n=================================================`);
        console.log(`Servidor rodando em: http://localhost:${port}`);
        console.log(`Gateway: AvenPay`);
        console.log(`Endpoints ativos: /api/create-pix e /api/check-status/:id`);
        console.log(`=================================================\n`);
    });
}

module.exports = app;
