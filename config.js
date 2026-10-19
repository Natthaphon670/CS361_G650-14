
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

    api: {
        baseUrl: "https://<your-api-id>.execute-api.us-east-1.amazonaws.com/prod"
    },

    evidence: {
        maxBytes: 10 * 1024 * 1024,                       
        allowedTypes: ["application/pdf", "image/png", "image/jpeg"],
        mockMaxBytes: 2 * 1024 * 1024                     
    }
};

APP_CONFIG.isPlaceholder = [
    APP_CONFIG.auth.cognitoDomain,
    APP_CONFIG.auth.clientId,
    APP_CONFIG.api.baseUrl
].some(v => v.includes("<"));

APP_CONFIG.isMock = APP_CONFIG.useMock || APP_CONFIG.isPlaceholder;