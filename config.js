
const APP_CONFIG = {
    useMock: true,

    auth: {
        
        cognitoDomain: "https://<your-domain>.auth.us-east-1.amazoncognito.com",
        clientId: "<YOUR_CLIENT_ID>",
        scope: "openid email profile",
        
        redirectUri: new URL("index.html", window.location.href).href,
        
        logoutUri: new URL("index.html", window.location.href).href,
        
        apiTokenType: "id"
    },

    // Keep the existing Workloads API separate from the Issue #4 Evidence API.
    // The Issue #4 SAM template creates only the evidence routes, not /workloads.
    api: {
        baseUrl: "https://<your-workloads-api-id>.execute-api.us-east-1.amazonaws.com/prod"
    },

    evidence: {
        apiBaseUrl: "https://<your-evidence-api-id>.execute-api.us-east-1.amazonaws.com/prod",
        maxBytes: 10 * 1024 * 1024,
        allowedTypes: ["application/pdf", "image/png", "image/jpeg"],
        mockMaxBytes: 2 * 1024 * 1024
    }
};

APP_CONFIG.isPlaceholder = [
    APP_CONFIG.auth.cognitoDomain,
    APP_CONFIG.auth.clientId,
    APP_CONFIG.api.baseUrl,
    APP_CONFIG.evidence.apiBaseUrl
].some(v => v.includes("<"));

APP_CONFIG.isMock = APP_CONFIG.useMock || APP_CONFIG.isPlaceholder;