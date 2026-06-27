import sgMail from "@sendgrid/mail";

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "";
const ADMIN_PHONE = process.env.ADMIN_NOTIFICATION_PHONE || "";
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@neuralcut.ai";

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

export async function sendWelcomeEmail(newUser: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}) {
  if (!initSendGrid()) return;

  const firstName = escapeHtml(newUser.firstName || "there");
  const fullName = escapeHtml([newUser.firstName, newUser.lastName].filter(Boolean).join(" ") || "there");
  const appUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://neuralcut.ai";
  const assetBase = `${appUrl}/email-assets`;
  const presetBase = `${appUrl}/art-presets`;

  try {
    await sgMail.send({
      to: newUser.email,
      from: { email: FROM_EMAIL, name: "NeuralCut.AI" },
      subject: `Welcome to NeuralCut.AI, ${newUser.firstName || "there"} — Let's Create Something Amazing`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #09090f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 0;">

    <div style="background: linear-gradient(135deg, #1a0533 0%, #0f0f1a 50%, #0a1628 100%); padding: 48px 32px 40px; text-align: center;">
      <div style="margin-bottom: 28px;">
        <img src="${assetBase}/neuralcut-full-logo.png" alt="NeuralCut.AI" width="220" style="display: inline-block; max-width: 220px; height: auto;" />
      </div>
      <h1 style="color: #f1f5f9; font-size: 28px; font-weight: 700; margin: 0 0 8px; line-height: 1.3;">Welcome aboard, ${fullName}!</h1>
      <p style="color: #94a3b8; font-size: 16px; margin: 0; line-height: 1.6;">Your AI-powered video production studio is ready.</p>
      <div style="margin-top: 20px; display: inline-block; background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.3); border-radius: 20px; padding: 6px 16px;">
        <span style="color: #a78bfa; font-size: 13px;">&#x1F389; Account created for ${escapeHtml(newUser.email)}</span>
      </div>
    </div>

    <div style="background-color: #0f0f1a; padding: 40px 32px;">

      <p style="color: #cbd5e1; font-size: 15px; line-height: 1.7; margin: 0 0 32px;">
        Hi ${firstName}! You've just unlocked access to a platform that turns your ideas into professional-quality videos using cutting-edge AI. Here's how to get started:
      </p>

      <!--[if mso]><table role="presentation" width="100%"><tr><td><![endif]-->
      <div style="background: linear-gradient(135deg, #1e1b4b 0%, #1a1a2e 100%); border: 1px solid #2d2d54; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 48px; vertical-align: top; padding-right: 16px;">
              <div style="background: linear-gradient(135deg, #7c3aed, #6366f1); color: white; width: 36px; height: 36px; border-radius: 50%; text-align: center; line-height: 36px; font-weight: 700; font-size: 15px;">1</div>
            </td>
            <td style="vertical-align: top;">
              <h3 style="color: #e2e8f0; font-size: 16px; font-weight: 600; margin: 0 0 6px;">Create Your First Project</h3>
              <p style="color: #94a3b8; font-size: 14px; margin: 0; line-height: 1.6;">Click "Create new" in the sidebar and describe your video concept. Our AI will generate a complete scene-by-scene script for you.</p>
            </td>
          </tr>
        </table>
      </div>

      <div style="background: linear-gradient(135deg, #1e1b4b 0%, #1a1a2e 100%); border: 1px solid #2d2d54; border-radius: 12px; padding: 24px; margin-bottom: 16px;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 48px; vertical-align: top; padding-right: 16px;">
              <div style="background: linear-gradient(135deg, #7c3aed, #6366f1); color: white; width: 36px; height: 36px; border-radius: 50%; text-align: center; line-height: 36px; font-weight: 700; font-size: 15px;">2</div>
            </td>
            <td style="vertical-align: top;">
              <h3 style="color: #e2e8f0; font-size: 16px; font-weight: 600; margin: 0 0 6px;">Choose Your Visual Style</h3>
              <p style="color: #94a3b8; font-size: 14px; margin: 0; line-height: 1.6;">Pick from 9 stunning art presets. Each one completely transforms how your video looks and feels.</p>
            </td>
          </tr>
        </table>
      </div>

      <div style="background: linear-gradient(135deg, #1e1b4b 0%, #1a1a2e 100%); border: 1px solid #2d2d54; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 48px; vertical-align: top; padding-right: 16px;">
              <div style="background: linear-gradient(135deg, #7c3aed, #6366f1); color: white; width: 36px; height: 36px; border-radius: 50%; text-align: center; line-height: 36px; font-weight: 700; font-size: 15px;">3</div>
            </td>
            <td style="vertical-align: top;">
              <h3 style="color: #e2e8f0; font-size: 16px; font-weight: 600; margin: 0 0 6px;">Generate &amp; Render</h3>
              <p style="color: #94a3b8; font-size: 14px; margin: 0; line-height: 1.6;">Generate AI video clips for each scene, add voiceover and music, then render your finished video &mdash; all within the platform.</p>
            </td>
          </tr>
        </table>
      </div>

      <div style="margin: 32px 0;">
        <h3 style="color: #a78bfa; font-size: 14px; font-weight: 600; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px;">&#x1F3A8; Art Style Presets</h3>
        <p style="color: #94a3b8; font-size: 13px; margin: 0 0 16px;">Choose from 9 visual styles to define the look of your entire video</p>
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 33.33%; padding: 4px;">
              <img src="${presetBase}/3d-illustration.png" alt="3D Illustration" width="168" style="width: 100%; border-radius: 8px; display: block;" />
              <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin: 6px 0 0;">3D Illustration</p>
            </td>
            <td style="width: 33.33%; padding: 4px;">
              <img src="${presetBase}/cinematic-realism.png" alt="Cinematic Realism" width="168" style="width: 100%; border-radius: 8px; display: block;" />
              <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin: 6px 0 0;">Cinematic Realism</p>
            </td>
            <td style="width: 33.33%; padding: 4px;">
              <img src="${presetBase}/watercolor.png" alt="Watercolor" width="168" style="width: 100%; border-radius: 8px; display: block;" />
              <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin: 6px 0 0;">Watercolor</p>
            </td>
          </tr>
          <tr>
            <td style="width: 33.33%; padding: 4px;">
              <img src="${presetBase}/claymation.png" alt="Claymation" width="168" style="width: 100%; border-radius: 8px; display: block;" />
              <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin: 6px 0 0;">Claymation</p>
            </td>
            <td style="width: 33.33%; padding: 4px;">
              <img src="${presetBase}/neon-futuristic.png" alt="Neon Futuristic" width="168" style="width: 100%; border-radius: 8px; display: block;" />
              <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin: 6px 0 0;">Neon Futuristic</p>
            </td>
            <td style="width: 33.33%; padding: 4px;">
              <img src="${presetBase}/minimalist-flat.png" alt="Minimalist Flat" width="168" style="width: 100%; border-radius: 8px; display: block;" />
              <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin: 6px 0 0;">Minimalist Flat</p>
            </td>
          </tr>
        </table>
      </div>

      <div style="background: linear-gradient(135deg, #0c1a0c 0%, #0f1a0f 100%); border: 1px solid #1a3a1a; border-radius: 12px; padding: 20px 24px; margin: 28px 0;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 36px; vertical-align: top; padding-right: 12px;">
              <span style="font-size: 24px;">&#x1F4A1;</span>
            </td>
            <td>
              <p style="color: #4ade80; font-size: 13px; font-weight: 600; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">Pro Tip</p>
              <p style="color: #86efac; font-size: 14px; margin: 0; line-height: 1.6;">Try <strong>Ask Suzzie</strong> &mdash; your AI creative assistant. She can help write visual directions, recommend the best AI providers for your scene, and guide you through every step.</p>
            </td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin: 36px 0 20px;">
        <a href="${appUrl}/projects/new" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #6366f1); color: white; font-size: 16px; font-weight: 600; text-decoration: none; padding: 16px 48px; border-radius: 10px; letter-spacing: 0.3px; box-shadow: 0 4px 20px rgba(124, 58, 237, 0.4);">&#x1F680; Start Creating</a>
      </div>

      <p style="color: #64748b; font-size: 13px; text-align: center; margin: 0; line-height: 1.6;">
        Just reply to this email if you have any questions.<br>We're here to help you make incredible videos.
      </p>
    </div>

    <div style="background-color: #080810; padding: 28px 32px; text-align: center; border-top: 1px solid #1e1e2e;">
      <img src="${assetBase}/neuralcut-icon.png" alt="NeuralCut.AI" width="32" style="display: inline-block; margin-bottom: 12px; opacity: 0.6;" />
      <p style="color: #475569; font-size: 12px; margin: 0 0 8px;">
        <span style="font-weight: 600; color: #64748b;">NeuralCut.AI</span> &mdash; AI-Powered Video Creation
      </p>
      <p style="color: #334155; font-size: 11px; margin: 0;">
        You're receiving this because you created an account on NeuralCut.AI.
      </p>
    </div>

  </div>
</body>
</html>
      `,
      text: `Welcome to NeuralCut.AI, ${fullName}!\n\nYour AI-powered video production studio is ready.\n\nAccount created for: ${newUser.email}\n\n1. Create Your First Project — Click "Create new" and describe your video concept.\n2. Choose Your Visual Style — Pick from 9 art presets like 3D Illustration, Cinematic Realism, Watercolor, Claymation, and more.\n3. Generate & Render — Generate AI video clips, add voiceover and music, then render.\n\nPro Tip: Try Ask Suzzie, your AI creative assistant, for help with visual directions and provider recommendations.\n\nStart creating: ${appUrl}/projects/new\n\nReply to this email if you have any questions.\n\n— NeuralCut.AI`,
    });
    console.log(`[Notifications] Welcome email sent to ${newUser.email}`);
  } catch (err: any) {
    console.error("[Notifications] Welcome email failed:", err.message);
    if (err.response?.body?.errors) {
      console.error("[Notifications] SendGrid errors:", JSON.stringify(err.response.body.errors));
    }
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
