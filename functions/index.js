const { onRequest, onCall } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const fetch = require("node-fetch");

initializeApp();

// HTTPS Callable Function - secure, requires authentication
exports.getMillicastToken = onCall(async (request) => {
  // Check authentication
  if (!request.auth) {
    throw new Error("Autenticazione richiesta per accedere allo stream");
  }

  // Millicast credentials (safe on server-side)
  const streamAccountId = "k9Mwad";
  const streamName = "multiview";

  try {
    // Call Millicast Director API to get subscriber token
    const response = await fetch("https://director.millicast.com/api/director/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        streamAccountId: streamAccountId,
        streamName: streamName,
      }),
    });

    if (!response.ok) {
      throw new Error(`Millicast API error: ${response.status}`);
    }

    const data = await response.json();

    // Return token data to client
    return {
      success: true,
      tokenData: data,
      userId: request.auth.uid,
      userEmail: request.auth.token.email || "anonymous",
    };
  } catch (error) {
    console.error("Error getting Millicast token:", error);
    throw new Error("Impossibile ottenere il token dello stream");
  }
});

// Optional: HTTP endpoint for testing (remove in production)
exports.healthCheck = onRequest((req, res) => {
  res.json({ status: "ok", message: "Firebase Functions are running" });
});
