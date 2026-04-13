import { ENV } from "./server/_core/env";

const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
const url = new URL("images.v1.ImageService/GenerateImage", baseUrl).toString();
console.log("URL:", url);

// Testar com parâmetros adicionais de qualidade
const body = {
  prompt: "test barbershop logo",
  original_images: [],
  quality: "high",
  size: "1024x1024",
  style: "vivid",
  n: 1,
};

console.log("Body enviado:", JSON.stringify(body, null, 2));

const res = await fetch(url, {
  method: "POST",
  headers: {
    accept: "application/json",
    "content-type": "application/json",
    "connect-protocol-version": "1",
    authorization: `Bearer ${ENV.forgeApiKey}`,
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(20000),
});

console.log("Status:", res.status, res.statusText);
const text = await res.text();
console.log("Response (primeiros 800 chars):", text.substring(0, 800));
