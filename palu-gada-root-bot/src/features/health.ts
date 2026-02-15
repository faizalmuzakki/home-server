import http from 'http';

export function initHealthCheck(port: number = 3051) {
    const server = http.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`Health check server listening on port ${port}`);
    });

    return server;
}
