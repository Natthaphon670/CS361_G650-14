const APP_CONFIG = {
    useMock: false,   // เปลี่ยนเป็น false เพื่อใช้ AWS จริง

    auth: {
        // 1) Cognito > User pool > App integration > Domain
        cognitoDomain: "https://us-east-107xfu83b2.auth.us-east-1.amazoncognito.com",
        // 2) Cognito > User pool > App clients > Client ID
        clientId: "1tan8hvjbkc911j4ligl4rr9ik",
        scope: "openid email profile",

        redirectUri: new URL("index.html", window.location.href).href,
        logoutUri: "https://main.d2eorbfslu1s80.amplifyapp.com/index.html",

        apiTokenType: "id"
    },

    api: {
        // 3) API Gateway > Stages > prod > Invoke URL (ไม่ต้องมี / ท้ายสุด)
        baseUrl: "https://qzleoa96f4.execute-api.us-east-1.amazonaws.com/prod",
        // 4) (ทางเลือก) API key จาก Usage Plan — ใส่เมื่อรัน infra/apply-rate-limiting.sh ด้วย REQUIRE_API_KEY=true
        //    API key ฝั่งเว็บไม่ใช่ความลับ ใช้ระบุ client เพื่อคุม quota เท่านั้น การยืนยันตัวตนยังเป็น Cognito
        apiKey: ""
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