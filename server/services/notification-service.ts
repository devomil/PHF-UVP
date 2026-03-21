import sgMail from "@sendgrid/mail";

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "ryan@pinehillfarm.co";
const ADMIN_PHONE = process.env.ADMIN_NOTIFICATION_PHONE || "+18474015540";
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "ryan@pinehillfarm.co";

let sgInitialized = false;
let twilioClient: any = null;
let twilioPhone: string | null = null;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function initSendGrid() {
  if (sgInitialized) return true;
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn("[Notifications] SENDGRID_API_KEY not set, email notifications disabled");
    return false;
  }
  sgMail.setApiKey(apiKey);
  sgInitialized = true;
  console.log("[Notifications] SendGrid initialized");
  return true;
}

async function initTwilio() {
  if (twilioClient) return true;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const phone = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !phone) {
    return false;
  }
  try {
    const twilio = await import("twilio");
    twilioClient = twilio.default(sid, token);
    twilioPhone = phone;
    console.log("[Notifications] Twilio initialized");
    return true;
  } catch (err: any) {
    console.warn("[Notifications] Twilio init failed:", err.message);
    return false;
  }
}

export async function sendNewUserSignupNotification(newUser: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const rawName = [newUser.firstName, newUser.lastName].filter(Boolean).join(" ") || newUser.email;
  const safeName = escapeHtml(rawName);
  const safeEmail = escapeHtml(newUser.email);
  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });

  if (initSendGrid()) {
    try {
      await sgMail.send({
        to: ADMIN_EMAIL,
        from: { email: FROM_EMAIL, name: "NeuralCut.AI" },
        subject: `New User Signup: ${rawName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #0f0f1a; color: #e2e8f0; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #a78bfa; margin: 0; font-size: 20px;">New User Signup</h2>
            </div>
            <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; border: 1px solid #2d2d44;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Name</td>
                  <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px; font-weight: 600;">${safeName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Email</td>
                  <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px;">${safeEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Time</td>
                  <td style="padding: 8px 0; color: #e2e8f0; font-size: 14px;">${timestamp}</td>
                </tr>
              </table>
            </div>
            <p style="text-align: center; color: #64748b; font-size: 12px; margin-top: 20px;">
              NeuralCut.AI Admin Notification
            </p>
          </div>
        `,
        text: `New user signup on NeuralCut.AI\n\nName: ${rawName}\nEmail: ${newUser.email}\nTime: ${timestamp}`,
      });
      console.log(`[Notifications] Signup email sent for ${newUser.email}`);
    } catch (err: any) {
      console.error("[Notifications] SendGrid email failed:", err.message);
      if (err.response?.body?.errors) {
        console.error("[Notifications] SendGrid errors:", JSON.stringify(err.response.body.errors));
      }
    }
  }

  if (await initTwilio()) {
    try {
      await twilioClient.messages.create({
        to: ADMIN_PHONE,
        from: twilioPhone,
        body: `NeuralCut.AI: New user signup — ${rawName} (${newUser.email}) at ${timestamp}`,
      });
      console.log(`[Notifications] Signup SMS sent for ${newUser.email}`);
    } catch (err: any) {
      console.error("[Notifications] Twilio SMS failed:", err.message);
    }
  }
}
