const axios = require('axios');

const sendOtpEmail = async (email, fullname, otp) => {
  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_SECRET_KEY;
  const fromEmail = process.env.MAILJET_FROM_EMAIL || 'no-reply@gigiman.com';

  if (!apiKey || !apiSecret) {
    console.warn('=============================================');
    console.warn(`WARNING: Mailjet credentials not configured in .env.`);
    console.warn(`Generated OTP for ${email} (${fullname}): ${otp}`);
    console.warn('=============================================');
    return;
  }

  const token = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  try {
    const response = await axios.post(
      'https://api.mailjet.com/v3.1/send',
      {
        Messages: [
          {
            From: {
              Email: fromEmail,
              Name: 'GigiMan Admin Suite',
            },
            To: [
              {
                Email: email,
                Name: fullname,
              },
            ],
            Subject: 'Security Passcode: Admin OTP Verification',
            TextPart: `Dear ${fullname},\n\nYour security verification passcode is: ${otp}\n\nThis code will expire in 10 minutes. If you did not request this, please contact cybersecurity support immediately.\n\nBest Regards,\nGigiMan Admin Suite`,
            HTMLPart: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 24px; text-align: center; color: white;">
                  <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;">GigiMan Administrative Suite</h1>
                </div>
                <div style="padding: 32px; background-color: #ffffff;">
                  <p style="font-size: 16px; color: #1e293b; margin-top: 0;">Dear <strong>${fullname}</strong>,</p>
                  <p style="font-size: 14px; color: #64748b; line-height: 1.6;">A sign-in request was detected for your administrative account. Please use the following One-Time Password (OTP) to complete the security verification protocol:</p>
                  <div style="margin: 32px 0; text-align: center;">
                    <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: 900; letter-spacing: 0.2em; color: #4f46e5; background-color: #f1f5f9; padding: 12px 28px; border-radius: 6px; border: 1px dashed #cbd5e1; display: inline-block;">${otp}</span>
                  </div>
                  <p style="font-size: 12px; color: #ef4444; font-weight: 600; margin-bottom: 24px;">This passcode is valid for 10 minutes and can only be used once.</p>
                  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                  <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin: 0;">If you did not attempt to sign in to the GigiMan Administrative Suite, please ignore this email or contact cybersecurity administrator immediately.</p>
                </div>
                <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="font-size: 10px; color: #94a3b8; margin: 0; text-transform: uppercase; font-weight: 800; letter-spacing: 0.1em;">© ${new Date().getFullYear()} GigiMan. All rights reserved.</p>
                </div>
              </div>
            `,
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${token}`,
        },
      }
    );

    if (response.status !== 200 && response.status !== 201) {
      console.error('Mailjet API error:', response.data);
      throw new Error('Failed to send OTP email via Mailjet');
    }
  } catch (error) {
    console.error('Error sending email through Mailjet:', error.response?.data || error.message);
    // Print fallback so developer is not locked out in case API call fails
    console.warn(`FALLBACK GENERATED OTP FOR ${email}: ${otp}`);
    throw error;
  }
};

const sendLoginNotificationEmail = async (email, fullname, ipAddress, userAgent) => {
  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_SECRET_KEY;
  const fromEmail = process.env.MAILJET_FROM_EMAIL || 'no-reply@gigiman.com';

  if (!apiKey || !apiSecret) {
    console.warn('=============================================');
    console.warn(`WARNING: Mailjet credentials not configured in .env.`);
    console.warn(`Login notification simulated for ${email} (${fullname})`);
    console.warn(`IP Address: ${ipAddress}`);
    console.warn(`User-Agent: ${userAgent}`);
    console.warn('=============================================');
    return;
  }

  const token = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const now = new Date().toLocaleString();

  try {
    const response = await axios.post(
      'https://api.mailjet.com/v3.1/send',
      {
        Messages: [
          {
            From: {
              Email: fromEmail,
              Name: 'GigiMan Security',
            },
            To: [
              {
                Email: email,
                Name: fullname,
              },
            ],
            Subject: 'Security Notification: New Admin Login Detected',
            TextPart: `Dear ${fullname},\n\nWe detected a successful login to your GigiMan Admin account.\n\nDetails:\n- Time: ${now}\n- IP Address: ${ipAddress}\n- Device: ${userAgent}\n\nIf this was not you, please change your password and contact the security administrator immediately.\n\nBest Regards,\nGigiMan Security Team`,
            HTMLPart: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="background: #0f172a; padding: 24px; text-align: center; color: white;">
                  <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: #ef4444;">Security Alert</h1>
                </div>
                <div style="padding: 32px; background-color: #ffffff;">
                  <p style="font-size: 16px; color: #1e293b; margin-top: 0;">Dear <strong>${fullname}</strong>,</p>
                  <p style="font-size: 14px; color: #64748b; line-height: 1.6;">This email is to confirm a successful sign-in to the GigiMan Administrative Suite for your account.</p>
                  
                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 24px 0;">
                    <h3 style="margin-top: 0; color: #0f172a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Session Details</h3>
                    <table style="width: 100%; font-size: 13px; color: #334155; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 6px 0; font-weight: 600; width: 120px;">Timestamp:</td>
                        <td style="padding: 6px 0; color: #64748b;">${now}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; font-weight: 600;">IP Address:</td>
                        <td style="padding: 6px 0; color: #64748b;">${ipAddress}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; font-weight: 600;">Device/Browser:</td>
                        <td style="padding: 6px 0; color: #64748b; word-break: break-all;">${userAgent}</td>
                      </tr>
                    </table>
                  </div>

                  <p style="font-size: 13px; color: #ef4444; font-weight: 600; line-height: 1.6;">If this login was authorized by you, no action is required.</p>
                  <p style="font-size: 13px; color: #64748b; line-height: 1.6;"><strong>If this was not you:</strong> Please lock your administrative account or change your security credentials immediately, then report this incident to the system security team.</p>
                  
                  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                  <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin: 0;">This security alert is automated. Please do not reply to this email.</p>
                </div>
                <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="font-size: 10px; color: #94a3b8; margin: 0; text-transform: uppercase; font-weight: 800; letter-spacing: 0.1em;">© ${new Date().getFullYear()} GigiMan. All rights reserved.</p>
                </div>
              </div>
            `,
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${token}`,
        },
      }
    );

    if (response.status !== 200 && response.status !== 201) {
      console.error('Mailjet API error:', response.data);
      throw new Error('Failed to send login notification email via Mailjet');
    }
  } catch (error) {
    console.error('Error sending login notification email through Mailjet:', error.response?.data || error.message);
  }
};

module.exports = {
  sendOtpEmail,
  sendLoginNotificationEmail
};
