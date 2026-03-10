const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendAdminOtp = async (userEmail, otp) => {
    const adminEmail = process.env.PRIMARY_ADMIN_EMAIL || 'mansikharb.kc@gmail.com';

    // Fallback/Mock if API key is missing
    if (!process.env.RESEND_API_KEY) {
        console.log(`\n-----------------------------------------`);
        console.log(`📧 [MOCK] RESEND API KEY MISSING`);
        console.log(`👤 TO ADMIN: ${adminEmail}`);
        console.log(`🔑 OTP CODE: ${otp} for ${userEmail}`);
        console.log(`-----------------------------------------\n`);
        return { mock: true };
    }

    try {
        const data = await resend.emails.send({
            from: 'SF Auth <onboarding@resend.dev>',
            to: adminEmail,
            subject: 'New Access Request – OTP Code',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px;">
                    <h2 style="color: #4f46e5;">New Access Request</h2>
                    <p>Hello Admin,</p>
                    <p>A new user is requesting access to SyncFlow.</p>
                    <p><strong>User Email:</strong> ${userEmail}</p>
                    <p><strong>Verification OTP (from Admin):</strong></p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #1f2937; margin: 20px 0;">
                        ${otp}
                    </div>
                    <p style="color: #6b7280; font-size: 14px;">This OTP expires in 10 minutes. Please share this code with the user if you wish to allow them to create a pending account.</p>
                </div>
            `
        });

        console.log(`✅ Resend Email sent successfully: ${data.id || 'Success'}`);
        return data;
    } catch (error) {
        console.error(`❌ Resend Error: ${error.message}`);
        throw error;
    }
};

module.exports = { sendAdminOtp };
