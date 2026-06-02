const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const services = {
    books: process.env.BOOKS_SERVICE_URL || 'http://localhost:3001',
    members: process.env.MEMBERS_SERVICE_URL || 'http://localhost:8081',
    loans: process.env.LOANS_SERVICE_URL || 'http://localhost:5001',
    fines: process.env.FINES_SERVICE_URL || 'http://localhost:5002',
};

function buildRequestOptions(req){
    const options = {
        method: req.method,
        headers : {
            "content-type": "application/json",
            accept: "application/json"
        }
    };

    if (!["GET", "HEAD"].includes(req.method) && req.body !== undefined){
        options.body = JSON.stringify(req.body);
    }
    return options;
}

async function parseResponse(response){
    const text = await response.text();

    if (!text){
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return {
            message: "Response dari service bukan JSON",
            raw_response: text
        };
    }
}

async function forwardRequest(req, res, baseUrl, targetPath){
    const queryString = req.originalUrl.includes("?")
    ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
    : "";

    const targetUrl = `${baseUrl}${targetPath}${queryString}`;

    try {
        const response = await fetch(targetUrl, buildRequestOptions(req));
        const payload = await parseResponse(response);

        return res.status(response.status).json(payload);
    } catch (error){
        return res.status(503).json({
            gateway: "api-gateway",
            message: "Service tidak tersedia",
            target: targetUrl,
            error: error.message
        });
    }
}

function createProxyRoute(resourceName){
    return async (req, res) => {
        const id = req.params.id ? `/${req.params.id}` : "";
        return forwardRequest(
            req,
            res,
            services[resourceName],
            `/${resourceName}${id}`
        );
    };
}

app.get("/", (req, res) => {
    res.json({
        gateway: "api-gateway",
        message: "API Gateway Sistem Perpustakaan sedang berjalan",
        routes: {
            books: "/api/books",
            members: "/api/members",
            loans: "/api/loans",
            fines: "/api/fines",
            health: "/api/health",
            system_status: "/api/system-status"
        }
    });
});

app.get("/health", (req, res) => {
    res.json({
        service: "api-gateway",
        language: "Node.js",
        framework: "Express",
        status: "running"
    });
});

app.get("/system-status", async (req, res) => {
    const healthChecks = await Promise.all(
        Object.entries(services).map(async ([serviceName, baseUrl]) => {
            const healthUrl = `${baseUrl}/health`;
            try {
                const response = await fetch(healthUrl, {
                    headers: { accept: "application/json" }
                });
                const payload = await parseResponse(response);
                return {
                    service: serviceName,
                    reachable: response.ok,
                    http_status: response.status,
                    details: payload
                };
            } catch (error) {
                return {
                    service: serviceName,
                    reachable: false,
                    http_status: null,
                    details: {
                        error: error.message
                    }
                };
            }
        })
    );
    const allServiceRunning = healthChecks.every(item => item.reachable);
    res.status(allServiceRunning ? 200 : 503).json({
        gateway: "api-gateway",
        status: allServiceRunning
            ? "all-services-running"
            : "some-services-unreachable",
        services: healthChecks
    });
});

app.all("/api/books", createProxyRoute("books"));
app.all("/api/books/:id", createProxyRoute("books"));

app.all("/api/members", createProxyRoute("members"));
app.all("/api/members/:id", createProxyRoute("members"));

app.all("/api/loans", createProxyRoute("loans"));
app.all("/api/loans/:id", createProxyRoute("loans"));

app.all("/api/fines", createProxyRoute("fines"));
app.all("/api/fines/:id", createProxyRoute("fines"));

app.use((req, res) => {
    res.status(404).json({
        gateway: "api-gateway",
        message: "Endpoint tidak ditemukan",
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("API Gateway berjalan pada port ${PORT}");
});

