const request = require('request');

module.exports = async ({ container, context }) => {
    if (context.sessionId) {
        console.log('Reusing existing session:', context.sessionId);
        return;
    }
    const userUuid = process.env.USER_UUID;
    console.log("User UUID:", userUuid);

    return new Promise((resolve, reject) => {
        request({
            url: `${process.env.CHATBOT_SERVER_URL}/api/v1/session`,
            method: "POST",
            headers: { "auth-uuid": userUuid }
        }, (err, res, body) => {
            if (err) return reject(err);
            try {
                const data = JSON.parse(body);
                context.sessionId = data.session_uuid;
                console.log("Created session:", context.sessionId);
                resolve();
            } catch (parseError) {
                reject(new Error("Failed to parse session response JSON: " + parseError.message));
            }
        });
    });
};
